// Pages Functions error monitoring via Toucan-js, the
// Cloudflare-Workers-friendly Sentry client.
//
// Opt-in: set SENTRY_DSN in the Cloudflare Pages environment variables.
// When unset, every helper here is a graceful no-op so an endpoint that
// imports it without a configured DSN still works.
//
// Usage from a Pages Function:
//
//   import { wrapHandler } from "./_lib/sentry.js";
//
//   export const onRequestPost = wrapHandler(async (ctx) => {
//     // your existing handler body — throw freely; uncaught errors are
//     // forwarded to Sentry and a 500 response is returned to the client.
//   });
//
// Or, for ad-hoc reporting from inside an existing handler:
//
//   import { reportError } from "./_lib/sentry.js";
//
//   try { ... }
//   catch (err) {
//     await reportError(err, { request, env, ctx, tags: { route: "checkout" } });
//     return new Response("Internal error", { status: 500 });
//   }
//
// Why Toucan rather than `@sentry/node`? Cloudflare Workers run on V8
// isolates without the full Node runtime, so the official `@sentry/node`
// SDK doesn't load. Toucan-js is a small (~10 KB) Sentry-compatible
// client built specifically for the Workers environment.

import { Toucan } from "toucan-js";

const newClient = (request, env, ctx) => {
  if (!env || !env.SENTRY_DSN) return null;
  return new Toucan({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT || "production",
    release: env.SENTRY_RELEASE || undefined,
    request,
    context: ctx,
    // Don't ship customer PII by default. The `request` body and headers
    // are summarised by Toucan (path, method, query, IP) but we strip
    // anything that looks like a session token or email before send.
    requestDataOptions: {
      allowedHeaders: ["user-agent", "cf-connecting-ip", "cf-ray"],
      allowedSearchParams: true,
    },
  });
};

/**
 * Forward an exception to Sentry. Resolves once the request to Sentry has
 * been queued onto `ctx.waitUntil` (or the function falls through if
 * Sentry isn't configured). Never throws — best-effort.
 *
 * @param {unknown} err  The thrown value.
 * @param {object} opts
 * @param {Request} [opts.request]  The inbound Pages Function request.
 * @param {object}  [opts.env]      The Pages Function env (must contain
 *                                  SENTRY_DSN to send anything).
 * @param {object}  [opts.ctx]      Pages Function execution context — used
 *                                  for `ctx.waitUntil` so the report
 *                                  outlives the response.
 * @param {object}  [opts.tags]     Optional key/value tags applied to the
 *                                  Sentry event.
 */
export const reportError = (err, { request, env, ctx, tags } = {}) => {
  try {
    const client = newClient(request, env, ctx);
    if (!client) return;
    if (tags) {
      for (const [k, v] of Object.entries(tags)) {
        client.setTag(k, v);
      }
    }
    const eventId = client.captureException(err);
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(client.flush(2000));
    }
    return eventId;
  } catch {
    // Never let observability code take down a request.
  }
};

/**
 * Wrap a Pages Function handler so unhandled errors are reported to
 * Sentry and the client gets a generic 500 response. Pass-through when
 * SENTRY_DSN isn't configured — the handler runs untouched and any
 * thrown error propagates as it would today (Cloudflare's runtime
 * surfaces it as a 1101 / 500).
 *
 * @template T
 * @param {(ctx: T) => Response | Promise<Response>} handler
 * @returns {(ctx: T) => Promise<Response>}
 */
export const wrapHandler = (handler) => async (ctx) => {
  try {
    return await handler(ctx);
  } catch (err) {
    reportError(err, {
      request: ctx?.request,
      env: ctx?.env,
      ctx,
      tags: { handler: handler.name || "anonymous" },
    });
    return new Response(JSON.stringify({ error: "internal" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
