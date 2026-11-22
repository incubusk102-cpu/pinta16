-- 0007_notification_log.sql
--
-- D1 ledger of outgoing transactional notifications (email + Web Push).
-- One row per send attempt across every channel, so the admin has a
-- single queryable view of "did this customer actually get the email?"
-- and "how often does Resend skip with reason=disabled today?".
--
-- The row is written from inside the high-level send wrappers in
-- `functions/api/_lib/email.js` (`sendOrderEmail`, `sendNewOrderAdminAlert`,
-- `sendWelcomeEmail`) and `functions/api/_lib/push.js` (`sendOrderPush`).
-- Test sends (`sendOrderTestEmail`, `sendOrderTestPush`) are deliberately
-- excluded — those are operator previews to one's own inbox, not real
-- customer-facing traffic.
--
-- Privacy:
--   * `recipient` stores the **lowercased email address** the message
--     was sent to. Operators need this to answer the most common support
--     question ("did this customer get their confirmation?"). The
--     readback endpoint is admin-only (gated by `isAuthenticated()`).
--   * No IP, no UA, no message body or subject is persisted here.
--   * `reason` carries the skip reason or a short error string capped
--     at 200 chars before storage.
--
-- Volume sanity:
--   Realistic Canvhub mix: a handful of order status changes per day,
--   one welcome email per signup, occasional admin alerts. Worst-case
--   ~200 rows/day, well under the D1 free-tier 100 k writes/day cap.

CREATE TABLE IF NOT EXISTS notification_log (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  kind TEXT NOT NULL,
  recipient TEXT,
  order_id TEXT,
  delivered INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  provider TEXT,
  reason TEXT,
  attempted INTEGER,
  successful INTEGER,
  ts TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notification_log_ts ON notification_log(ts);
CREATE INDEX IF NOT EXISTS idx_notification_log_channel_kind
  ON notification_log(channel, kind);
CREATE INDEX IF NOT EXISTS idx_notification_log_kind
  ON notification_log(kind);
CREATE INDEX IF NOT EXISTS idx_notification_log_order
  ON notification_log(order_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_recipient
  ON notification_log(recipient);
