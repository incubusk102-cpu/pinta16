// /api/maps-config — exposes the public MapTiler API key (and an
// optional style override URL) so the storefront can render the
// hybrid shipping address picker without baking the key into the Vite
// bundle at build time. The key should be domain-restricted in
// MapTiler Cloud, so handing it to any browser hitting our origin is
// fine — the security boundary is the domain ACL, not key obscurity.
//
// Returns:
//   { apiKey: string | null, styleUrl: string | null }
//
// Reads from Cloudflare Pages env (in priority order):
//   - MAPTILER_API_KEY (preferred — purpose-specific)
//   - VITE_MAPTILER_API_KEY (fallback for shared dev/prod naming)
//   - MAPS_API_KEY (generic fallback if a single key is reused)
//
// Optional:
//   - MAPTILER_STYLE_URL — full vector style URL (defaults to
//     streets-v2 baked into the storefront).

import { setCloudflareContext } from "./_lib/context.js";
import { SECURITY_HEADERS } from "./_lib/security-headers.js";
import { logError } from "./_lib/redact.js";

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, max-age=300",
      ...SECURITY_HEADERS,
    },
  });

// Generic 500 reply that never echoes the original error. The handler
// body is wrapped in a try/catch so an unexpected throw (KV bind miss,
// env panic, etc.) lands here instead of bubbling up a stack trace or
// internal field names to the client.
const internalError = () =>
  new Response(JSON.stringify({ error: "Internal server error" }), {
    status: 500,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...SECURITY_HEADERS,
    },
  });

export const onRequest = async ({ request, env }) => {
  try {
    setCloudflareContext(env);
    if (request.method !== "GET") {
      return json(405, { error: "Method not allowed" });
    }
    const apiKey =
      (env &&
        (env.MAPTILER_API_KEY ||
          env.VITE_MAPTILER_API_KEY ||
          env.MAPS_API_KEY)) ||
      null;
    const styleUrl = (env && env.MAPTILER_STYLE_URL) || null;
    return json(200, { apiKey, styleUrl });
  } catch (err) {
    logError("maps-config handler failed:", err);
    return internalError();
  }
};
