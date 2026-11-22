// Coupon redemption ledger queries.
//
// KV (`STOREFRONT_CONFIG`) holds the coupon *definitions* and the coarse
// global usage counter. This module records every successful redemption
// into D1 so we can enforce per-customer redemption caps and run
// "top codes by total discount given" reports without iterating the
// entire orders KV blob.
//
// Idempotent on `(order_id, code)` so retries from a flaky network never
// double-count. Null-safe: when `env.DB` is unbound everything resolves
// to `null` and the order keeps the coarse KV-counter behaviour.

import { getD1 } from "../core.js";

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
