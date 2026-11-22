// Returns / RMA queries.
//
// KV (`ORDERS` namespace) keeps the source of truth on the order document
// (`order.returnRequest = {...}`). This module mirrors the request into a
// queryable D1 table so the admin "Returns" panel can list pending requests
// across all orders without scanning the entire orders blob, and so we can
// answer "what % of orders ended up returned" without writing a custom
// reducer.
//
// Idempotent on the synthetic `${order.id}:return` id so repeated status
// writes converge. Null-safe: when `env.DB` is unbound every helper returns
// `null` and the KV write owns the customer-visible state.

import { getD1 } from "../core.js";

// Mirror a single order's `returnRequest` document into the D1
// `return_requests` table. KV (orders blob) stays the source of truth; this
// mirror lets the admin "Returns" panel list pending requests across all
// orders without scanning the entire blob, and gives us SQL-grouped
// analytics ("approval rate by reason") for free.
//
// Idempotent on `id` (the synthetic `${order.id}:return` key) so repeated
// status writes converge instead of inserting duplicates. Null-safe: when
// env.DB is unbound this is a silent no-op and the KV write still owns
// the customer-visible state.
export async function mirrorReturnRequestToD1({ order, request, customerId }) {
  const db = getD1();
  if (!db) return null;
  if (!order || typeof order.id !== "string" || !order.id) return null;
  if (!request || typeof request !== "object") return null;

  const email = String(order.orderInfo?.email || "")
    .trim()
    .toLowerCase();
  if (!email) return null;
  if (typeof request.id !== "string" || !request.id) return null;

  const now = new Date().toISOString();
  const itemsJson =
    request.items && Array.isArray(request.items)
      ? JSON.stringify(request.items).slice(0, 8000)
      : null;
  const photosJson =
    request.photoUrls && Array.isArray(request.photoUrls)
      ? JSON.stringify(request.photoUrls).slice(0, 4000)
      : null;

  try {
    await db
      .prepare(
        `INSERT INTO return_requests
         (id, order_id, customer_id, customer_email,
          status, reason, description, photo_urls_json, items_json,
          rma_number, denial_reason, refund_amount_cents,
          requested_at, decided_at, received_at, completed_at, cancelled_at,
          updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           reason = excluded.reason,
           description = excluded.description,
           photo_urls_json = excluded.photo_urls_json,
           items_json = excluded.items_json,
           rma_number = excluded.rma_number,
           denial_reason = excluded.denial_reason,
           refund_amount_cents = excluded.refund_amount_cents,
           decided_at = excluded.decided_at,
           received_at = excluded.received_at,
           completed_at = excluded.completed_at,
           cancelled_at = excluded.cancelled_at,
           updated_at = excluded.updated_at`,
      )
      .bind(
        request.id,
        order.id,
        customerId || null,
        email,
        String(request.status || "requested"),
        String(request.reason || "other"),
        typeof request.description === "string"
          ? request.description.slice(0, 2000)
          : null,
        photosJson,
        itemsJson,
        typeof request.rmaNumber === "string" ? request.rmaNumber : null,
        typeof request.denialReason === "string"
          ? request.denialReason.slice(0, 1000)
          : null,
        request.refundAmount != null
          ? Math.round(Number(request.refundAmount) || 0)
          : null,
        request.requestedAt || now,
        request.decidedAt || null,
        request.receivedAt || null,
        request.completedAt || null,
        request.cancelledAt || null,
        now,
      )
      .run();
    return { mirrored: true };
  } catch (err) {
    return { mirrored: false, reason: String(err?.message || err) };
  }
}

// List recent return requests, optionally filtered by status. Used by the
// admin Returns panel to render the queue without iterating the orders
// KV blob. Returns null when D1 is unbound so the caller can fall back to
// the in-memory scan it already does for refunds.
export async function listReturnRequests({ status = null, limit = 200 } = {}) {
  const db = getD1();
  if (!db) return null;
  const cap = Math.min(500, Math.max(1, Math.floor(Number(limit) || 200)));
  try {
    const sql = status
      ? `SELECT * FROM return_requests WHERE status = ? ORDER BY requested_at DESC LIMIT ?`
      : `SELECT * FROM return_requests ORDER BY requested_at DESC LIMIT ?`;
    const stmt = status
      ? db.prepare(sql).bind(String(status), cap)
      : db.prepare(sql).bind(cap);
    const result = await stmt.all();
    const rows = Array.isArray(result?.results) ? result.results : [];
    return rows.map((r) => ({
      id: String(r.id || ""),
      orderId: String(r.order_id || ""),
      customerId: r.customer_id ? String(r.customer_id) : null,
      customerEmail: String(r.customer_email || ""),
      status: String(r.status || "requested"),
      reason: String(r.reason || ""),
      description: r.description ? String(r.description) : "",
      rmaNumber: r.rma_number ? String(r.rma_number) : null,
      denialReason: r.denial_reason ? String(r.denial_reason) : "",
      refundAmount:
        r.refund_amount_cents != null
          ? Math.max(0, Math.floor(Number(r.refund_amount_cents) || 0))
          : null,
      requestedAt: String(r.requested_at || ""),
      decidedAt: r.decided_at ? String(r.decided_at) : "",
      receivedAt: r.received_at ? String(r.received_at) : "",
      completedAt: r.completed_at ? String(r.completed_at) : "",
      cancelledAt: r.cancelled_at ? String(r.cancelled_at) : "",
    }));
  } catch {
    return null;
  }
}

// Aggregate "returns funnel" metrics straight from the D1 ledger. Returns
// null when D1 is unbound so the admin endpoint can decide to skip the
// "Returns" KPI panel rather than show stale zeros.
export async function returnAnalytics() {
  const db = getD1();
  if (!db) return null;
  try {
    const result = await db
      .prepare(
        `SELECT status, COUNT(*) AS n, SUM(refund_amount_cents) AS refunded
         FROM return_requests
         GROUP BY status`,
      )
      .all();
    const rows = Array.isArray(result?.results) ? result.results : [];
    const byStatus = {};
    let totalRefundedCents = 0;
    let total = 0;
    for (const r of rows) {
      const status = String(r.status || "");
      const n = Math.max(0, Math.floor(Number(r.n) || 0));
      byStatus[status] = n;
      total += n;
      if (status === "completed") {
        totalRefundedCents += Math.max(0, Math.floor(Number(r.refunded) || 0));
      }
    }
    return { total, byStatus, totalRefundedCents };
  } catch {
    return null;
  }
}
