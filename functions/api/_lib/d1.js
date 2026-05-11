// D1 (SQLite) helper for the hybrid KV+D1 architecture.
// All functions are null-safe: when env.DB is not bound (user hasn't
// created the D1 database yet), every call gracefully returns null/no-op.
// This means the site keeps working exactly as before until D1 is provisioned.

import { getCloudflareEnv } from "./context.js";

export function getD1() {
  const env = getCloudflareEnv();
  return env?.DB || null;
}

export function isD1Available() {
  return Boolean(getD1());
}

export async function d1Run(sql, params = []) {
  const db = getD1();
  if (!db) return null;
  return db
    .prepare(sql)
    .bind(...params)
    .run();
}

export async function d1All(sql, params = []) {
  const db = getD1();
  if (!db) return null;
  return db
    .prepare(sql)
    .bind(...params)
    .all();
}

export async function d1First(sql, params = []) {
  const db = getD1();
  if (!db) return null;
  return db
    .prepare(sql)
    .bind(...params)
    .first();
}

export async function d1Batch(stmts) {
  const db = getD1();
  if (!db) return null;
  return db.batch(stmts);
}

// Upsert a customer row from an order's orderInfo. Returns the customer id.
export async function upsertCustomerFromOrder(order) {
  const db = getD1();
  if (!db) return null;
  const info = order?.orderInfo;
  if (!info?.email) return null;

  const email = String(info.email).trim().toLowerCase();
  const now = new Date().toISOString();
  const id = `cust_${email.replace(/[^a-z0-9]/g, "_")}`;

  await db
    .prepare(
      `INSERT INTO customers (id, email, full_name, phone, city, region, first_order_at, last_order_at, total_orders, total_spent, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         full_name = COALESCE(excluded.full_name, customers.full_name),
         phone = COALESCE(excluded.phone, customers.phone),
         city = COALESCE(excluded.city, customers.city),
         region = COALESCE(excluded.region, customers.region),
         last_order_at = excluded.last_order_at,
         total_orders = customers.total_orders + 1,
         total_spent = customers.total_spent + excluded.total_spent,
         updated_at = excluded.updated_at`,
    )
    .bind(
      id,
      email,
      info.fullName || null,
      info.phone || null,
      info.city || null,
      info.region || null,
      order.createdAt || now,
      order.createdAt || now,
      Math.round(Number(order.total) || 0),
      now,
      now,
    )
    .run();

  return id;
}

// Mirror a full order (with items) from KV shape into D1. Idempotent.
export async function mirrorOrderToD1(order) {
  const db = getD1();
  if (!db) return { mirrored: false, reason: "no-binding" };

  try {
    const customerId = await upsertCustomerFromOrder(order);
    const info = order.orderInfo || {};
    const now = new Date().toISOString();

    const stmts = [
      db
        .prepare(
          `INSERT OR REPLACE INTO orders
           (id, customer_id, customer_email, status,
            payment_intent_id, voucher_code,
            subtotal, shipping_fee, discount, total, currency,
            city, region, province, courier,
            created_at, shipped_at, delivered_at, cancelled_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          order.id,
          customerId || null,
          String(info.email || "").toLowerCase(),
          String(order.status || "confirmed"),
          order.paymentIntentId || null,
          order.voucherCode || null,
          Math.round(Number(order.subtotal) || 0),
          Math.round(Number(order.shippingFee) || 0),
          Math.round(Number(order.discount) || 0),
          Math.round(Number(order.total) || 0),
          "PHP",
          info.city || null,
          info.region || null,
          info.province || null,
          info.courier || null,
          order.createdAt || now,
          order.shippedAt || null,
          order.deliveredAt || null,
          order.cancelledAt || null,
          now,
        ),
      db.prepare(`DELETE FROM order_items WHERE order_id = ?`).bind(order.id),
    ];

    const items = Array.isArray(order.items) ? order.items : [];
    items.forEach((item, idx) => {
      stmts.push(
        db
          .prepare(
            `INSERT INTO order_items
             (id, order_id, product_id, product_title, unit_price, quantity, subtotal, created_at)
             VALUES (?,?,?,?,?,?,?,?)`,
          )
          .bind(
            `${order.id}:${idx}`,
            order.id,
            item.id || null,
            String(item.title || "").slice(0, 300),
            Math.round(Number(item.price) || 0),
            Math.max(1, Math.floor(Number(item.quantity) || 1)),
            Math.round(
              (Number(item.price) || 0) *
                Math.max(1, Math.floor(Number(item.quantity) || 1)),
            ),
            order.createdAt || now,
          ),
      );
    });

    await db.batch(stmts);
    return { mirrored: true };
  } catch (err) {
    return { mirrored: false, reason: String(err?.message || err) };
  }
}

// ─── Wishlists ───────────────────────────────────────────────────────────────

// Replace every wishlist row for a single user with the supplied list. KV
// remains the source of truth; D1 is a queryable mirror so the admin panel
// can answer "which paintings are most-wishlisted?" with a normal GROUP BY.
//
// Idempotent and null-safe: when env.DB is unbound this is a no-op and the
// caller's KV write still succeeds.
export async function syncWishlistToD1(userId, items) {
  const db = getD1();
  if (!db) return null;
  if (!userId || typeof userId !== "string") return null;
  const safeItems = Array.isArray(items) ? items : [];

  const now = new Date().toISOString();
  const stmts = [
    db.prepare(`DELETE FROM wishlist_items WHERE user_id = ?`).bind(userId),
  ];

  for (const item of safeItems) {
    if (!item || typeof item.id !== "string" || !item.id) continue;
    const addedAt =
      typeof item.addedAt === "string" && item.addedAt ? item.addedAt : now;
    stmts.push(
      db
        .prepare(
          `INSERT INTO wishlist_items
           (id, user_id, product_id, product_title, product_image, product_price, added_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          `${userId}:${item.id}`,
          userId,
          item.id,
          typeof item.title === "string" ? item.title : null,
          typeof item.image === "string" ? item.image : null,
          item.price != null && Number.isFinite(Number(item.price))
            ? Math.round(Number(item.price))
            : null,
          addedAt,
          now,
        ),
    );
  }

  try {
    await db.batch(stmts);
    return { mirrored: true, count: safeItems.length };
  } catch (err) {
    return { mirrored: false, reason: String(err?.message || err) };
  }
}

// ─── Coupons ─────────────────────────────────────────────────────────────────

// Record a single successful coupon redemption. KV (storefront-config) stays
// the source of truth for coupon definitions and the coarse global usage
// counter; this ledger lets us enforce per-customer caps and run "top codes
// by total discount given" reports without iterating the orders KV blob.
//
// Idempotent on (order_id, code) — retries from a flaky network must not
// double-count. Null-safe: when env.DB is unbound this is a silent no-op.
export async function recordCouponRedemption({
  code,
  order,
  customerId = null,
}) {
  const db = getD1();
  if (!db) return null;
  const upper = String(code || "")
    .trim()
    .toUpperCase();
  if (!upper) return null;
  if (!order || typeof order.id !== "string" || !order.id) return null;

  const email = String(order.orderInfo?.email || "")
    .trim()
    .toLowerCase();
  if (!email) return null;

  const now = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT OR IGNORE INTO coupon_redemptions
         (id, code, order_id, customer_id, customer_email,
          discount_cents, subtotal_cents, total_cents, currency, redeemed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        `${order.id}:${upper}`,
        upper,
        order.id,
        customerId,
        email,
        Math.round(Number(order.discount) || 0),
        Math.round(Number(order.subtotal) || 0),
        Math.round(Number(order.total) || 0),
        "PHP",
        order.createdAt || now,
      )
      .run();
    return { mirrored: true };
  } catch (err) {
    return { mirrored: false, reason: String(err?.message || err) };
  }
}

// How many times a given customer has redeemed a given code. Used to enforce
// `maxRedemptionsPerCustomer` at order-place time. Returns null when D1 is
// unbound so the caller can decide to fall back to the global usage cap
// instead of refusing the order.
export async function customerCouponRedemptionCount(email, code) {
  const db = getD1();
  if (!db) return null;
  const e = String(email || "")
    .trim()
    .toLowerCase();
  const c = String(code || "")
    .trim()
    .toUpperCase();
  if (!e || !c) return 0;
  try {
    const row = await db
      .prepare(
        `SELECT COUNT(*) AS n
         FROM coupon_redemptions
         WHERE customer_email = ? AND code = ?`,
      )
      .bind(e, c)
      .first();
    return Math.max(0, Math.floor(Number(row?.n) || 0));
  } catch {
    return null;
  }
}

// Aggregate a "top codes" report straight from the D1 ledger. Returns null
// when D1 is unbound so the admin endpoint can fall back to the existing
// KV-based aggregation. Capped at 200 rows so a misbehaving codebase can't
// fill the response.
export async function couponAnalytics({ limit = 50 } = {}) {
  const db = getD1();
  if (!db) return null;
  const cap = Math.min(200, Math.max(1, Math.floor(Number(limit) || 50)));
  try {
    const result = await db
      .prepare(
        `SELECT
           code,
           COUNT(*) AS uses,
           SUM(discount_cents) AS total_discount_cents,
           SUM(total_cents) AS gross_revenue_cents,
           COUNT(DISTINCT customer_email) AS unique_customers,
           MAX(redeemed_at) AS last_redeemed_at
         FROM coupon_redemptions
         GROUP BY code
         ORDER BY uses DESC
         LIMIT ?`,
      )
      .bind(cap)
      .all();
    const rows = Array.isArray(result?.results) ? result.results : [];
    return rows.map((r) => ({
      code: String(r.code || ""),
      uses: Math.max(0, Math.floor(Number(r.uses) || 0)),
      totalDiscount: Math.max(
        0,
        Math.floor(Number(r.total_discount_cents) || 0),
      ),
      grossRevenue: Math.max(0, Math.floor(Number(r.gross_revenue_cents) || 0)),
      uniqueCustomers: Math.max(0, Math.floor(Number(r.unique_customers) || 0)),
      lastRedeemedAt:
        typeof r.last_redeemed_at === "string" ? r.last_redeemed_at : "",
    }));
  } catch {
    return null;
  }
}

// ─── Returns / RMA ───────────────────────────────────────────────────────────

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

// Mirror a product (from KV shape) into D1. Idempotent.
export async function mirrorProductToD1(product, isDefault = false) {
  const db = getD1();
  if (!db) return null;

  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT OR REPLACE INTO products
       (id, title, category, price, sale_price, is_default, is_sold, stock_count, low_stock_threshold, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      product.id,
      product.title || product.name || "",
      product.category || null,
      Math.round(Number(product.price) || 0),
      product.salePrice ? Math.round(Number(product.salePrice)) : null,
      isDefault ? 1 : 0,
      product.availability === "sold" || product.sold ? 1 : 0,
      Math.max(0, Math.floor(Number(product.stockCount) || 1)),
      Math.max(0, Math.floor(Number(product.lowStockThreshold) || 1)),
      product.createdAt || now,
      now,
    )
    .run();
}

// ─── Page events ─────────────────────────────────────────────────────────────

// Allow-listed `path_kind` enum. The client maps each pathname to one of
// these buckets so the analytics rollups (funnel, by-kind histograms) stay
// stable across navigation refactors. Adding a new public route? Add the
// matching kind here AND in `src/lib/page-event-kind.ts` so server-side
// validation accepts it.
export const PAGE_EVENT_KINDS = new Set([
  "home",
  "gallery",
  "collection",
  "product",
  "preview",
  "checkout",
  "checkout-success",
  "account",
  "track",
  "policy",
  "login",
  "signup",
  "other",
]);

const ALLOWED_DEVICES = new Set(["mobile", "tablet", "desktop", "unknown"]);

// Record one page-view event from the public storefront beacon. Caller is
// `functions/api/page-events.js`. Null-safe when env.DB is unbound.
export async function recordPageEvent({
  id,
  sessionId,
  path,
  pathKind,
  referrerHost = null,
  country = null,
  device = null,
}) {
  const db = getD1();
  if (!db) return null;
  const sid = String(sessionId || "")
    .trim()
    .slice(0, 64);
  if (!sid || !/^[a-zA-Z0-9_-]+$/.test(sid)) return null;
  const p = String(path || "").slice(0, 500);
  if (!p.startsWith("/")) return null;
  const kind = String(pathKind || "other").slice(0, 24);
  if (!PAGE_EVENT_KINDS.has(kind)) return null;
  const dev =
    device && ALLOWED_DEVICES.has(String(device)) ? String(device) : null;
  const ref =
    typeof referrerHost === "string" && referrerHost
      ? referrerHost.slice(0, 128)
      : null;
  const eventId =
    typeof id === "string" && id.length > 0 && id.length <= 64
      ? id
      : `pe_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT OR IGNORE INTO page_events
         (id, session_id, path, path_kind, referrer_host, country, device, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(eventId, sid, p, kind, ref, country || null, dev, now)
      .run();
    return { recorded: true };
  } catch (err) {
    return { recorded: false, reason: String(err?.message || err) };
  }
}

const sinceFromDays = (days) =>
  new Date(
    Date.now() - Math.max(1, Math.floor(Number(days) || 30)) * 86400_000,
  ).toISOString();

// Funnel: distinct sessions that reached each kind within the window.
// Returns one row per kind so the admin can render a step-by-step
// drop-off chart. Only counts sessions that actually visited at least
// one page in the window.
export async function pageEventFunnel({ days = 30 } = {}) {
  const db = getD1();
  if (!db) return null;
  const since = sinceFromDays(days);
  try {
    const result = await db
      .prepare(
        `SELECT path_kind,
                COUNT(DISTINCT session_id) AS sessions,
                COUNT(*) AS views
         FROM page_events
         WHERE ts >= ?
         GROUP BY path_kind`,
      )
      .bind(since)
      .all();
    return result?.results || [];
  } catch {
    return null;
  }
}

// Top exact paths over the window. Useful for spotting which products
// or collections get the most attention.
export async function topPagePaths({ days = 30, limit = 25 } = {}) {
  const db = getD1();
  if (!db) return null;
  const since = sinceFromDays(days);
  const cap = Math.min(200, Math.max(1, Math.floor(Number(limit) || 25)));
  try {
    const result = await db
      .prepare(
        `SELECT path,
                path_kind,
                COUNT(DISTINCT session_id) AS sessions,
                COUNT(*) AS views,
                MAX(ts) AS last_seen_at
         FROM page_events
         WHERE ts >= ?
         GROUP BY path
         ORDER BY views DESC, last_seen_at DESC
         LIMIT ?`,
      )
      .bind(since, cap)
      .all();
    return result?.results || [];
  } catch {
    return null;
  }
}

// Top referrer hosts over the window — where shoppers came from.
export async function topReferrerHosts({ days = 30, limit = 20 } = {}) {
  const db = getD1();
  if (!db) return null;
  const since = sinceFromDays(days);
  const cap = Math.min(100, Math.max(1, Math.floor(Number(limit) || 20)));
  try {
    const result = await db
      .prepare(
        `SELECT referrer_host AS host,
                COUNT(*) AS hits,
                COUNT(DISTINCT session_id) AS sessions
         FROM page_events
         WHERE ts >= ? AND referrer_host IS NOT NULL AND referrer_host != ''
         GROUP BY referrer_host
         ORDER BY hits DESC
         LIMIT ?`,
      )
      .bind(since, cap)
      .all();
    return result?.results || [];
  } catch {
    return null;
  }
}

// Daily traffic timeseries. One row per UTC day in the window with
// totals for views, distinct sessions, mobile share.
export async function pageEventDaily({ days = 30 } = {}) {
  const db = getD1();
  if (!db) return null;
  const since = sinceFromDays(days);
  try {
    const result = await db
      .prepare(
        `SELECT substr(ts, 1, 10) AS day,
                COUNT(*) AS views,
                COUNT(DISTINCT session_id) AS sessions,
                SUM(CASE WHEN device = 'mobile' THEN 1 ELSE 0 END) AS mobile_views
         FROM page_events
         WHERE ts >= ?
         GROUP BY day
         ORDER BY day ASC`,
      )
      .bind(since)
      .all();
    return result?.results || [];
  } catch {
    return null;
  }
}

// Distinct device counts over the window.
export async function pageEventDeviceMix({ days = 30 } = {}) {
  const db = getD1();
  if (!db) return null;
  const since = sinceFromDays(days);
  try {
    const result = await db
      .prepare(
        `SELECT COALESCE(device, 'unknown') AS device,
                COUNT(*) AS views,
                COUNT(DISTINCT session_id) AS sessions
         FROM page_events
         WHERE ts >= ?
         GROUP BY device
         ORDER BY views DESC`,
      )
      .bind(since)
      .all();
    return result?.results || [];
  } catch {
    return null;
  }
}

// ─── Search events ───────────────────────────────────────────────────────────

// Record a single stable storefront search query. Caller is the public
// `/api/search-events` beacon (see `functions/api/search-events.js`); the
// gallery on the storefront fires this once after the typing-debounce
// settles, not on every keystroke.
//
// `id` is a uuid produced by the caller (one row per debounced query) so
// retries from a flaky network become an idempotent INSERT OR IGNORE.
//
// Null-safe: when env.DB is unbound this is a silent no-op so the public
// gallery search keeps working unchanged.
export async function recordSearchEvent({
  id,
  query,
  resultsCount = 0,
  filterCategory = null,
  filterAvailability = null,
  filterPrice = null,
  country = null,
}) {
  const db = getD1();
  if (!db) return null;
  const raw = String(query || "").slice(0, 200);
  if (!raw.trim()) return null;
  const lc = raw.trim().toLowerCase();
  const eventId =
    typeof id === "string" && id.length > 0 && id.length <= 64
      ? id
      : `se_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT OR IGNORE INTO search_events
         (id, query, query_lc, results_count,
          filter_category, filter_availability, filter_price,
          country, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        eventId,
        raw,
        lc,
        Math.max(0, Math.floor(Number(resultsCount) || 0)),
        filterCategory || null,
        filterAvailability || null,
        filterPrice || null,
        country || null,
        now,
      )
      .run();
    return { recorded: true };
  } catch (err) {
    return { recorded: false, reason: String(err?.message || err) };
  }
}

// Top N queries over the last `days` days, ordered by total uses. Returns
// the most-used queries first plus a couple of stats per query so the admin
// panel can render "saw 42 searches for 'dela rosa', 38% hit zero results".
export async function topSearchQueries({ days = 30, limit = 50 } = {}) {
  const db = getD1();
  if (!db) return null;
  const since = new Date(
    Date.now() - Math.max(1, Math.floor(Number(days) || 30)) * 86400_000,
  ).toISOString();
  const cap = Math.min(200, Math.max(1, Math.floor(Number(limit) || 50)));
  try {
    const result = await db
      .prepare(
        `SELECT
           query_lc AS query,
           COUNT(*) AS uses,
           SUM(CASE WHEN results_count = 0 THEN 1 ELSE 0 END) AS zero_result_uses,
           AVG(results_count) AS avg_results,
           MAX(ts) AS last_seen_at
         FROM search_events
         WHERE ts >= ?
         GROUP BY query_lc
         ORDER BY uses DESC, last_seen_at DESC
         LIMIT ?`,
      )
      .bind(since, cap)
      .all();
    return result?.results || [];
  } catch {
    return null;
  }
}

// Top N queries that returned zero results (the actionable list — these
// are searches you couldn't fulfil). Same shape as topSearchQueries but
// filtered.
export async function zeroResultSearchQueries({ days = 30, limit = 50 } = {}) {
  const db = getD1();
  if (!db) return null;
  const since = new Date(
    Date.now() - Math.max(1, Math.floor(Number(days) || 30)) * 86400_000,
  ).toISOString();
  const cap = Math.min(200, Math.max(1, Math.floor(Number(limit) || 50)));
  try {
    const result = await db
      .prepare(
        `SELECT
           query_lc AS query,
           COUNT(*) AS uses,
           MAX(ts) AS last_seen_at
         FROM search_events
         WHERE ts >= ? AND results_count = 0
         GROUP BY query_lc
         ORDER BY uses DESC, last_seen_at DESC
         LIMIT ?`,
      )
      .bind(since, cap)
      .all();
    return result?.results || [];
  } catch {
    return null;
  }
}

// Recent raw events for the timeline view in the admin panel. Returns the
// `limit` most-recent rows (default 100, hard cap 500).
export async function recentSearchEvents({ limit = 100 } = {}) {
  const db = getD1();
  if (!db) return null;
  const cap = Math.min(500, Math.max(1, Math.floor(Number(limit) || 100)));
  try {
    const result = await db
      .prepare(
        `SELECT id, query, results_count, filter_category, filter_availability,
                filter_price, country, ts
         FROM search_events
         ORDER BY ts DESC
         LIMIT ?`,
      )
      .bind(cap)
      .all();
    return result?.results || [];
  } catch {
    return null;
  }
}

// ─── Notification log ─────────────────────────────────────────────────────────

// Allow-listed channels. The admin panel and the readback endpoint both
// filter against this so a malformed call from a refactor can't pollute
// the table with a typo'd channel.
export const NOTIFICATION_CHANNELS = new Set(["email", "push"]);

// Persist one outgoing-notification attempt. Called from the high-level
// send wrappers in `email.js` and `push.js` AFTER the provider returns.
// Never throws — a logging failure must not break the actual send.
//
// `result` is the object the send wrapper returns:
//   { delivered, skipped, reason, provider, error, attempted, successful }
// We translate that into the row fields. Truncates `reason`/`error` to
// 200 chars so a misbehaving provider can't dump a 100 KB stack trace
// into D1.
export async function recordNotification({
  channel,
  kind,
  recipient = null,
  orderId = null,
  result,
}) {
  const db = getD1();
  if (!db) return null;
  if (!NOTIFICATION_CHANNELS.has(channel)) return null;
  const k = String(kind || "")
    .trim()
    .slice(0, 64);
  if (!k) return null;
  const r = result || {};
  const recipientLc =
    typeof recipient === "string" && recipient
      ? recipient.trim().toLowerCase().slice(0, 160) || null
      : null;
  const oid =
    typeof orderId === "string" && orderId
      ? orderId.trim().slice(0, 64) || null
      : null;
  const delivered = r.delivered ? 1 : 0;
  const skipped = r.skipped ? 1 : 0;
  const provider =
    typeof r.provider === "string" && r.provider
      ? r.provider.slice(0, 32)
      : null;
  const rawReason =
    (typeof r.reason === "string" && r.reason) ||
    (typeof r.error === "string" && r.error) ||
    "";
  const reason = rawReason ? String(rawReason).slice(0, 200) : null;
  const attempted =
    typeof r.attempted === "number" && Number.isFinite(r.attempted)
      ? Math.max(0, Math.floor(r.attempted))
      : null;
  const successful =
    typeof r.successful === "number" && Number.isFinite(r.successful)
      ? Math.max(0, Math.floor(r.successful))
      : null;
  const id = `nl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const ts = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO notification_log
         (id, channel, kind, recipient, order_id, delivered, skipped,
          provider, reason, attempted, successful, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        channel,
        k,
        recipientLc,
        oid,
        delivered,
        skipped,
        provider,
        reason,
        attempted,
        successful,
        ts,
      )
      .run();
    return { recorded: true };
  } catch (err) {
    return { recorded: false, reason: String(err?.message || err) };
  }
}

// Per-day rollup so the admin panel can render a sent/skipped/failed
// timeseries. `delivered = 1` is sent, `skipped = 1` is skipped, the
// remainder (`delivered = 0 AND skipped = 0`) is failed.
export async function notificationLogDaily({ days = 30 } = {}) {
  const db = getD1();
  if (!db) return null;
  const since = sinceFromDays(days);
  try {
    const result = await db
      .prepare(
        `SELECT substr(ts, 1, 10) AS day,
                SUM(CASE WHEN delivered = 1 THEN 1 ELSE 0 END) AS delivered,
                SUM(CASE WHEN skipped = 1 THEN 1 ELSE 0 END) AS skipped,
                SUM(CASE WHEN delivered = 0 AND skipped = 0 THEN 1 ELSE 0 END)
                  AS failed,
                COUNT(*) AS total
         FROM notification_log
         WHERE ts >= ?
         GROUP BY day
         ORDER BY day ASC`,
      )
      .bind(since)
      .all();
    return result?.results || [];
  } catch {
    return null;
  }
}

// Per-(channel, kind) summary so the admin can spot which kinds are
// failing or being skipped disproportionately.
export async function notificationLogByKind({ days = 30, limit = 50 } = {}) {
  const db = getD1();
  if (!db) return null;
  const since = sinceFromDays(days);
  const cap = Math.min(200, Math.max(1, Math.floor(Number(limit) || 50)));
  try {
    const result = await db
      .prepare(
        `SELECT channel,
                kind,
                COUNT(*) AS total,
                SUM(CASE WHEN delivered = 1 THEN 1 ELSE 0 END) AS delivered,
                SUM(CASE WHEN skipped = 1 THEN 1 ELSE 0 END) AS skipped,
                SUM(CASE WHEN delivered = 0 AND skipped = 0 THEN 1 ELSE 0 END)
                  AS failed,
                MAX(ts) AS last_seen_at
         FROM notification_log
         WHERE ts >= ?
         GROUP BY channel, kind
         ORDER BY total DESC, last_seen_at DESC
         LIMIT ?`,
      )
      .bind(since, cap)
      .all();
    return result?.results || [];
  } catch {
    return null;
  }
}

// Recent raw rows for the timeline view. Optional filters: `kind`,
// `channel`, and `deliveredOnly` (when true, only `delivered = 1`).
export async function recentNotificationLog({
  limit = 100,
  kind = null,
  channel = null,
  deliveredOnly = false,
} = {}) {
  const db = getD1();
  if (!db) return null;
  const cap = Math.min(500, Math.max(1, Math.floor(Number(limit) || 100)));
  const where = [];
  const params = [];
  if (typeof channel === "string" && NOTIFICATION_CHANNELS.has(channel)) {
    where.push("channel = ?");
    params.push(channel);
  }
  if (typeof kind === "string" && kind.trim()) {
    where.push("kind = ?");
    params.push(kind.trim().slice(0, 64));
  }
  if (deliveredOnly) {
    where.push("delivered = 1");
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  params.push(cap);
  try {
    const result = await db
      .prepare(
        `SELECT id, channel, kind, recipient, order_id, delivered, skipped,
                provider, reason, attempted, successful, ts
         FROM notification_log
         ${whereSql}
         ORDER BY ts DESC
         LIMIT ?`,
      )
      .bind(...params)
      .all();
    return result?.results || [];
  } catch {
    return null;
  }
}

// ─── Stock events ─────────────────────────────────────────────────────────────

// Allow-listed product availability states. The recorder and the
// readback endpoint both filter against this so a refactor that
// introduces a typo'd state can't pollute the table.
export const STOCK_STATES = new Set(["available", "reserved", "sold", "draft"]);

// Sources of stock transitions. Tracks who/what changed the state so
// the admin can answer "did I do that, or did checkout do that?".
export const STOCK_SOURCES = new Set([
  "admin-create",
  "admin-edit",
  "admin-bulk",
  "admin-delete",
  "checkout",
  "system",
]);

const normaliseState = (value) => {
  if (value == null) return null;
  const v = String(value).trim().toLowerCase();
  return STOCK_STATES.has(v) ? v : null;
};

const normaliseSource = (value) => {
  const v = String(value || "")
    .trim()
    .toLowerCase();
  return STOCK_SOURCES.has(v) ? v : "system";
};

// Persist one product-availability transition. Called from the
// products handler AFTER the KV write succeeds, fire-and-forget.
// Never throws — a logging failure must not break the mutation.
//
// `from_state = null` is permitted: it means the product didn't exist
// before this event (admin-create) or the previous state is unknown.
// `to_state = null` is permitted: it means the product was deleted
// (admin-delete) — stored as the literal string "deleted" so the
// to_state column stays NOT NULL.
export async function recordStockEvent({
  productId,
  productTitle = null,
  category = null,
  fromState = null,
  toState,
  source,
  actor = null,
} = {}) {
  const db = getD1();
  if (!db) return null;
  const pid =
    typeof productId === "string" && productId.trim()
      ? productId.trim().slice(0, 64)
      : null;
  if (!pid) return null;
  const to =
    normaliseState(toState) ||
    (toState === "deleted" || toState === null ? "deleted" : null);
  if (!to) return null;
  const from = normaliseState(fromState);
  const src = normaliseSource(source);
  const title =
    typeof productTitle === "string" && productTitle.trim()
      ? productTitle.trim().slice(0, 200)
      : null;
  const cat =
    typeof category === "string" && category.trim()
      ? category.trim().slice(0, 60)
      : null;
  const act =
    typeof actor === "string" && actor.trim()
      ? actor.trim().toLowerCase().slice(0, 160)
      : null;
  const id = `se_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const ts = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO stock_events
         (id, product_id, product_title, category, from_state, to_state,
          source, actor, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(pid, title, cat, from, to, src, act, ts)
      .run();
    return { recorded: true };
  } catch (err) {
    return { recorded: false, reason: String(err?.message || err) };
  }
}

// Per-day rollup of stock transitions so the admin can render a
// sold / reserved / restocked timeseries.
export async function stockEventsDaily({ days = 30 } = {}) {
  const db = getD1();
  if (!db) return null;
  const since = sinceFromDays(days);
  try {
    const result = await db
      .prepare(
        `SELECT substr(ts, 1, 10) AS day,
                SUM(CASE WHEN to_state = 'sold' THEN 1 ELSE 0 END) AS sold,
                SUM(CASE WHEN to_state = 'reserved' THEN 1 ELSE 0 END)
                  AS reserved,
                SUM(CASE WHEN to_state = 'available' THEN 1 ELSE 0 END)
                  AS available,
                SUM(CASE WHEN to_state = 'draft' THEN 1 ELSE 0 END) AS draft,
                SUM(CASE WHEN to_state = 'deleted' THEN 1 ELSE 0 END)
                  AS deleted,
                COUNT(*) AS total
         FROM stock_events
         WHERE ts >= ?
         GROUP BY day
         ORDER BY day ASC`,
      )
      .bind(since)
      .all();
    return result?.results || [];
  } catch {
    return null;
  }
}

// Per-product summary so the admin can spot products that churn a lot
// (added → edited → re-listed) or paintings that recently sold.
export async function stockEventsByProduct({ days = 30, limit = 50 } = {}) {
  const db = getD1();
  if (!db) return null;
  const since = sinceFromDays(days);
  const cap = Math.min(200, Math.max(1, Math.floor(Number(limit) || 50)));
  try {
    const result = await db
      .prepare(
        `SELECT product_id,
                MAX(product_title) AS product_title,
                MAX(category) AS category,
                COUNT(*) AS total,
                SUM(CASE WHEN to_state = 'sold' THEN 1 ELSE 0 END) AS sold,
                SUM(CASE WHEN to_state = 'reserved' THEN 1 ELSE 0 END)
                  AS reserved,
                MAX(ts) AS last_seen_at,
                MAX(to_state) AS last_state
         FROM stock_events
         WHERE ts >= ?
         GROUP BY product_id
         ORDER BY last_seen_at DESC
         LIMIT ?`,
      )
      .bind(since, cap)
      .all();
    return result?.results || [];
  } catch {
    return null;
  }
}

// Recent raw rows for the timeline view. Optional filters: `productId`,
// `toState`, `source`.
export async function recentStockEvents({
  limit = 100,
  productId = null,
  toState = null,
  source = null,
} = {}) {
  const db = getD1();
  if (!db) return null;
  const cap = Math.min(500, Math.max(1, Math.floor(Number(limit) || 100)));
  const where = [];
  const params = [];
  if (typeof productId === "string" && productId.trim()) {
    where.push("product_id = ?");
    params.push(productId.trim().slice(0, 64));
  }
  const ts = normaliseState(toState);
  if (ts) {
    where.push("to_state = ?");
    params.push(ts);
  } else if (toState === "deleted") {
    where.push("to_state = ?");
    params.push("deleted");
  }
  if (typeof source === "string" && STOCK_SOURCES.has(source.toLowerCase())) {
    where.push("source = ?");
    params.push(source.toLowerCase());
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  params.push(cap);
  try {
    const result = await db
      .prepare(
        `SELECT id, product_id, product_title, category, from_state,
                to_state, source, actor, ts
         FROM stock_events
         ${whereSql}
         ORDER BY ts DESC
         LIMIT ?`,
      )
      .bind(...params)
      .all();
    return result?.results || [];
  } catch {
    return null;
  }
}
