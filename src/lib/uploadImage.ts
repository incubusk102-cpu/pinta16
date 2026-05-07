// Tiny wrapper that POSTs an image Blob to /api/uploads (R2-backed).
//
// Falls back to `null` on any failure so callers can revert to the
// legacy data-URL flow without a hard error. The endpoint itself
// returns 503 when the R2 binding is missing on the deploy, which we
// surface here as a `kind: "fallback"` result.

import { getAdminToken } from "@/contexts/AdminAuthContext";

export interface UploadResult {
  url: string;
  bytes: number;
  contentType: string;
  deduped: boolean;
}

export type UploadOutcome =
  | { kind: "uploaded"; result: UploadResult }
  | { kind: "fallback"; reason: string }
  | { kind: "error"; message: string };

/**
 * Send an image Blob to /api/uploads. The server hashes the bytes and
 * stores them in R2 at a content-addressable key, returning a stable
 * URL.
 *
 * - "uploaded" → use the returned URL.
 * - "fallback" → R2 is not configured on this deploy; caller should use
 *                its existing data-URL path. This is a normal, expected
 *                outcome on deploys that haven't bound the bucket.
 * - "error"    → unexpected failure (network, server error). Caller
 *                may also choose to fall back, but should surface the
 *                message to the admin so they know it happened.
 */
export const uploadImageToR2 = async (blob: Blob): Promise<UploadOutcome> => {
  // Admin endpoint; needs the same Bearer token every other admin
  // POST sends.
  const token = getAdminToken();
  if (!token) {
    return { kind: "error", message: "Not signed in." };
  }

  let res: Response;
  try {
    res = await fetch("/api/uploads", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": blob.type || "application/octet-stream",
      },
      body: blob,
    });
  } catch (err) {
    return {
      kind: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  if (res.status === 503) {
    return { kind: "fallback", reason: "r2-not-configured" };
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string; message?: string };
      detail = data.message || data.error || detail;
    } catch {
      // ignore — keep the generic HTTP status message
    }
    return { kind: "error", message: detail };
  }

  try {
    const data = (await res.json()) as UploadResult;
    if (typeof data.url !== "string" || !data.url) {
      return { kind: "error", message: "Server returned no URL." };
    }
    return { kind: "uploaded", result: data };
  } catch (err) {
    return {
      kind: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
};

// `dataUrlToBlob` lived here previously as a helper to convert
// `compressImage()`'s data-URL output back into a Blob for upload.
// `compressImage()` now returns the encoded `Blob` directly (see
// `src/lib/imageCompress.ts`), so callers should use `variant.blob`
// instead. Removing the helper avoids a foot-gun where someone reaches
// for `fetch(dataUrl)` again and trips the production CSP.
