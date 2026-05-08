-- 0003_coupons.sql
--
-- D1 ledger of every successful coupon redemption. KV (storefront-config)
-- remains the source of truth for code definitions; this table records who
-- redeemed what and when so we can:
--   * enforce a per-customer redemption limit at order-place time, and
--   * report top codes by uses / total discount given without having to
--     iterate the entire orders KV blob.
--
-- One row per (order_id, code). Re-running the seed via INSERT OR IGNORE is
-- a no-op so retries on a flaky network don't double-count.

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  order_id TEXT NOT NULL,
  customer_id TEXT,
  customer_email TEXT NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'PHP',
  redeemed_at TEXT NOT NULL,
  UNIQUE (order_id, code)
);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_code ON coupon_redemptions(code);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_email ON coupon_redemptions(customer_email);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_customer ON coupon_redemptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_redeemed_at ON coupon_redemptions(redeemed_at);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_email_code ON coupon_redemptions(customer_email, code);
