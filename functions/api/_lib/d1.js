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
