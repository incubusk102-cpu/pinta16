// Migrate-to-R2 admin card — backfills product photos that are still
// stored as inline `data:image/...` strings in the PRODUCTS KV record
// over to the R2 bucket. After Tier 1 + the R2 binding ship, every
// new upload already lands in R2; this card cleans up the historical
// library in one click.
//
// Endpoint: /api/admin/migrate-r2
//   GET  → scan summary { scanned, withInline, alreadyR2, totalInlineBytes }
//   POST → process up to `batchSize` (default 5) products at a time.
//          The card loops POSTing until `remaining === 0`.
//
// Idempotent + safe to spam-click: products already pointing at
// `/api/r/...` are skipped; identical content always hashes to the
// same R2 key, so re-runs never duplicate objects in the bucket.

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Database, CloudUpload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { jsonAuthHeaders } from "@/lib/api";

interface ScanResponse {
  scanned: number;
  withInline: number;
  alreadyR2: number;
  totalInlineBytes: number;
  scannedAt?: string;
}

interface MigrateBatchResponse {
  migrated: number;
  skipped: number;
  errors: Array<{ id: string; message: string }>;
  remaining: number;
  bytesRecovered: number;
  dryRun?: boolean;
}

const BATCH_SIZE = 5;
const MAX_BATCHES = 200; // hard cap so a runaway loop can't spin forever

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export const MigrateR2Card = () => {
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [progress, setProgress] = useState<{
    migrated: number;
    bytesRecovered: number;
    errors: Array<{ id: string; message: string }>;
    remaining: number | null;
  }>({ migrated: 0, bytesRecovered: 0, errors: [], remaining: null });

  const runScan = useCallback(async () => {
    setScanning(true);
    setScanError(null);
    try {
      const res = await fetch("/api/admin/migrate-r2", {
        method: "GET",
        credentials: "same-origin",
      });
      const data = (await res.json()) as ScanResponse | { error?: string };
      if (!res.ok) {
        const msg =
          (data as { error?: string }).error ||
          `Scan failed (HTTP ${res.status}).`;
        setScanError(msg);
        setScan(null);
        return;
      }
      setScan(data as ScanResponse);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : String(err));
      setScan(null);
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    void runScan();
  }, [runScan]);

  const runMigration = useCallback(async () => {
    setMigrating(true);
    setProgress({
      migrated: 0,
      bytesRecovered: 0,
      errors: [],
      remaining: scan?.withInline ?? null,
    });

    let totalMigrated = 0;
    let totalBytes = 0;
    const errorBag: Array<{ id: string; message: string }> = [];
    let remaining: number | null = scan?.withInline ?? null;

    for (let i = 0; i < MAX_BATCHES; i++) {
      let res: Response;
      try {
        res = await fetch("/api/admin/migrate-r2", {
          method: "POST",
          credentials: "same-origin",
          headers: jsonAuthHeaders(),
          body: JSON.stringify({ batchSize: BATCH_SIZE }),
        });
      } catch (err) {
        errorBag.push({
          id: "network",
          message: err instanceof Error ? err.message : String(err),
        });
        break;
      }

      let data: MigrateBatchResponse | { error?: string };
      try {
        data = (await res.json()) as MigrateBatchResponse | { error?: string };
      } catch {
        errorBag.push({
          id: `batch-${i}`,
          message: `Non-JSON response (HTTP ${res.status}).`,
        });
        break;
      }
      if (!res.ok) {
        const msg =
          (data as { error?: string }).error ||
          `Batch failed (HTTP ${res.status}).`;
        errorBag.push({ id: `batch-${i}`, message: msg });
        break;
      }
      const batch = data as MigrateBatchResponse;
      totalMigrated += batch.migrated;
      totalBytes += batch.bytesRecovered;
      if (batch.errors?.length) errorBag.push(...batch.errors);
      remaining = batch.remaining;
      setProgress({
        migrated: totalMigrated,
        bytesRecovered: totalBytes,
        errors: [...errorBag],
        remaining,
      });
      if (batch.remaining <= 0) break;
      if (batch.migrated === 0 && batch.errors?.length) break; // avoid infinite loop on stuck product
    }

    setMigrating(false);
    if (errorBag.length) {
      toast.warning(
        `Migration finished with ${errorBag.length} error${errorBag.length === 1 ? "" : "s"}. Migrated ${totalMigrated} products (${formatBytes(totalBytes)} freed from KV).`,
      );
    } else if (totalMigrated > 0) {
      toast.success(
        `Migrated ${totalMigrated} products to R2 (${formatBytes(totalBytes)} freed from KV).`,
      );
    } else {
      toast.message("Nothing to migrate — every product already lives in R2.");
    }
    void runScan();
  }, [runScan, scan]);

  const noWorkLeft = scan != null && scan.withInline === 0;

  return (
    <section className="rounded-2xl border bg-card p-5 space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <h2 className="text-base font-display flex items-center gap-2">
            <CloudUpload className="w-4 h-4 text-emerald-600" />
            Migrate inline images to R2
          </h2>
          <p className="text-xs text-muted-foreground max-w-2xl">
            Backfills any product whose photo is still stored as a base64 string
            inside the PRODUCTS KV record over to the R2 bucket. After this
            runs, <code>/api/products</code> drops from a multi-megabyte payload
            to a few kilobytes and product photos are served from Cloudflare's
            CDN with immutable cache headers. Idempotent — safe to re-run.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={runScan}
          disabled={scanning || migrating}
        >
          {scanning ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-1" />
          )}
          Rescan
        </Button>
      </header>

      {scanError ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          {scanError}
        </div>
      ) : null}

      {scan ? (
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="rounded-md border border-border/60 px-3 py-2">
            <dt className="text-xs text-muted-foreground">Total products</dt>
            <dd className="font-medium">{scan.scanned}</dd>
          </div>
          <div className="rounded-md border border-border/60 px-3 py-2">
            <dt className="text-xs text-muted-foreground">
              Inline (need work)
            </dt>
            <dd className="font-medium">{scan.withInline}</dd>
          </div>
          <div className="rounded-md border border-border/60 px-3 py-2">
            <dt className="text-xs text-muted-foreground">Already on R2</dt>
            <dd className="font-medium">{scan.alreadyR2}</dd>
          </div>
          <div className="rounded-md border border-border/60 px-3 py-2">
            <dt className="text-xs text-muted-foreground">KV payload bloat</dt>
            <dd className="font-medium">
              {formatBytes(scan.totalInlineBytes)}
            </dd>
          </div>
        </dl>
      ) : null}

      <div className="flex items-center gap-3 flex-wrap">
        <Button
          type="button"
          onClick={runMigration}
          disabled={migrating || scanning || noWorkLeft}
        >
          {migrating ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Database className="w-4 h-4 mr-1" />
          )}
          {migrating ? "Migrating…" : "Migrate now"}
        </Button>
        {noWorkLeft ? (
          <span className="text-xs text-muted-foreground">
            All product images already live in R2.
          </span>
        ) : null}
      </div>

      {migrating || progress.migrated > 0 ? (
        <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2 text-xs space-y-1">
          <div>
            Migrated: <strong>{progress.migrated}</strong>
            {progress.remaining != null ? (
              <>
                {" "}
                · Remaining: <strong>{progress.remaining}</strong>
              </>
            ) : null}
            {" · "}
            Freed from KV:{" "}
            <strong>{formatBytes(progress.bytesRecovered)}</strong>
          </div>
          {progress.errors.length > 0 ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-rose-600">
                {progress.errors.length} error
                {progress.errors.length === 1 ? "" : "s"}
              </summary>
              <ul className="mt-1 list-disc pl-5 text-rose-700">
                {progress.errors.slice(0, 10).map((e, i) => (
                  <li key={`${e.id}-${i}`}>
                    <code>{e.id}</code>: {e.message}
                  </li>
                ))}
                {progress.errors.length > 10 ? (
                  <li>…and {progress.errors.length - 10} more.</li>
                ) : null}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
