-- 0006_page_events.sql
--
-- D1 ledger of public-storefront page-view events. Self-hosted analytics
-- so we don't need GA / a third-party pixel and don't have to ask EU
-- shoppers for cookie consent before counting page views.
--
-- One row per route change. The client beacon is in
-- `src/hooks/usePageEventBeacon.ts`; it fires a POST to /api/page-events
-- whenever TanStack Router transitions to a new pathname (deduped per
-- session id within the same path so SPA refreshes don't double-count).
--
-- Privacy:
--   * `session_id` is the same UUIDv4 already in localStorage as
--     `canvhub_visitor_id` (see `useVisitorHeartbeat`). It identifies a
--     browser, never the human. No PII leaves the client.
--   * `country` comes from the `cf-ipcountry` request header — never the
--     IP itself.
--   * `referrer_host` stores only the *hostname* of the document
--     referrer (no path, no query string), so e.g. a Facebook link
--     becomes "m.facebook.com" not "https://m.facebook.com/somepost?...".
--
-- Volume sanity:
--   At the upper end of plausible Canvhub traffic (5 000 page views/day)
--   this is 5 000 D1 writes/day, ~5 % of the free-tier 100 k/day cap.

CREATE TABLE IF NOT EXISTS page_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  path TEXT NOT NULL,
  path_kind TEXT NOT NULL,
  referrer_host TEXT,
  country TEXT,
  device TEXT,
  ts TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_page_events_ts ON page_events(ts);
CREATE INDEX IF NOT EXISTS idx_page_events_path_kind ON page_events(path_kind);
CREATE INDEX IF NOT EXISTS idx_page_events_path ON page_events(path);
CREATE INDEX IF NOT EXISTS idx_page_events_session ON page_events(session_id);
CREATE INDEX IF NOT EXISTS idx_page_events_session_kind ON page_events(session_id, path_kind);
