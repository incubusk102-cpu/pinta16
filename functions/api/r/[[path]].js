// /api/r/* — public GET proxy that streams an object from R2.
//
// The bucket itself stays private; this thin function lets us attach
// the right Cache-Control + security headers and gives us one URL
// shape we control (vs. an account-specific R2 public-bucket URL).
//
// Returns 404 if R2 is not bound or the key is missing — the storefront
// already shows ImageWithFallback's gentle frame on 404, so the user
// experience degrades gracefully if a key is mis-typed.

import { logSecurityEvent } from "../_lib/security-events.js";
import { autobanIfNeeded } from "../_lib/handler-wrapper.js";

const HEADERS_404 = {
  "Content-Type": "text/plain",
  "X-Content-Type-Options": "nosniff",
  // Don't let CDNs cache a missing-image response for long.
  "Cache-Control": "public, max-age=60",
};

const SAFE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "application/octet-stream",
]);

const hasPathTraversal = (key) =>
  key.includes("..") ||
  key.startsWith("/") ||
  key.includes("\\") ||
  key.includes("%2e") ||
  key.includes("%2E") ||
  key.includes("%00") ||
  /[\x00-\x1f\x7f]/.test(key);

export const onRequestGet = async ({ request, env, params }) => {
  if (!env.UPLOADS_BUCKET) {
    return new Response("R2 not configured", {
      status: 404,
      headers: HEADERS_404,
    });
  }

  const segments = Array.isArray(params?.path) ? params.path : [];
  const key = segments.join("/");
  if (!key || hasPathTraversal(key)) {
    const ip =
      request.headers.get("cf-connecting-ip") ||
      (request.headers.get("x-forwarded-for") || "").split(",")[0]?.trim() ||
      "";
    if (key) {
      const cc = (request.headers.get("cf-ipcountry") || "")
        .trim()
        .toUpperCase();
      void logSecurityEvent({
        type: "path-traversal",
        ip,
        country: cc && cc !== "XX" ? cc : "",
        path: `/api/r/${key}`,
        detail: "Path traversal attempt in R2 proxy",
        userAgent: request.headers.get("user-agent") || "",
      });
      void autobanIfNeeded(ip);
    }
    return new Response("Not found", { status: 404, headers: HEADERS_404 });
  }

  const object = await env.UPLOADS_BUCKET.get(key, {
    onlyIf: request.headers.get("if-none-match")
      ? { etagMatches: request.headers.get("if-none-match").replace(/"/g, "") }
      : undefined,
  });

  if (!object) {
    return new Response("Not found", { status: 404, headers: HEADERS_404 });
  }

  // R2 returned just the metadata (etag matched) — tell the browser to
  // serve from its cache.
  if (!("body" in object) || object.body === null) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: `"${object.etag}"`,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  const headers = new Headers();
  // Object-level metadata wins; fall back to safe defaults. Force
  // unrecognised types to application/octet-stream so the browser never
  // renders uploaded content as HTML/JS.
  const storedType = (object.httpMetadata?.contentType || "").toLowerCase();
  const contentType = SAFE_CONTENT_TYPES.has(storedType)
    ? storedType
    : "application/octet-stream";
  headers.set("Content-Type", contentType);
  headers.set(
    "Cache-Control",
    object.httpMetadata?.cacheControl || "public, max-age=31536000, immutable",
  );
  if (object.etag) {
    headers.set("ETag", `"${object.etag}"`);
  }
  // Defence-in-depth: stop the browser from sniffing the body to a
  // different content type (e.g. interpreting an image as JS).
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Disposition", "inline");
  headers.set(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  );
  headers.set("Cross-Origin-Resource-Policy", "same-origin");

  return new Response(object.body, { status: 200, headers });
};
