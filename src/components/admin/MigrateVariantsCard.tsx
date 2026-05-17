// Migrate-variants admin card — adds responsive WebP variants
// (sm/md/lg) to existing R2-backed product photos that were uploaded
// before the multi-variant pipeline shipped.
//
// Fully client-side: reads each existing image via the same /api/r/
// proxy the storefront uses, runs the bytes through
// `compressImageVariants` in the browser canvas, uploads the three
// resulting WebPs back to R2 (which dedupes by content hash), and
// then calls the existing `updateProduct` mutation to attach the
// new `urls` + `dims` to each ProductImage.
//
// Idempotent + safe to re-run: products whose images already have
// `urls.sm/md/lg` are skipped. New uploads from the regular admin
// gallery already produce variants automatically; this card only
// exists for historical records.

import { useCallback, useMemo, useState } from "react";
import { Loader2, RefreshCw, Database, Images, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  useProducts,
  type Product,
  type ProductImage,
} from "@/contexts/ProductContext";
import { compressImageVariants } from "@/lib/imageCompress";
import { hashImageDataUrl } from "@/lib/imageHash";
import { uploadImageToR2 } from "@/lib/uploadImage";
import { VARIANT_WIDTHS } from "@/lib/productImage";

// Same per-browser dismissal pattern as `MigrateR2Card`. Separate key
// so each migration can be hidden independently — operators sometimes
// finish the R2 backfill long before the variants regeneration.
const DISMISS_KEY = "canvhub_hide_variants_migration";

interface ScanRow {
  productId: string;
  productTitle: string;
  imageIndices: number[];
}

const needsVariants = (img: ProductImage): boolean => {
  const u = img.urls;
  if (!u) return true;
  // Require all three widths defined and non-empty.
  return !u.sm || !u.md || !u.lg;
};

const isMigratableUrl = (url: string): boolean => {
  if (!url) return false;
  // Same-origin proxy URL or any absolute URL is fetchable. Skip
  // legacy data URIs (those are tiny and predate the migration —
  // operator can re-upload via the admin gallery).
  if (url.startsWith("data:")) return false;
  return true;
};

export const MigrateVariantsCard = () => {
  const { products, updateProduct } = useProducts();

  // Initialize from localStorage synchronously so dismissed cards never
  // flash on mount. SSR-safe: `typeof window` guards the access.
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode / disabled storage — still hide for the rest of this tab */
    }
    setDismissed(true);
  }, []);

  const scan: ScanRow[] = useMemo(() => {
    const rows: ScanRow[] = [];
    for (const p of products) {
      const indices: number[] = [];
      const list = p.images ?? [];
      list.forEach((img, idx) => {
        if (needsVariants(img) && isMigratableUrl(img.url)) {
          indices.push(idx);
        }
      });
      if (indices.length > 0) {
        rows.push({
          productId: p.id,
          productTitle: p.title,
          imageIndices: indices,
        });
      }
    }
    return rows;
  }, [products]);

  const totalImagesPending = useMemo(
    () => scan.reduce((acc, r) => acc + r.imageIndices.length, 0),
    [scan],
  );

  const [migrating, setMigrating] = useState(false);
  const [progress, setProgress] = useState<{
    productsDone: number;
    imagesDone: number;
    errors: Array<{ id: string; message: string }>;
  }>({ productsDone: 0, imagesDone: 0, errors: [] });

  // Re-encode a single ProductImage at three widths, upload all three
  // to R2 (content-addressed; identical bytes dedupe), and return the
  // new record. Throws on any non-recoverable failure so the parent
  // can report a per-product error and move on.
  const migrateOneImage = useCallback(
    async (img: ProductImage): Promise<ProductImage> => {
      const res = await fetch(img.url, { credentials: "same-origin" });
      if (!res.ok) {
        throw new Error(
          `Could not fetch original (HTTP ${res.status} from ${img.url})`,
        );
      }
      const blob = await res.blob();
      const file = new File([blob], img.fileName || "source", {
        type: blob.type || "image/jpeg",
      });

      const variants = await compressImageVariants(file);
      // Hash the largest variant — same content always hashes the same
      // so re-uploads dedupe in R2.
      const hash = await hashImageDataUrl(variants.lg.url);

      // Use the Blobs canvas.toBlob() emitted directly — no data-URL
      // round-trip and no CSP `connect-src` issues with `fetch("data:...")`.
      const outcomes = await Promise.all([
        uploadImageToR2(variants.sm.blob),
        uploadImageToR2(variants.md.blob),
        uploadImageToR2(variants.lg.blob),
      ]);
      const allUploaded = outcomes.every((o) => o.kind === "uploaded");
      if (!allUploaded) {
        const errored = outcomes.find((o) => o.kind === "error");
        if (errored && errored.kind === "error") {
          throw new Error(`R2 upload failed: ${errored.message}`);
        }
        const fellBack = outcomes.find((o) => o.kind === "fallback");
        if (fellBack) {
          throw new Error("R2 binding missing on this deploy.");
        }
        throw new Error("R2 upload failed (unknown).");
      }

      const [smOut, mdOut, lgOut] = outcomes;
      return {
        ...img,
        // Keep the legacy single-url field pointing at the largest
        // variant so any code path that still reads only `url`
        // continues to work and gets a sharp render.
        url: lgOut.kind === "uploaded" ? lgOut.result.url : img.url,
        fileName: variants.lg.fileName,
        bytes: variants.lg.bytes,
        hash: hash || img.hash,
        urls: {
          sm: smOut.kind === "uploaded" ? smOut.result.url : undefined,
          md: mdOut.kind === "uploaded" ? mdOut.result.url : undefined,
          lg: lgOut.kind === "uploaded" ? lgOut.result.url : undefined,
        },
        dims: { w: variants.dims.w, h: variants.dims.h },
      };
    },
    [],
  );

  const runMigration = useCallback(async () => {
    if (migrating || scan.length === 0) return;
    setMigrating(true);
    setProgress({ productsDone: 0, imagesDone: 0, errors: [] });

    const errors: Array<{ id: string; message: string }> = [];
    let productsDone = 0;
    let imagesDone = 0;

    for (const row of scan) {
      const product = products.find(
        (p): p is Product => p.id === row.productId,
      );
      if (!product) continue;
      const images = product.images ?? [];
      const next: ProductImage[] = [...images];
      let touched = false;
      for (const idx of row.imageIndices) {
        const current = next[idx];
        if (!current) continue;
        try {
          const updated = await migrateOneImage(current);
          next[idx] = updated;
          touched = true;
          imagesDone += 1;
          setProgress((prev) => ({ ...prev, imagesDone }));
        } catch (err) {
          errors.push({
            id: `${row.productId}#${idx}`,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
      if (touched) {
        try {
          await updateProduct(product.id, { images: next });
        } catch (err) {
          errors.push({
            id: row.productId,
            message: `Saved variants but updateProduct failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }
      productsDone += 1;
      setProgress((prev) => ({ ...prev, productsDone, errors: [...errors] }));
    }

    setMigrating(false);
    if (errors.length === 0 && imagesDone > 0) {
      toast.success(
        `Generated variants for ${imagesDone} image${imagesDone === 1 ? "" : "s"} across ${productsDone} product${productsDone === 1 ? "" : "s"}.`,
      );
    } else if (errors.length > 0) {
      toast.warning(
        `Finished with ${errors.length} error${errors.length === 1 ? "" : "s"}. Generated ${imagesDone} variant set${imagesDone === 1 ? "" : "s"}.`,
      );
    } else {
      toast.message("Nothing to do — every image already has variants.");
    }
  }, [migrating, scan, products, migrateOneImage, updateProduct]);

  const noWorkLeft = scan.length === 0;

  if (dismissed) return null;

  return (
    <section className="rounded-2xl border bg-card p-5 space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <h2 className="text-base font-display flex items-center gap-2">
            <Images className="w-4 h-4 text-emerald-600" />
            Generate responsive variants
          </h2>
          <p className="text-xs text-muted-foreground max-w-2xl">
            Re-encodes each existing R2 product photo into three WebP widths (
            {VARIANT_WIDTHS.sm}, {VARIANT_WIDTHS.md}, and {VARIANT_WIDTHS.lg}
            &nbsp;px) and attaches them to the product record. Storefront cards
            then download the smallest variant that fits the slot — phones grab
            a ~30&nbsp;KB thumbnail instead of the full photo. Runs entirely in
            your browser; identical bytes dedupe in R2. Idempotent — safe to
            re-run.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setProgress({ productsDone: 0, imagesDone: 0, errors: [] })
            }
            disabled={migrating}
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Reset
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={dismiss}
            disabled={migrating}
            title="Hide this card on this browser"
            aria-label="Hide this card"
          >
            <X className="w-4 h-4 mr-1" />
            Hide completed
          </Button>
        </div>
      </header>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div className="rounded-md border border-border/60 px-3 py-2">
          <dt className="text-xs text-muted-foreground">Products with gaps</dt>
          <dd className="font-medium">{scan.length}</dd>
        </div>
        <div className="rounded-md border border-border/60 px-3 py-2">
          <dt className="text-xs text-muted-foreground">Images pending</dt>
          <dd className="font-medium">{totalImagesPending}</dd>
        </div>
        <div className="rounded-md border border-border/60 px-3 py-2">
          <dt className="text-xs text-muted-foreground">Variant widths</dt>
          <dd className="font-medium text-xs">
            {VARIANT_WIDTHS.sm} / {VARIANT_WIDTHS.md} / {VARIANT_WIDTHS.lg}
          </dd>
        </div>
        <div className="rounded-md border border-border/60 px-3 py-2">
          <dt className="text-xs text-muted-foreground">Format</dt>
          <dd className="font-medium">WebP</dd>
        </div>
      </dl>

      <div className="flex items-center gap-3 flex-wrap">
        <Button
          type="button"
          onClick={runMigration}
          disabled={migrating || noWorkLeft}
        >
          {migrating ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Database className="w-4 h-4 mr-1" />
          )}
          {migrating ? "Generating…" : "Generate variants"}
        </Button>
        {noWorkLeft ? (
          <span className="text-xs text-muted-foreground">
            All product images already have variants.
          </span>
        ) : null}
      </div>

      {migrating || progress.imagesDone > 0 || progress.errors.length > 0 ? (
        <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2 text-xs space-y-1">
          <div>
            Products processed: <strong>{progress.productsDone}</strong>
            {" · "}
            Images updated: <strong>{progress.imagesDone}</strong>
          </div>
          {progress.errors.length > 0 ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-rose-600">
                {progress.errors.length} error
                {progress.errors.length === 1 ? "" : "s"}
              </summary>
              <ul className="mt-1 list-disc pl-5 text-rose-700">
                {progress.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>
                    <code className="text-[11px]">{e.id}</code>: {e.message}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

export default MigrateVariantsCard;
