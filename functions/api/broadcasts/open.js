// GET /api/broadcasts/open?b=<broadcastId>&r=<recipientHash>
//
// Always returns a 1x1 transparent GIF so the open is reflected in
// the recipient's mail client. We record the open into KV via the
// helpers in `_lib/broadcasts.js`. Tracking writes are best-effort —
// the pixel responds even if the write fails so the image never
// appears broken in the mail client.

import { initRequestContext } from "../_lib/handler-wrapper.js";
import { recordOpen } from "../_lib/broadcasts.js";

// 1x1 transparent GIF, base64-decoded once at module load. 43 bytes.
const PIXEL_BYTES = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
  (c) => c.charCodeAt(0),
);

const pixelResponse = () =>
  new Response(PIXEL_BYTES, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL_BYTES.byteLength),
      // Discourage clients from caching the pixel so repeat opens
      // register. Gmail proxies will still cache aggressively but
      // most clients honour this for tracker pixels.
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });

export const onRequestGet = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;

  const url = new URL(request.url);
  const broadcastId = url.searchParams.get("b") || "";
  const recipientHash = url.searchParams.get("r") || "";

  if (broadcastId && recipientHash) {
    try {
      await recordOpen(broadcastId, recipientHash);
    } catch {
      // Swallow — tracking must never break the pixel response.
    }
  }
  return pixelResponse();
};
