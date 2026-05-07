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

// Convenience: turn a base64 data URL back into a Blob so we can pipe
// the existing compressImage() output (which returns a data URL) into
// uploadImageToR2 without re-running the canvas pipeline.
//
// Decodes the base64 manually rather than `fetch(dataUrl)` because the
// site CSP's `connect-src` does not list `data:`, and Cloudflare Pages
// enforces the header in production. `fetch("data:...")` is treated as
// a connect and gets blocked, which previously caused
// MigrateVariantsCard's R2 backfill to error out with "Failed to read
// encoded variants from canvas." for every image.
export const dataUrlToBlob = async (dataUrl: string): Promise<Blob | null> => {
  if (!dataUrl.startsWith("data:")) return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const meta = dataUrl.slice(5, comma); // strip "data:"
  const isBase64 = /;base64$/i.test(meta);
  const mimeType = isBase64
    ? meta.slice(0, meta.length - ";base64".length) ||
      "application/octet-stream"
    : meta || "application/octet-stream";
  const payload = dataUrl.slice(comma + 1);
  try {
    if (isBase64) {
      const binary = atob(payload);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new Blob([bytes], { type: mimeType });
    }
    // Non-base64 data URLs (rare for our pipeline — canvas.toDataURL
    // always emits base64 — but support them for completeness).
    const text = decodeURIComponent(payload);
    return new Blob([text], { type: mimeType });
  } catch {
    return null;
  }
};
