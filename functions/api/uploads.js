// /api/uploads — admin-only image upload to R2.
//
// Stores admin-uploaded images (product photos, etc.) in R2 instead of
// inflating the base64 payload into KV. Content-addressable: the object
// key is the SHA-256 of the bytes, so identical uploads dedupe and any
// edit produces a new immutable URL.
//
// Returns 503 when the R2 binding is missing so the admin upload UI can
// gracefully fall back to the existing data-URL path. This keeps the
// PR safe to merge before R2 is bound in the Cloudflare dashboard.

import { initRequestContext } from "./_lib/handler-wrapper.js";
import { isAuthenticated } from "./_lib/admin-auth.js";
import { buildLambdaEvent } from "./_lib/lambda-event.js";

const json = (status, data, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });

// Mirror the body cap from handler-wrapper.js. The admin image-compress
// pipeline targets ~800 KB JPEGs so 5 MB is generous headroom.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// Strict allowlist of bitmap MIME types. We deliberately do NOT accept
// `image/svg+xml` — SVG is XML and can carry inline `<script>` /
// `<foreignObject>` payloads that execute when the file is rendered
// same-origin under `/api/r/<key>`, which would turn the upload bucket
// into a stored-XSS vector. Storefront product photos are bitmaps, so
// this restriction has zero legitimate UX cost.
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
]);
const ALLOWED_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

const toHex = (bytes) =>
  Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

export const onRequestPost = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;

  // Admin-gated: same Bearer-token check as every other admin endpoint.
  const event = await buildLambdaEvent(request);
  const authed = await isAuthenticated(event).catch(() => false);
  if (!authed) {
    return json(401, { error: "Unauthorized" });
  }

  // R2 binding is optional — if absent, signal the client to fall back
  // to its existing in-payload (base64) flow.
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
      message: `Upload exceeds ${MAX_UPLOAD_BYTES} byte limit.`,
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
        message: `Upload exceeds ${MAX_UPLOAD_BYTES} byte limit.`,
      });
    }
    bytes = buf;
  } catch (err) {
    return json(400, {
      error: "invalid-body",
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // Content-addressable key: products/{first-2-chars}/{full-hash}.{ext}.
  // The 2-char prefix keeps a single bucket listing fast even at thousands
  // of objects.
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = toHex(digest);
  const ext = ALLOWED_EXTENSIONS[contentType] || "bin";
  const key = `products/${hash.slice(0, 2)}/${hash}.${ext}`;

  // Skip the write if the object is already there (dedupe identical photos).
  const existing = await env.UPLOADS_BUCKET.head(key).catch(() => null);
  if (!existing) {
    try {
      await env.UPLOADS_BUCKET.put(key, bytes, {
        httpMetadata: {
          contentType,
          // Long max-age — these URLs are content-addressed so the bytes
          // behind a given URL never change.
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

  // Public URL is served by /api/r/[[path]].js (a thin GET proxy) so the
  // bucket itself can stay private and we can attach our own cache /
  // security headers.
  const url = `/api/r/${key}`;
  return json(200, {
    url,
    key,
    bytes: bytes.byteLength,
    contentType,
    deduped: Boolean(existing),
  });
};

// Block all non-POST methods explicitly (Pages Functions otherwise lets
// any method through to the file).
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
