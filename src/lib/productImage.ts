// Helpers for emitting `<img srcset>` from a ProductImage record.
//
// The upload pipeline produces three WebP variants per photo
// (`sm` ≈ 400 w, `md` ≈ 800 w, `lg` ≈ 1600 w) and stores them in
// `image.urls`. Render sites can call `imgAttrs(image, sizes)` to get
// a ready-to-spread `{ src, srcSet, sizes, width, height }` object.
//
// Fully back-compat: when `urls` / `dims` are missing (legacy single-
// size R2 entries or inline data URLs), the helpers return just
// `{ src }` and the render site behaves exactly like before this PR.

import type { ProductImage } from "@/contexts/ProductContext";

/**
 * Variant widths emitted by `compressImageVariants` and consumed by
 * `srcset`. Adding a width here means: bump `compressImageVariants`
 * to produce the new size, run the migration tool to backfill, and
 * include it in `imgAttrs`. Order matters — smallest first.
 */
export const VARIANT_WIDTHS = {
  sm: 400,
  md: 800,
  lg: 1600,
} as const satisfies Record<"sm" | "md" | "lg", number>;

export type VariantKey = keyof typeof VARIANT_WIDTHS;

/**
 * Default `sizes` attribute used by gallery cards. Roughly:
 *   phones        → 1 card per row → 100 vw
 *   tablets       → 2 cards / row  → 50 vw
 *   desktop       → 3 cards / row  → 33 vw
 * Per call site can override via `imgAttrs(image, "100vw")` etc.
 */
export const DEFAULT_GALLERY_SIZES =
  "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw";

const buildSrcSet = (urls: ProductImage["urls"]): string | undefined => {
  if (!urls) return undefined;
  const parts: string[] = [];
  for (const key of Object.keys(VARIANT_WIDTHS) as VariantKey[]) {
    const url = urls[key];
    if (typeof url === "string" && url) {
      parts.push(`${url} ${VARIANT_WIDTHS[key]}w`);
    }
  }
  return parts.length >= 2 ? parts.join(", ") : undefined;
};

/**
 * Pick a sensible single-source URL for a given preferred variant.
 * Falls through `preferred → md → lg → sm → image.url` so callers
 * always get *something* renderable. Used for the `src` attribute
 * (browsers without `srcset` fall back to this).
 */
export const variantSrc = (
  image: Pick<ProductImage, "url" | "urls">,
  preferred: VariantKey = "md",
): string => {
  const urls = image.urls;
  if (urls) {
    const order: VariantKey[] = [preferred, "md", "lg", "sm"];
    for (const key of order) {
      const v = urls[key];
      if (typeof v === "string" && v) return v;
    }
  }
  return image.url;
};

export interface ImgAttrs {
  src: string;
  srcSet?: string;
  sizes?: string;
  width?: number;
  height?: number;
}

/**
 * Build a ready-to-spread set of `<img>` attributes for a
 * `ProductImage`. Pass the call site's expected `sizes` (defaults
 * to the gallery sizing). Falls back gracefully when variants /
 * dims are missing.
 */
export const imgAttrs = (
  image: Pick<ProductImage, "url" | "urls" | "dims"> | undefined,
  sizes: string = DEFAULT_GALLERY_SIZES,
  preferred: VariantKey = "md",
): ImgAttrs => {
  if (!image || !image.url) return { src: "" };
  const srcSet = buildSrcSet(image.urls);
  const out: ImgAttrs = {
    src: variantSrc(image, preferred),
  };
  if (srcSet) {
    out.srcSet = srcSet;
    out.sizes = sizes;
  }
  if (image.dims?.w && image.dims?.h) {
    out.width = image.dims.w;
    out.height = image.dims.h;
  }
  return out;
};

/**
 * Convenience wrapper: build attrs from a plain url-or-image.
 * Render sites that only have `string` (no ProductImage object)
 * still get a coherent `{ src }` without conditionals.
 */
export const imgAttrsFromUrl = (url: string): ImgAttrs => ({ src: url });

/**
 * Common case used by every rail / card: the product has a top-level
 * `image: string` (legacy field, always set) and optionally
 * `images: ProductImage[]` (the canonical multi-photo source). When
 * the first ProductImage has variants, emit srcset; otherwise return
 * a single `src` pointing at the top-level string. Either way, the
 * caller's `<img>` ends up with renderable attrs.
 */
export const imgAttrsFromProduct = (
  product: { image?: string; images?: ProductImage[] } | null | undefined,
  sizes?: string,
  preferred: VariantKey = "md",
): ImgAttrs => {
  if (!product) return { src: "" };
  const first = product.images?.[0];
  if (first) {
    const attrs = imgAttrs(first, sizes, preferred);
    if (attrs.src) return attrs;
  }
  return { src: product.image ?? "" };
};
