// Build a Netlify Lambda-shaped `event` object from a Cloudflare Pages Function
// `request`, so business logic that was written against `event.httpMethod /
// event.headers / event.body / event.queryStringParameters` keeps working
// without rewrites.
//
// The Pages Function calls `await buildLambdaEvent(request)` once at the top
// of its handler, then passes the resulting event into the original handler
// alongside the KV stores it needs.

// Cap inbound bodies to a sane size. The biggest legitimate payload we accept
// is the storefront-config save (which can include a few base64-embedded
// banner / hero images). The hard ceiling here (10 MB) is the absolute upper
// bound that no admin override can blow past — the live-tunable cap shipped
// in the Admin → Security panel is checked separately and is clamped to
// 1–10 MB. Workers have a higher built-in cap (~100 MB) so this is the
// application-level guard.
const HARD_CEILING_BYTES = 10 * 1024 * 1024;
// Kept as a public alias for callers that want the legacy default at compile
// time. The runtime cap is whatever `getMaxBodyBytes()` returns.
const DEFAULT_MAX_BODY_BYTES = 5 * 1024 * 1024;

import { getMaxBodyBytes } from "./security-config.js";

class BodyTooLargeError extends Error {
  constructor() {
    super(`Request body exceeds the configured limit`);
    this.name = "BodyTooLargeError";
  }
}

const byteLengthOf = (s) =>
  typeof TextEncoder !== "undefined"
    ? new TextEncoder().encode(s).byteLength
    : s.length;

export const buildLambdaEvent = async (request) => {
  const url = new URL(request.url);
  const headers = {};
  for (const [key, value] of request.headers.entries()) {
    headers[key.toLowerCase()] = value;
  }

  let body = "";
  if (request.method !== "GET" && request.method !== "HEAD") {
    // Reject obviously oversized requests before we read them. Cheap and
    // covers well-behaved clients that always send Content-Length.
    const contentLength = Number(headers["content-length"] || 0);
    if (Number.isFinite(contentLength) && contentLength > HARD_CEILING_BYTES) {
      throw new BodyTooLargeError();
    }
    try {
      body = await request.text();
    } catch {
      body = "";
    }
    // Final byte-length guard for clients that omit Content-Length or lie
    // about it. UTF-16 surrogate pair counts each code unit as one in
    // .length so use TextEncoder for a true byte count.
    const byteLength = byteLengthOf(body);
    if (byteLength > HARD_CEILING_BYTES) {
      throw new BodyTooLargeError();
    }
    // Honor the live-tunable cap from the Admin → Security panel. Reads
    // from a 30s module-scoped cache so this is essentially free in the
    // steady state. Falls back to the hardcoded default if the security
    // config can't be resolved.
    let configuredCap = DEFAULT_MAX_BODY_BYTES;
    try {
      configuredCap = await getMaxBodyBytes();
    } catch {
      configuredCap = DEFAULT_MAX_BODY_BYTES;
    }
    if (byteLength > configuredCap) {
      throw new BodyTooLargeError();
    }
  }

  const queryStringParameters = {};
  const multiValueQueryStringParameters = {};
  for (const [key, value] of url.searchParams.entries()) {
    queryStringParameters[key] = value;
    (multiValueQueryStringParameters[key] ||= []).push(value);
  }

  return {
    httpMethod: request.method,
    path: url.pathname,
    rawUrl: request.url,
    headers,
    body,
    queryStringParameters,
    multiValueQueryStringParameters,
    isBase64Encoded: false,
  };
};

// Convert a Netlify-style Lambda return value into a Cloudflare Pages Response.
//
// Most handlers return a flat `headers` object — that's converted as-is.
// For responses that need to set multiple `Set-Cookie` headers (login,
// logout, anywhere we issue both the session cookie and the CSRF
// double-submit cookie at once), the handler attaches a `cookies`
// array of pre-serialised cookie strings; we append each as a separate
// `Set-Cookie` header. A flat `headers` object can only carry one
// `Set-Cookie` value, so the array path is required for any multi-
// cookie response.
export const toPagesResponse = (result) => {
  const status = result?.statusCode ?? 200;
  const flatHeaders = result?.headers ?? {};
  const cookies = Array.isArray(result?.cookies) ? result.cookies : [];
  const body = result?.body ?? "";
  if (cookies.length === 0) {
    return new Response(body, { status, headers: flatHeaders });
  }
  const headers = new Headers();
  for (const [k, v] of Object.entries(flatHeaders)) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      for (const item of v) headers.append(k, item);
    } else {
      headers.set(k, v);
    }
  }
  for (const c of cookies) {
    if (typeof c === "string" && c.length > 0) {
      headers.append("Set-Cookie", c);
    }
  }
  return new Response(body, { status, headers });
};

export { BodyTooLargeError, DEFAULT_MAX_BODY_BYTES };
