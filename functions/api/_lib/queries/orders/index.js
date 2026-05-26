// Orders + customer queries.
//
// KV (`ORDERS` namespace) is the source of truth for the customer order
// document; this module mirrors each successful order — and the customer
// row inferred from it — into D1 so the admin panel can answer
// JOIN-shaped questions ("revenue by region", "LTV per customer") with
// normal SQL instead of scanning the entire orders blob.
//
// Everything here is fire-and-forget from the caller's perspective and
// null-safe: when `env.DB` is unbound the helpers return `null` /
// `{ mirrored: false, reason: "no-binding" }` and the KV write still
// owns the customer-visible state.

import { getD1 } from "../core.js";

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
