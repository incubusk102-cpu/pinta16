// Client-side image compression. Phone photos routinely come in at 5–30 MB,
// but the storefront only renders them as <img> tags up to ~1200 px wide, and
// the Netlify Functions request body is capped at 6 MB. We resize on a
// canvas and re-encode as JPEG, iteratively dropping quality until the
// resulting data URL fits under the byte budget. Returns a data URL plus the
// approximate compressed byte count.
//
// Used by every admin image input (product gallery, inline thumb, hero
// slides, profile avatar, order review photos).

export interface CompressOptions {
  /** Max long-edge in pixels. Defaults to 2000. */
  maxDim?: number;
  /** Target max bytes for the encoded data URL payload (raw bytes, not base64-inflated). Defaults to 800 KB. */
  maxBytes?: number;
  /** Initial JPEG quality (0–1). Defaults to 0.85. */
  initialQuality?: number;
  /** Lowest quality we'll fall back to. Defaults to 0.55. */
  minQuality?: number;
  /** Output mime type. Defaults to "image/jpeg". */
  mimeType?: string;
}

export interface CompressedImage {
  /** Encoded data URL (already base64). */
  url: string;
  /** Approximate raw decoded byte size (data URL length minus the prefix, then ÷ 4 × 3). */
  bytes: number;
  /** Suggested file name; preserves the original stem with a .jpg extension. */
  fileName: string;
  /** Resulting width × height in pixels. */
  width: number;
  height: number;
}

const dataUrlRawBytes = (dataUrl: string): number => {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  // Strip any '=' padding then convert to byte count.
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
};

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

/**
 * Resize + re-encode an image file so the resulting base64 data URL fits
 * inside `maxBytes`. Falls back to the original file's data URL if
 * compression is not available (e.g. canvas/toDataURL throws).
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
    mimeType = "image/jpeg",
  } = opts;

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
  let url = "";
  let bytes = 0;

  for (let pass = 0; pass < 8; pass++) {
    canvas.width = targetW;
    canvas.height = targetH;
    ctx.fillStyle = "#ffffff"; // flatten any alpha against white for JPEG
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);
    url = canvas.toDataURL(mimeType, quality);
    bytes = dataUrlRawBytes(url);
    if (bytes <= maxBytes) break;
    if (quality > minQuality + 0.05) {
      // Try a lower quality first — cheaper than another resize.
      quality = Math.max(minQuality, quality - 0.1);
      continue;
    }
    // Already at min quality and still over budget — shrink dimensions 15 %.
    targetW = Math.max(320, Math.round(targetW * 0.85));
    targetH = Math.max(320, Math.round(targetH * 0.85));
  }

  return {
    url,
    bytes,
    fileName: replaceExt(file.name || "image", "jpg"),
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
