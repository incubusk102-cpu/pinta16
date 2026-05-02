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
// banner / hero images); 5 MB covers that comfortably while bounding how much
// memory and KV write quota a single malicious request can consume. Workers
// have a higher built-in cap (~100 MB) so this is the application-level guard.
const DEFAULT_MAX_BODY_BYTES = 5 * 1024 * 1024;

class BodyTooLargeError extends Error {
  constructor() {
    super("Request body exceeds the 5 MB limit");
    this.name = "BodyTooLargeError";
  }
}

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
    if (
      Number.isFinite(contentLength) &&
      contentLength > DEFAULT_MAX_BODY_BYTES
    ) {
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
    const byteLength =
      typeof TextEncoder !== "undefined"
        ? new TextEncoder().encode(body).byteLength
        : body.length;
    if (byteLength > DEFAULT_MAX_BODY_BYTES) {
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
export const toPagesResponse = (result) => {
  const status = result?.statusCode ?? 200;
  const headers = result?.headers ?? {};
  const body = result?.body ?? "";
  return new Response(body, { status, headers });
};

export { BodyTooLargeError, DEFAULT_MAX_BODY_BYTES };
