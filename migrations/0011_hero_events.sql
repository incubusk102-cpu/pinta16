-- 0011_hero_events.sql
--
-- D1 ledger of homepage hero-carousel events: per-slide impressions
-- and CTA clicks. Powers the "Per-slide CTR" panel inside the admin
-- Hero Slides editor, so editors can see which slide actually pulls
-- weight rather than guessing from anecdata.
--
-- One row per (session, slide, kind) — the client beacon de-dupes
-- impressions per session so a sticky autoplay loop doesn't inflate
-- impression counts and skew CTR downward. Clicks are never deduped:
-- if a shopper bounces back and clicks the same CTA twice that
-- absolutely is two clicks worth of intent.
--
-- Privacy:
--   * `session_id` is the same `canvhub_visitor_id` UUIDv4 already
--     used by useVisitorHeartbeat / usePageEventBeacon. Identifies a
--     browser, never the human. No PII.
--
-- Volume sanity:
--   At 5 000 homepage views/day with 5 slides each, the impression
--   beacon fires at most ~5 rows/session = 25 000 D1 writes/day, well
--   inside the free-tier 100 k/day write budget.

CREATE TABLE IF NOT EXISTS hero_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  slide_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('impression', 'click')),
  ts TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hero_events_ts ON hero_events(ts);
CREATE INDEX IF NOT EXISTS idx_hero_events_slide ON hero_events(slide_id);
CREATE INDEX IF NOT EXISTS idx_hero_events_kind ON hero_events(kind);
CREATE INDEX IF NOT EXISTS idx_hero_events_session_slide_kind
  ON hero_events(session_id, slide_id, kind);
