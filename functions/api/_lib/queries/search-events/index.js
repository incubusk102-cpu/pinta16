// Search-event queries.
//
// D1 ledger of debounced public-storefront search queries. The gallery
// fires one event per debounced query (not per keystroke) via the
// `/api/search-events` beacon so we can answer "what are people
// searching for?" and "what's getting zero results?" without scanning
// the orders KV blob.
//
// `INSERT OR IGNORE` on the client-supplied id keeps retries idempotent.
// Null-safe: when `env.DB` is unbound every helper returns `null` and
// the gallery's search keeps working unchanged.

import { getD1 } from "../core.js";

// Record a single stable storefront search query. Caller is the public
// `/api/search-events` beacon (see `functions/api/search-events.js`); the
// gallery on the storefront fires this once after the typing-debounce
// settles, not on every keystroke.
//
// `id` is a uuid produced by the caller (one row per debounced query) so
// retries from a flaky network become an idempotent INSERT OR IGNORE.
//
// Null-safe: when env.DB is unbound this is a silent no-op so the public
// gallery search keeps working unchanged.
export async function recordSearchEvent({
  id,
  query,
  resultsCount = 0,
  filterCategory = null,
  filterAvailability = null,
  filterPrice = null,
  country = null,
}) {
  const db = getD1();
  if (!db) return null;
  const raw = String(query || "").slice(0, 200);
  if (!raw.trim()) return null;
  const lc = raw.trim().toLowerCase();
  const eventId =
    typeof id === "string" && id.length > 0 && id.length <= 64
      ? id
      : `se_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT OR IGNORE INTO search_events
         (id, query, query_lc, results_count,
          filter_category, filter_availability, filter_price,
          country, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        eventId,
        raw,
        lc,
        Math.max(0, Math.floor(Number(resultsCount) || 0)),
        filterCategory || null,
        filterAvailability || null,
        filterPrice || null,
        country || null,
        now,
      )
      .run();
    return { recorded: true };
  } catch (err) {
    return { recorded: false, reason: String(err?.message || err) };
  }
}

// Top N queries over the last `days` days, ordered by total uses. Returns
// the most-used queries first plus a couple of stats per query so the admin
// panel can render "saw 42 searches for 'dela rosa', 38% hit zero results".
export async function topSearchQueries({ days = 30, limit = 50 } = {}) {
  const db = getD1();
  if (!db) return null;
  const since = new Date(
    Date.now() - Math.max(1, Math.floor(Number(days) || 30)) * 86400_000,
  ).toISOString();
  const cap = Math.min(200, Math.max(1, Math.floor(Number(limit) || 50)));
  try {
    const result = await db
      .prepare(
        `SELECT
           query_lc AS query,
           COUNT(*) AS uses,
           SUM(CASE WHEN results_count = 0 THEN 1 ELSE 0 END) AS zero_result_uses,
           AVG(results_count) AS avg_results,
           MAX(ts) AS last_seen_at
         FROM search_events
         WHERE ts >= ?
         GROUP BY query_lc
         ORDER BY uses DESC, last_seen_at DESC
         LIMIT ?`,
      )
      .bind(since, cap)
      .all();
    return result?.results || [];
  } catch {
    return null;
  }
}

// Top N queries that returned zero results (the actionable list — these
// are searches you couldn't fulfil). Same shape as topSearchQueries but
// filtered.
export async function zeroResultSearchQueries({ days = 30, limit = 50 } = {}) {
  const db = getD1();
  if (!db) return null;
  const since = new Date(
    Date.now() - Math.max(1, Math.floor(Number(days) || 30)) * 86400_000,
  ).toISOString();
  const cap = Math.min(200, Math.max(1, Math.floor(Number(limit) || 50)));
  try {
    const result = await db
      .prepare(
        `SELECT
           query_lc AS query,
           COUNT(*) AS uses,
           MAX(ts) AS last_seen_at
         FROM search_events
         WHERE ts >= ? AND results_count = 0
         GROUP BY query_lc
         ORDER BY uses DESC, last_seen_at DESC
         LIMIT ?`,
      )
      .bind(since, cap)
      .all();
    return result?.results || [];
  } catch {
    return null;
  }
}

// Recent raw events for the timeline view in the admin panel. Returns the
// `limit` most-recent rows (default 100, hard cap 500).
export async function recentSearchEvents({ limit = 100 } = {}) {
  const db = getD1();
  if (!db) return null;
  const cap = Math.min(500, Math.max(1, Math.floor(Number(limit) || 100)));
  try {
    const result = await db
      .prepare(
        `SELECT id, query, results_count, filter_category, filter_availability,
                filter_price, country, ts
         FROM search_events
         ORDER BY ts DESC
         LIMIT ?`,
      )
      .bind(cap)
      .all();
    return result?.results || [];
  } catch {
    return null;
  }
}
