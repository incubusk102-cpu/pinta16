// Tiny wrapper that POSTs a video Blob to /api/video-uploads (R2-backed).
//
// Mirrors `src/lib/uploadImage.ts` for images. Same outcome shape so
// callers can render identical UI (uploaded / fallback / error). The
// only differences from the image helper are the endpoint URL and the
// MIME types it expects (validated server-side).

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
 * Send a video Blob to /api/video-uploads. The server hashes the bytes
 * and stores them in R2 at a content-addressable key under
 * `products/videos/`, returning a stable URL.
 *
 * - "uploaded" → use the returned URL.
 * - "fallback" → R2 is not configured on this deploy. Caller should
 *                ask the admin to host the video externally and paste
 *                the URL into the URL field instead. There is NO
 *                in-payload data-URL fallback for videos: a 30 MB
 *                base64 blob would explode KV size and the product
 *                JSON list payload.
 * - "error"    → unexpected failure. Surface the message to the admin.
 */
export const uploadVideoToR2 = async (blob: Blob): Promise<UploadOutcome> => {
  const token = getAdminToken();
  if (!token) {
    return { kind: "error", message: "Not signed in." };
  }

  let res: Response;
  try {
    res = await fetch("/api/video-uploads", {
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
