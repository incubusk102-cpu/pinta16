// Build a Netlify Lambda-shaped `event` object from a Cloudflare Pages Function
// `request`, so business logic that was written against `event.httpMethod /
// event.headers / event.body / event.queryStringParameters` keeps working
// without rewrites.
//
// The Pages Function calls `await buildLambdaEvent(request)` once at the top
// of its handler, then passes the resulting event into the original handler
// alongside the KV stores it needs.

export const buildLambdaEvent = async (request) => {
  const url = new URL(request.url);
  const headers = {};
  for (const [key, value] of request.headers.entries()) {
    headers[key.toLowerCase()] = value;
  }

  let body = "";
  if (request.method !== "GET" && request.method !== "HEAD") {
    try {
      body = await request.text();
    } catch {
      body = "";
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
