-- 0008_stock_events.sql
--
-- D1 ledger of every product availability transition. One row per
-- change so the admin has a queryable answer to "when did this
-- painting actually get marked sold?", "which paintings sold in the
-- last 30 days?", and "are we running low on available inventory
-- in any one category?".
--
-- Each canvhub product is a one-of-one original. The "stock" model
-- is the `availability` enum on the product:
--
--   available | reserved | sold | draft
--
-- A row is written from inside the products handler
-- (`functions/api/products.js`) on POST/PATCH/DELETE — fire-and-forget,
-- so a logging failure can never break the actual mutation.
--
-- Privacy: there is no customer data on this table. `actor` is the
-- admin email (when a logged-in admin made the change) or the literal
-- string `"system"` (background jobs / checkout reservations). No IP,
-- no UA, no session ID.
--
-- Volume sanity:
--   Realistic mix at canvhub scale: a handful of admin edits per day
--   plus the occasional sale. Worst case ~50 rows/day, well under
--   the D1 free-tier 100k writes/day cap.

CREATE TABLE IF NOT EXISTS stock_events (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  product_title TEXT,
  category TEXT,
  from_state TEXT,
  to_state TEXT NOT NULL,
  source TEXT NOT NULL,
  actor TEXT,
  ts TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stock_events_ts ON stock_events(ts);
CREATE INDEX IF NOT EXISTS idx_stock_events_product
  ON stock_events(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_events_to_state
  ON stock_events(to_state);
CREATE INDEX IF NOT EXISTS idx_stock_events_category
  ON stock_events(category);
CREATE INDEX IF NOT EXISTS idx_stock_events_source
  ON stock_events(source);
