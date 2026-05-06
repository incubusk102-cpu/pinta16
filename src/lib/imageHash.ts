// Compute a SHA-256 hex digest of an image given as a base64 data URL.
//
// We use this to dedupe admin uploads — two photos that compress to
// identical bytes (re-uploaded same file, etc.) should not become two
// separate gallery entries. Hashing happens in the browser right after
// compression, so the small cost (~50 ms on a 800 KB JPEG) lands inside
// the existing upload flow without blocking.
//
// SHA-256 is overkill for this purpose, but `crypto.subtle.digest` only
// supports SHA-{1,256,384,512}, and the hex output is a comfortable
// 64 chars to store in KV. Collisions are not a concern.

const HEX = "0123456789abcdef";

const bytesToHex = (bytes: ArrayBuffer): string => {
  const view = new Uint8Array(bytes);
  let out = "";
  for (let i = 0; i < view.length; i++) {
    const byte = view[i];
    out += HEX[byte >> 4] + HEX[byte & 0x0f];
  }
  return out;
};

const decodeBase64 = (b64: string): Uint8Array => {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
};

/**
 * Hash the binary content of an image data URL. Returns a 64-char
 * lowercase hex string. Returns the empty string if hashing isn't
 * available in this environment (e.g. an old browser without
 * `crypto.subtle`) or if the input doesn't look like a data URL —
 * callers should treat an empty hash as "unknown" and skip
 * hash-based dedupe rather than blocking the upload.
 */
export const hashImageDataUrl = async (dataUrl: string): Promise<string> => {
  if (typeof window === "undefined") return "";
  if (!dataUrl) return "";
  const subtle = window.crypto?.subtle;
  if (!subtle?.digest) return "";

  const comma = dataUrl.indexOf(",");
  if (comma < 0) return "";
  const b64 = dataUrl.slice(comma + 1);
  try {
    const bytes = decodeBase64(b64);
    // Copy into a fresh ArrayBuffer so the SubtleCrypto signature is
    // happy on TS configs where Uint8Array's backing store widens to
    // `ArrayBufferLike` (TS 5.7 / DOM lib quirk). The clone is cheap
    // for ~800 KB compressed JPEGs.
    const buf = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buf).set(bytes);
    const digest = await subtle.digest("SHA-256", buf);
    return bytesToHex(digest);
  } catch {
    return "";
  }
};

/** Normalise a title for case-insensitive equality checks. */
export const normaliseTitleForDedupe = (title: string): string =>
  title.trim().toLowerCase().replace(/\s+/g, " ");

export interface DedupeCandidate {
  /** Stable identifier for the existing item; included so callers can exclude self when editing. */
  id: string;
  title: string;
  /** Optional SHA-256 hex; absent on legacy entries and on default artworks. */
  imageHash?: string;
}

export type DuplicateMatch =
  | { kind: "title"; matchedTitle: string }
  | { kind: "image"; matchedTitle: string };

/**
 * Block-list check for new uploads. Returns the first matching reason
 * (title or image hash), or `null` if the upload is unique. Title
 * comparison is case- and whitespace-insensitive; hash comparison is
 * exact. `excludeId` allows the editor flow to ignore the row being
 * edited.
 */
export const findUploadDuplicate = (
  candidate: { title: string; imageHash?: string },
  existing: DedupeCandidate[],
  excludeId?: string,
): DuplicateMatch | null => {
  const candidateTitle = normaliseTitleForDedupe(candidate.title);
  const candidateHash = candidate.imageHash || "";
  for (const item of existing) {
    if (excludeId && item.id === excludeId) continue;
    if (
      candidateTitle &&
      normaliseTitleForDedupe(item.title) === candidateTitle
    ) {
      return { kind: "title", matchedTitle: item.title };
    }
    if (candidateHash && item.imageHash && item.imageHash === candidateHash) {
      return { kind: "image", matchedTitle: item.title };
    }
  }
  return null;
};
