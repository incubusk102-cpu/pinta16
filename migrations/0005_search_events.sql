-- 0005_search_events.sql
--
-- D1 ledger of stable storefront search queries. The gallery search box on
-- the public site filters in-memory (see `src/components/GallerySection.tsx`)
-- so there's no server hit on every keystroke; instead the client beacons
-- to /api/search-events after the typing debounce settles, which gives us
-- a per-stable-query record we can roll up later.
--
-- Goal: see what shoppers actually search for vs. what products you carry,
-- and surface zero-result queries (those are the ones that need attention —
-- either you don't carry it or your titles don't match how shoppers describe
-- the work).
--
-- Privacy:
--   * `query` stores the raw user-typed string (already capped at 200 chars
--     server-side), `query_lc` stores its lowercase normalized form for
--     grouping. Neither is joined back to a session id or IP address.
--   * `country` is the Cloudflare 2-letter country code from `cf-ipcountry`,
--     never the full IP. The handler in `functions/api/search-events.js`
--     never reads or persists the IP itself.
--
-- Volume sanity:
--   The beacon fires once per stable query (1.5 s of typing inactivity).
--   At Canvhub's traffic order of magnitude (a few hundred sessions/day,
--   ~5 searches/session) this is well under the D1 free-tier 100k
--   writes/day cap, with two orders of magnitude of headroom.

CREATE TABLE IF NOT EXISTS search_events (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  query_lc TEXT NOT NULL,
  results_count INTEGER NOT NULL DEFAULT 0,
  filter_category TEXT,
  filter_availability TEXT,
  filter_price TEXT,
  country TEXT,
  ts TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_search_events_ts ON search_events(ts);
CREATE INDEX IF NOT EXISTS idx_search_events_query_lc ON search_events(query_lc);
CREATE INDEX IF NOT EXISTS idx_search_events_results_count ON search_events(results_count);
