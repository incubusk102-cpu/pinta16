-- 0012_newuser_modal_events.sql
--
-- D1 ledger of new-user discount modal A/B engagement events. The
-- modal in `src/components/NewUserModal.tsx` now deterministically
-- assigns each visitor to variant `a` or `b` (when variant B is
-- enabled in the storefront-config), and beacons one row to
-- `/api/newuser-modal-events` per:
--   * "impression" — modal mounted into the DOM for this visitor
--   * "copy"       — voucher code copied to clipboard
--   * "submit"     — email captured + voucher requested
--
-- Volume sanity: at most a few hundred impressions/day at Canvhub's
-- traffic. Three orders of magnitude under the D1 free-tier write cap.
--
-- Privacy mirrors `page_events` / `hero_slide_events`: session_id is
-- the same UUIDv4 already in localStorage as `canvhub_visitor_id`;
-- country is the `cf-ipcountry` 2-letter code. No IP, no PII.

CREATE TABLE IF NOT EXISTS newuser_modal_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  variant TEXT NOT NULL,
  event_type TEXT NOT NULL,
  country TEXT,
  ts TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_newuser_modal_events_ts ON newuser_modal_events(ts);
CREATE INDEX IF NOT EXISTS idx_newuser_modal_events_variant ON newuser_modal_events(variant);
CREATE INDEX IF NOT EXISTS idx_newuser_modal_events_variant_type ON newuser_modal_events(variant, event_type);
CREATE INDEX IF NOT EXISTS idx_newuser_modal_events_session ON newuser_modal_events(session_id);
