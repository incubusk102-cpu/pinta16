// /api/video-uploads — admin-only video upload to R2.
//
// Sibling of /api/uploads.js (image uploads). Kept as a separate handler
// because:
//   - Different MIME allowlist (video/* vs image/* bitmaps).
//   - Larger byte cap (50 MB vs 5 MB).
//   - Stored under a separate `products/videos/` prefix in R2.
//
// The cap matches a "studio process clip" — short, silent, ~10–30 s.
// Anything bigger should be hosted externally (Mux, Cloudinary, etc.)
// and pasted as a URL in the admin form. We deliberately do NOT do
// chunked / multipart uploads: keeping this single-shot keeps the
// surface area small and matches how the image pipeline works.
//
// Returns 503 when R2 is not bound on the deploy so the admin UI can
// show a clear message rather than a network error.

import { initRequestContext } from "./_lib/handler-wrapper.js";
import { isAuthenticated } from "./_lib/admin-auth.js";

// Header-only event shim. We must NOT consume the request body before
// reading the binary bytes below — see the matching note in
// `functions/api/uploads.js`.
const buildHeadersOnlyEvent = (request) => {
  const headers = {};
  for (const [key, value] of request.headers.entries()) {
    headers[key.toLowerCase()] = value;
  }
  return { headers };
};

const json = (status, data, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });

// 50 MB single-shot cap. Cloudflare Workers can handle larger but the
// admin UI also enforces this client-side and asks the user to host
// bigger files externally.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

// Strict allowlist. Same rationale as the image endpoint — anything not
// listed is rejected before bytes are read. We do not accept
// `video/x-flv`, MKV, or other obscure container formats because they
// don't play in the storefront <video> element on every browser, so
// allowing the upload would just produce broken product pages.
const ALLOWED_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime", // .mov from iPhone
  "video/ogg",
]);
const ALLOWED_EXTENSIONS = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/ogg": "ogv",
};

const toHex = (bytes) =>
  Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

export const onRequestPost = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;

  const event = buildHeadersOnlyEvent(request);
  const authed = await isAuthenticated(event).catch(() => false);
  if (!authed) {
    return json(401, { error: "Unauthorized" });
  }

  if (!env.UPLOADS_BUCKET) {
    return json(503, {
      error: "uploads-disabled",
      message:
        "R2 bucket binding (UPLOADS_BUCKET) is not configured on this deploy.",
    });
  }

  const contentType = (request.headers.get("content-type") || "")
    .toLowerCase()
    .split(";")[0]
    .trim();
  if (!ALLOWED_MIME_TYPES.has(contentType)) {
    return json(415, {
      error: "unsupported-media-type",
      message: `Content-Type must be one of ${[...ALLOWED_MIME_TYPES].join(", ")}, got ${contentType || "(empty)"}.`,
    });
  }

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_UPLOAD_BYTES) {
    return json(413, {
      error: "payload-too-large",
      message: `Upload exceeds ${MAX_UPLOAD_BYTES} byte limit (${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB). Host the file externally and paste its URL instead.`,
    });
  }

  let bytes;
  try {
    const buf = await request.arrayBuffer();
    if (buf.byteLength === 0) {
      return json(400, { error: "empty-body" });
    }
    if (buf.byteLength > MAX_UPLOAD_BYTES) {
      return json(413, {
        error: "payload-too-large",
        message: `Upload exceeds ${MAX_UPLOAD_BYTES} byte limit (${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB). Host the file externally and paste its URL instead.`,
      });
    }
    bytes = buf;
  } catch (err) {
    return json(400, {
      error: "invalid-body",
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // Content-addressable key under `products/videos/`. Same 2-char
  // prefix sharding as the image pipeline so a single bucket listing
  // stays fast.
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = toHex(digest);
  const ext = ALLOWED_EXTENSIONS[contentType] || "bin";
  const key = `products/videos/${hash.slice(0, 2)}/${hash}.${ext}`;

  const existing = await env.UPLOADS_BUCKET.head(key).catch(() => null);
  if (!existing) {
    try {
      await env.UPLOADS_BUCKET.put(key, bytes, {
        httpMetadata: {
          contentType,
          // Long max-age — content-addressed bytes never change.
          cacheControl: "public, max-age=31536000, immutable",
        },
      });
    } catch (err) {
      return json(500, {
        error: "r2-put-failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Same `/api/r/<key>` proxy as image uploads — handles cache and
  // security headers, lets the bucket itself stay private.
  const url = `/api/r/${key}`;
  return json(200, {
    url,
    key,
    bytes: bytes.byteLength,
    contentType,
    deduped: Boolean(existing),
  });
};

export const onRequest = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "Authorization, Content-Type, Content-Length",
      },
    });
  }
  return json(405, { error: "method-not-allowed" });
};
