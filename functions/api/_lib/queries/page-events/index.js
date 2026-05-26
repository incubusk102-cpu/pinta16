// Page-event queries.
//
// D1 ledger of public-storefront page-view events (self-hosted analytics
// so we don't need GA or a third-party pixel). The client beacon in
// `src/hooks/usePageEventBeacon.ts` fires a POST to `/api/page-events`
// whenever TanStack Router transitions to a new pathname.
//
// Inserts use `INSERT OR IGNORE` on the client-supplied event id so a
// retried beacon never inflates the funnel. Aggregations use a shared
// "trailing window" semantics (`sinceFromDays`). Null-safe: when
// `env.DB` is unbound every helper returns `null` and the SPA keeps
// rendering page views without any record being written.

import { ALLOWED_DEVICES, getD1, sinceFromDays } from "../core.js";

// Allow-listed `path_kind` enum. The client maps each pathname to one of
// these buckets so the analytics rollups (funnel, by-kind histograms) stay
// stable across navigation refactors. Adding a new public route? Add the
// matching kind here AND in `src/lib/page-event-kind.ts` so server-side
// validation accepts it.
export const PAGE_EVENT_KINDS = new Set([
  "home",
  "gallery",
  "collection",
  "product",
  "preview",
  "checkout",
  "checkout-success",
  "account",
  "track",
  "policy",
  "login",
  "signup",
  "other",
]);

// Record one page-view event from the public storefront beacon. Caller is
// `functions/api/page-events.js`. Null-safe when env.DB is unbound.
export async function recordPageEvent({
  id,
  sessionId,
  path,
  pathKind,
  referrerHost = null,
  country = null,
  device = null,
}) {
  const db = getD1();
  if (!db) return null;
  const sid = String(sessionId || "")
    .trim()
    .slice(0, 64);
  if (!sid || !/^[a-zA-Z0-9_-]+$/.test(sid)) return null;
  const p = String(path || "").slice(0, 500);
  if (!p.startsWith("/")) return null;
  const kind = String(pathKind || "other").slice(0, 24);
  if (!PAGE_EVENT_KINDS.has(kind)) return null;
  const dev =
    device && ALLOWED_DEVICES.has(String(device)) ? String(device) : null;
  const ref =
    typeof referrerHost === "string" && referrerHost
      ? referrerHost.slice(0, 128)
      : null;
  const eventId =
    typeof id === "string" && id.length > 0 && id.length <= 64
      ? id
      : `pe_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT OR IGNORE INTO page_events
         (id, session_id, path, path_kind, referrer_host, country, device, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(eventId, sid, p, kind, ref, country || null, dev, now)
      .run();
    return { recorded: true };
  } catch (err) {
    return { recorded: false, reason: String(err?.message || err) };
  }
}

// Funnel: distinct sessions that reached each kind within the window.
// Returns one row per kind so the admin can render a step-by-step
// drop-off chart. Only counts sessions that actually visited at least
// one page in the window.
export async function pageEventFunnel({ days = 30 } = {}) {
  const db = getD1();
  if (!db) return null;
  const since = sinceFromDays(days);
  try {
    const result = await db
      .prepare(
        `SELECT path_kind,
                COUNT(DISTINCT session_id) AS sessions,
                COUNT(*) AS views
         FROM page_events
         WHERE ts >= ?
         GROUP BY path_kind`,
      )
      .bind(since)
      .all();
    return result?.results || [];
  } catch {
    return null;
  }
}

// Top exact paths over the window. Useful for spotting which products
// or collections get the most attention.
export async function topPagePaths({ days = 30, limit = 25 } = {}) {
  const db = getD1();
  if (!db) return null;
  const since = sinceFromDays(days);
  const cap = Math.min(200, Math.max(1, Math.floor(Number(limit) || 25)));
  try {
    const result = await db
      .prepare(
        `SELECT path,
                path_kind,
                COUNT(DISTINCT session_id) AS sessions,
                COUNT(*) AS views,
                MAX(ts) AS last_seen_at
         FROM page_events
         WHERE ts >= ?
         GROUP BY path
         ORDER BY views DESC, last_seen_at DESC
         LIMIT ?`,
      )
      .bind(since, cap)
      .all();
    return result?.results || [];
  } catch {
    return null;
  }
}

// Top referrer hosts over the window — where shoppers came from.
export async function topReferrerHosts({ days = 30, limit = 20 } = {}) {
  const db = getD1();
  if (!db) return null;
  const since = sinceFromDays(days);
  const cap = Math.min(100, Math.max(1, Math.floor(Number(limit) || 20)));
  try {
    const result = await db
      .prepare(
        `SELECT referrer_host AS host,
                COUNT(*) AS hits,
                COUNT(DISTINCT session_id) AS sessions
         FROM page_events
         WHERE ts >= ? AND referrer_host IS NOT NULL AND referrer_host != ''
         GROUP BY referrer_host
         ORDER BY hits DESC
         LIMIT ?`,
      )
      .bind(since, cap)
      .all();
    return result?.results || [];
  } catch {
    return null;
  }
}

// Daily traffic timeseries. One row per UTC day in the window with
// totals for views, distinct sessions, mobile share.
export async function pageEventDaily({ days = 30 } = {}) {
  const db = getD1();
  if (!db) return null;
  const since = sinceFromDays(days);
  try {
    const result = await db
      .prepare(
        `SELECT substr(ts, 1, 10) AS day,
                COUNT(*) AS views,
                COUNT(DISTINCT session_id) AS sessions,
                SUM(CASE WHEN device = 'mobile' THEN 1 ELSE 0 END) AS mobile_views
         FROM page_events
         WHERE ts >= ?
         GROUP BY day
         ORDER BY day ASC`,
      )
      .bind(since)
      .all();
    return result?.results || [];
  } catch {
    return null;
  }
}

// Distinct device counts over the window.
export async function pageEventDeviceMix({ days = 30 } = {}) {
  const db = getD1();
  if (!db) return null;
  const since = sinceFromDays(days);
  try {
    const result = await db
      .prepare(
        `SELECT COALESCE(device, 'unknown') AS device,
                COUNT(*) AS views,
                COUNT(DISTINCT session_id) AS sessions
         FROM page_events
         WHERE ts >= ?
         GROUP BY device
         ORDER BY views DESC`,
      )
      .bind(since)
      .all();
    return result?.results || [];
  } catch {
    return null;
  }
}
