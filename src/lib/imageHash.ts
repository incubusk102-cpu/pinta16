// SHA-256 fingerprint helpers used by the admin upload form to spot
// duplicate images. Hashes are computed once over the *compressed* image
// bytes (the same bytes that get stored on the product), so they're
// stable across re-renders and stable enough to match a re-upload of the
// same source photo (compression is deterministic for the same input).

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const sha256 = async (data: ArrayBuffer | Uint8Array): Promise<string> => {
  const buf = data instanceof Uint8Array ? data.buffer.slice(0) : data;
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return toHex(new Uint8Array(digest));
};

/**
 * Decode a `data:` URL's base64 payload back to bytes and return its
 * SHA-256 hex digest. Returns `null` if the input isn't a base64 data
 * URL we can decode.
 */
export const hashDataUrl = async (dataUrl: string): Promise<string | null> => {
  if (!dataUrl.startsWith("data:")) return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const meta = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  if (!meta.includes("base64")) return null;
  try {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return sha256(bytes);
  } catch {
    return null;
  }
};

/**
 * Best-effort hash for an image URL. For inline base64 data URLs this
 * decodes and hashes the bytes; for http(s) URLs (e.g. R2) it hashes
 * the URL itself, since R2-uploaded images are content-addressed by
 * the bucket and share-the-same-URL ⇒ same image.
 */
export const hashImageUrl = async (url: string): Promise<string | null> => {
  if (!url) return null;
  if (url.startsWith("data:")) return hashDataUrl(url);
  // For non-data URLs (R2, http(s)), the URL itself is the identity.
  // Hash it so the comparison value lives in the same space as the
  // data-URL hashes.
  return sha256(new TextEncoder().encode(url));
};
