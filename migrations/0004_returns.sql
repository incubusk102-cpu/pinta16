-- 0004_returns.sql
--
-- Returns / RMA workflow ledger.
--
-- KV `orders` keeps the source-of-truth on the order document
-- (`order.returnRequest = {...}`). This table is a queryable mirror so the
-- admin "Returns" section can list pending requests across all orders
-- without scanning the entire orders blob, and so we can answer
-- "what % of orders ended up returned" without writing a custom reducer.
--
-- One row per return request. A given order can only have one active
-- return at a time (UNIQUE on order_id), and the status field tracks the
-- lifecycle: requested → approved → received → completed (happy path)
-- or requested → denied (rejection path). Customer-cancelled requests
-- collapse the row's status to 'cancelled' rather than deleting the row,
-- so we keep an audit trail.

CREATE TABLE IF NOT EXISTS return_requests (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  customer_id TEXT,
  customer_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  reason TEXT NOT NULL,
  description TEXT,
  photo_urls_json TEXT,
  items_json TEXT,
  rma_number TEXT,
  denial_reason TEXT,
  refund_amount_cents INTEGER,
  requested_at TEXT NOT NULL,
  decided_at TEXT,
  received_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_return_requests_order ON return_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_return_requests_email ON return_requests(customer_email);
CREATE INDEX IF NOT EXISTS idx_return_requests_status ON return_requests(status);
CREATE INDEX IF NOT EXISTS idx_return_requests_requested_at ON return_requests(requested_at);
CREATE INDEX IF NOT EXISTS idx_return_requests_status_requested_at ON return_requests(status, requested_at);
