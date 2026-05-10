// /api/page-events — public route-change beacon + admin readback for the
// self-hosted page-view analytics.
//
// Public POST: client beacon from `usePageEventBeacon`. Fires once per
// route change (deduped per session+pathKind on the server via a hash so
// repeated SPA refreshes of the same page don't double-count). Persisted
// to D1 (`page_events` table).
//
// Admin GET: aggregated rollups — funnel by `path_kind`, top exact paths,
// top referrer hosts, daily traffic, device mix.
//
// See `functions/api/_lib/d1.js` for the helpers.

import { initRequestContext } from "./_lib/handler-wrapper.js";
import { isAuthenticated } from "./_lib/admin-auth.js";
import { logError } from "./_lib/redact.js";
import {
  isD1Available,
  recordPageEvent,
  pageEventFunnel,
  topPagePaths,
  topReferrerHosts,
  pageEventDaily,
  pageEventDeviceMix,
  PAGE_EVENT_KINDS,
} from "./_lib/d1.js";

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
    },
  });

const parseJson = async (request) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

const extractCountry = (request) => {
  const cc = (request.headers?.get?.("cf-ipcountry") || "")
    .trim()
    .toUpperCase();
  if (!cc || cc === "XX") return null;
  return cc.slice(0, 4);
};

// Strip referrer down to its hostname so we never persist a path or
// query string that might leak shopper-identifying info from third-party
// redirects.
const sanitizeReferrer = (referrer) => {
  if (typeof referrer !== "string" || !referrer) return null;
  try {
    const u = new URL(referrer);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.hostname.slice(0, 128) || null;
  } catch {
    return null;
  }
};

const sanitizeShortString = (value, maxLen = 64) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, maxLen);
  return trimmed || null;
};

export const onRequestPost = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;

  if (!isD1Available()) {
    return json(200, { recorded: false, reason: "d1-unbound" });
  }

  const body = await parseJson(request);
  if (!body || typeof body !== "object") {
    return json(400, { error: "JSON body required" });
  }

  const sessionId = sanitizeShortString(body.sessionId, 64);
  if (!sessionId || !/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    return json(400, { error: "sessionId required" });
  }

  const path = typeof body.path === "string" ? body.path.slice(0, 500) : "";
  if (!path.startsWith("/")) {
    return json(400, { error: "path must start with /" });
  }

  const pathKind = sanitizeShortString(body.pathKind, 24);
  if (!pathKind || !PAGE_EVENT_KINDS.has(pathKind)) {
    return json(400, { error: "unknown pathKind" });
  }

  const referrerHost = sanitizeReferrer(body.referrer);
  const device =
    typeof body.device === "string" ? body.device.slice(0, 16) : null;
  const country = extractCountry(request);
  const id = sanitizeShortString(body.id, 64);

  try {
    const result = await recordPageEvent({
      id,
      sessionId,
      path,
      pathKind,
      referrerHost,
      country,
      device,
    });
    return json(200, result || { recorded: false });
  } catch (error) {
    logError("page-events POST error:", error);
    return json(500, { error: "Could not record page event" });
  }
};

export const onRequestGet = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;

  if (
    !(await isAuthenticated({
      headers: Object.fromEntries(request.headers.entries()),
    }))
  ) {
    return json(401, { error: "Not authenticated" });
  }

  if (!isD1Available()) {
    return json(200, {
      available: false,
      message:
        "D1 binding (env.DB) not configured. Page event analytics require D1 — the migration is in `migrations/0006_page_events.sql`.",
    });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "summary";
  const days = Math.max(
    1,
    Math.min(365, Math.floor(Number(url.searchParams.get("days")) || 30)),
  );
  const limit = Math.max(
    1,
    Math.min(200, Math.floor(Number(url.searchParams.get("limit")) || 25)),
  );

  try {
    if (action === "funnel") {
      const rows = await pageEventFunnel({ days });
      return json(200, { available: true, days, results: rows || [] });
    }
    if (action === "top-paths") {
      const rows = await topPagePaths({ days, limit });
      return json(200, { available: true, days, results: rows || [] });
    }
    if (action === "referrers") {
      const rows = await topReferrerHosts({ days, limit });
      return json(200, { available: true, days, results: rows || [] });
    }
    if (action === "daily") {
      const rows = await pageEventDaily({ days });
      return json(200, { available: true, days, results: rows || [] });
    }
    if (action === "devices") {
      const rows = await pageEventDeviceMix({ days });
      return json(200, { available: true, days, results: rows || [] });
    }
    if (action === "summary") {
      const [funnel, paths, referrers, daily, devices] = await Promise.all([
        pageEventFunnel({ days }),
        topPagePaths({ days, limit: Math.min(limit, 25) }),
        topReferrerHosts({ days, limit: Math.min(limit, 15) }),
        pageEventDaily({ days }),
        pageEventDeviceMix({ days }),
      ]);
      return json(200, {
        available: true,
        days,
        funnel: funnel || [],
        topPaths: paths || [],
        referrers: referrers || [],
        daily: daily || [],
        devices: devices || [],
      });
    }
    return json(400, { error: `Unknown action '${action}'` });
  } catch (error) {
    logError("page-events GET error:", error);
    return json(500, { error: "Could not load page event analytics" });
  }
};
