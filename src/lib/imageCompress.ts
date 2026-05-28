// Client-side image compression. Phone photos routinely come in at 5–30 MB,
// but the storefront only renders them as <img> tags up to ~1200 px wide, and
// the Netlify Functions request body is capped at 6 MB. We resize on a
// canvas and re-encode as JPEG (or WebP), iteratively dropping quality until
// the encoded byte size fits the budget. Returns the encoded `Blob`, plus
// a base64 data URL derived from the same blob for callers that need to
// embed the bytes inline (admin previews, KV-stored email images, etc.).
//
// Used by every admin image input (product gallery, inline thumb, hero
// slides, profile avatar, order review photos).

export interface CompressOptions {
  /** Max long-edge in pixels. Defaults to 2000. */
  maxDim?: number;
  /** Target max bytes for the encoded payload. Defaults to 800 KB. */
  maxBytes?: number;
  /** Initial JPEG quality (0–1). Defaults to 0.85. */
  initialQuality?: number;
  /** Lowest quality we'll fall back to. Defaults to 0.55. */
  minQuality?: number;
  /** Output mime type. Defaults to "image/jpeg". */
  mimeType?: string;
  /**
   * Preserve the source image's alpha channel. When true, the encoder
   * skips the white-flatten step and defaults `mimeType` to `image/png`
   * (lossless, supports alpha). Use this for logos / icons where the
   * uploader expects a transparent background to render against any
   * email theme. Has no effect when `mimeType` is an explicitly opaque
   * format like `image/jpeg`.
   */
  preserveAlpha?: boolean;
}

export interface CompressedImage {
  /** Encoded data URL (already base64). Derived from `blob`; same bytes. */
  url: string;
  /**
   * Encoded image bytes. Use this directly when uploading (e.g. R2) — it
   * avoids the data-URL → base64 → Blob round-trip and is not subject to
   * any `connect-src` CSP that blocks `fetch("data:...")` (see PR #317).
   */
  blob: Blob;
  /** Encoded byte size (== `blob.size`). */
  bytes: number;
  /** Suggested file name; preserves the original stem. */
  fileName: string;
  /** Resulting width × height in pixels. */
  width: number;
  height: number;
}

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err instanceof Event ? new Error("Image decode failed") : err);
    };
    img.src = url;
  });

const replaceExt = (name: string, ext: string): string => {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return `${stem}.${ext}`;
};

const extForMime = (mime: string): string => {
  if (mime === "image/webp") return "webp";
  if (mime === "image/png") return "png";
  if (mime === "image/avif") return "avif";
  return "jpg";
};

// Promise wrapper around `canvas.toBlob`. Rejects if the browser hands back
// a null blob (rare — happens on tainted canvases or out-of-memory, both
// of which we want to surface as an error rather than silently producing
// an empty image).
const canvasToBlob = (
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) =>
        b
          ? resolve(b)
          : reject(new Error(`canvas.toBlob returned null for ${mimeType}`)),
      mimeType,
      quality,
    );
  });

// Encode a Blob as a base64 data URL using FileReader. We avoid
// `canvas.toDataURL()` and `await fetch(dataUrl).blob()` because:
//   1. We already have the Blob from `canvas.toBlob()` — no need to encode
//      twice.
//   2. The site CSP's `connect-src` does not include `data:`, so
//      `fetch("data:...")` is blocked in production (the bug fixed by
//      PR #317). FileReader stays inside the JS runtime and is unaffected.
const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result);
      else reject(new Error("FileReader returned non-string result"));
    };
    reader.onerror = () =>
      reject(reader.error || new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });

/**
 * Resize + re-encode an image file so the encoded payload fits inside
 * `maxBytes`. Returns both the encoded `Blob` (for direct upload) and a
 * base64 data URL derived from the same blob (for inline embedding).
 */
export const compressImage = async (
  file: File,
  opts: CompressOptions = {},
): Promise<CompressedImage> => {
  const {
    maxDim = 2000,
    maxBytes = 800 * 1024,
    initialQuality = 0.85,
    minQuality = 0.55,
    preserveAlpha = false,
    mimeType = preserveAlpha ? "image/png" : "image/jpeg",
  } = opts;

  // Honour the alpha contract: callers that opt in to `preserveAlpha`
  // but also pass a JPEG mime would silently lose transparency, which
  // is exactly the bug this option exists to prevent. Fall back to PNG
  // so the alpha channel survives.
  const outputMime =
    preserveAlpha && mimeType === "image/jpeg" ? "image/png" : mimeType;
  const keepsAlpha = preserveAlpha && outputMime !== "image/jpeg";

  const img = await loadImage(file);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) {
    throw new Error("Could not read image dimensions");
  }

  const longEdge = Math.max(srcW, srcH);
  const scale = longEdge > maxDim ? maxDim / longEdge : 1;
  let targetW = Math.max(1, Math.round(srcW * scale));
  let targetH = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");

  // Re-encoding loop: try the requested quality, then iteratively drop
  // quality, then iteratively drop dimensions if we're still over budget.
  let quality = initialQuality;
  let blob: Blob | null = null;
  const minDim = 320;

  for (let pass = 0; pass < 8; pass++) {
    canvas.width = targetW;
    canvas.height = targetH;
    if (!keepsAlpha) {
      // Flatten any alpha against white for opaque formats (JPEG). For
      // alpha-preserving formats (PNG/WebP) skip this step so the
      // transparent background of the source image survives.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetW, targetH);
    } else {
      // Clear the canvas — `canvas.width = ...` already zeroes it but
      // making it explicit keeps this branch obvious next to the
      // opaque flatten path above.
      ctx.clearRect(0, 0, targetW, targetH);
    }
    ctx.drawImage(img, 0, 0, targetW, targetH);
    blob = await canvasToBlob(canvas, outputMime, quality);
    if (blob.size <= maxBytes) break;
    if (!keepsAlpha && quality > minQuality + 0.05) {
      // Try a lower quality first — cheaper than another resize.
      quality = Math.max(minQuality, quality - 0.1);
      continue;
    }
    // Already at min quality and still over budget — shrink BOTH dimensions
    // by the same factor so we preserve the aspect ratio (independent
    // per-axis floors would stretch panoramas / very tall images).
    if (Math.min(targetW, targetH) <= minDim) {
      // Shorter edge already at the floor; no further proportional shrink
      // possible. Bail with whatever we have rather than distorting.
      break;
    }
    const shrink = 0.85;
    let nextW = targetW * shrink;
    let nextH = targetH * shrink;
    // If the proportional shrink would push the shorter edge below the floor,
    // scale just enough to land that edge exactly on the floor.
    const shorter = Math.min(nextW, nextH);
    if (shorter < minDim) {
      const adjust = minDim / shorter;
      nextW *= adjust;
      nextH *= adjust;
    }
    targetW = Math.max(1, Math.round(nextW));
    targetH = Math.max(1, Math.round(nextH));
  }

  if (!blob) throw new Error("Canvas encoding produced no output");
  const url = await blobToDataUrl(blob);

  return {
    url,
    blob,
    bytes: blob.size,
    fileName: replaceExt(file.name || "image", extForMime(outputMime)),
    width: targetW,
    height: targetH,
  };
};

/** Same idea but for a square avatar (default 512×512 max, 200 KB budget). */
export const compressAvatar = (file: File): Promise<CompressedImage> =>
  compressImage(file, {
    maxDim: 512,
    maxBytes: 200 * 1024,
    initialQuality: 0.85,
    minQuality: 0.5,
  });

export interface VariantSpec {
  /** Long-edge target in pixels. */
  maxDim: number;
  /** Encoded byte budget. Kept loose for variants — WebP at 0.78
   * quality lands well under these on typical phone photos. */
  maxBytes: number;
}

/**
 * Sizes that match the `srcset` widths consumed by `imgAttrs` in
 * `src/lib/productImage.ts`. Bump these together if you ever change
 * the responsive ladder.
 */
export const PRODUCT_VARIANT_SPECS: Record<"sm" | "md" | "lg", VariantSpec> = {
  sm: { maxDim: 400, maxBytes: 60 * 1024 },
  md: { maxDim: 800, maxBytes: 200 * 1024 },
  lg: { maxDim: 1600, maxBytes: 700 * 1024 },
};

export interface ProductImageVariants {
  sm: CompressedImage;
  md: CompressedImage;
  lg: CompressedImage;
  /** Largest-variant intrinsic dimensions; populated for explicit
   * `<img width height>` so the browser reserves the slot before bytes
   * land (CLS fix). */
  dims: { w: number; h: number };
}

/**
 * Generate three WebP variants for a single source file, sized for the
 * `<img srcset>` ladder. Each variant is independent — same file can be
 * uploaded to R2 three times yielding three content-addressed objects
 * (or deduped on identical bytes).
 *
 * Browsers without WebP support fall back to whatever the call site
 * stores as `image.url` (typically the `lg` variant).
 */
export const compressImageVariants = async (
  file: File,
): Promise<ProductImageVariants> => {
  const [sm, md, lg] = await Promise.all([
    compressImage(file, {
      ...PRODUCT_VARIANT_SPECS.sm,
      mimeType: "image/webp",
      initialQuality: 0.78,
      minQuality: 0.5,
    }),
    compressImage(file, {
      ...PRODUCT_VARIANT_SPECS.md,
      mimeType: "image/webp",
      initialQuality: 0.82,
      minQuality: 0.55,
    }),
    compressImage(file, {
      ...PRODUCT_VARIANT_SPECS.lg,
      mimeType: "image/webp",
      initialQuality: 0.85,
      minQuality: 0.6,
    }),
  ]);
  return {
    sm,
    md,
    lg,
    dims: { w: lg.width, h: lg.height },
  };
};
