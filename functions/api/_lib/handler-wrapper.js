// Standard wrapper that adapts a Netlify-style `handler(event)` into a
// Cloudflare Pages Function `onRequest({ request, env })`. Sets the
// per-request env on the context module so helpers (admin-auth, audit-log,
// rate-limit, email, etc.) can find it without each handler having to thread
// `env` through every call site.

import { setCloudflareContext } from "./context.js";
import {
  BodyTooLargeError,
  buildLambdaEvent,
  toPagesResponse,
} from "./lambda-event.js";

export const wrapHandler =
  (handler) =>
  async ({ request, env }) => {
    setCloudflareContext(env);
    // Mirror env onto process.env so legacy code that reads process.env.X
    // (ported verbatim from the Netlify functions) keeps working under the
    // nodejs_compat flag without rewriting every reference.
    if (typeof globalThis.process === "undefined") {
      globalThis.process = { env: {} };
    } else if (!globalThis.process.env) {
      globalThis.process.env = {};
    }
    for (const key of Object.keys(env || {})) {
      const value = env[key];
      if (typeof value === "string") {
        globalThis.process.env[key] = value;
      }
    }
    let event;
    try {
      event = await buildLambdaEvent(request);
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        return new Response(
          JSON.stringify({ error: "Request body too large (max 5 MB)" }),
          {
            status: 413,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      throw error;
    }
    const result = await handler(event);
    return toPagesResponse(result);
  };
