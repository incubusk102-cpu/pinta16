-- 0011_hero_slide_events.sql
--
-- D1 ledger of per-hero-slide engagement events. Powers the admin
-- panel's per-slide analytics rail (impressions / clicks / CTR per
-- slide over the trailing window) so the admin can A/B-compare
-- copy + imagery without bolting on a third-party pixel.
--
-- One row per event. There are exactly two event kinds:
--   * "impression" — the slide became the active slide in the carousel
--                    (fires once per (session, slide_id) per page load
--                    to avoid double-counting autoplay loop-arounds)
--   * "click"      — the CTA link inside the slide was activated
--
-- The slide_id is the same string the admin types into
-- `src/components/admin/HeroSlidesSection.tsx` and that the API
-- echoes back from `/api/hero-slides`. Slides created without an
-- image are dropped server-side so we never get rows for them.
--
-- Privacy: identical posture to `page_events` (see migration 0006).
--   * `session_id` is the same UUIDv4 already in localStorage as
--     `canvhub_visitor_id`; it identifies a browser, never a human.
--   * `country` is the Cloudflare `cf-ipcountry` 2-letter code, never
--     the IP itself.
--   * `device` is the coarse mobile / tablet / desktop bucket from
--     `src/lib/page-event-kind.ts`.
--
-- Volume sanity:
--   At Canvhub's traffic order of magnitude (a few thousand sessions /
--   day, ~3 slide impressions on the homepage per session) this is
--   well under the D1 free-tier 100 k writes/day cap.

CREATE TABLE IF NOT EXISTS hero_slide_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  slide_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  country TEXT,
  device TEXT,
  ts TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hero_slide_events_ts ON hero_slide_events(ts);
CREATE INDEX IF NOT EXISTS idx_hero_slide_events_slide ON hero_slide_events(slide_id);
CREATE INDEX IF NOT EXISTS idx_hero_slide_events_slide_type ON hero_slide_events(slide_id, event_type);
CREATE INDEX IF NOT EXISTS idx_hero_slide_events_session ON hero_slide_events(session_id);
