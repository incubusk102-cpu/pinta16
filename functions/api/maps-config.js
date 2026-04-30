// /api/maps-config — exposes the public Google Maps JavaScript API key
// (and an optional vector Map ID) so the storefront can render the
// hybrid shipping address picker without baking the key into the Vite
// bundle at build time. The key is referrer-restricted in Google Cloud
// Console, so handing it to any browser hitting our origin is fine —
// the security boundary is the referrer ACL, not key obscurity.
//
// Returns:
//   { apiKey: string | null, mapId: string | null }
//
// Reads from Cloudflare Pages env:
//   - GOOGLE_MAPS_API_KEY (preferred)
//   - VITE_GOOGLE_MAPS_API_KEY (fallback so a single env var works in
//     both Vite dev and the prod worker without renaming)
//   - GOOGLE_MAPS_MAP_ID (optional — required by AdvancedMarker, the
//     storefront falls back to a plain Marker when this is missing)

import { setCloudflareContext } from "./_lib/context.js";
import { SECURITY_HEADERS } from "./_lib/security-headers.js";

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, max-age=300",
      ...SECURITY_HEADERS,
    },
  });

export const onRequest = async ({ request, env }) => {
  setCloudflareContext(env);
  if (request.method !== "GET") {
    return json(405, { error: "Method not allowed" });
  }
  const apiKey =
    (env && (env.GOOGLE_MAPS_API_KEY || env.VITE_GOOGLE_MAPS_API_KEY)) || null;
  const mapId = (env && env.GOOGLE_MAPS_MAP_ID) || null;
  return json(200, { apiKey, mapId });
};
