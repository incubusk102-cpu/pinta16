// Products analytics queries.
//
// Aggregates the `order_items` table by `product_id` to answer the
// "top sellers" question that powers the admin analytics panel's
// `top-products` card. The grouping happens against `order_items`
// (not `products`) so cancelled / never-purchased products are
// naturally excluded from the ranking without an extra WHERE clause.
//
// These helpers used to live inline in `functions/api/admin/d1.js`.
// They were extracted as part of the "Database Query Organization"
// roadmap (improvement.md item B9) so every D1 query lives in one
// repository under `_lib/queries/`.
//
// Null-safe: when `env.DB` is unbound the helpers return `null` and
// the admin endpoint replies `{ available: false }`.

import { getD1 } from "../core.js";

// Top N products by all-time revenue. Returns rows in the shape:
//   [{ product_id, product_title, total_revenue, total_qty }, ...]
// `limit` is clamped to the range [1, 100] so a malformed `?limit=`
// query string can't make D1 do a full table scan with a huge result
// payload.
export async function topProductsByRevenue(limit = 10) {
  const db = getD1();
  if (!db) return null;

  const parsed = Number(limit);
  const floored = Number.isFinite(parsed) ? Math.floor(parsed) : 10;
  const safeLimit = Math.max(1, Math.min(100, floored));

  const result = await db
    .prepare(
      `SELECT product_id, product_title, SUM(subtotal) as total_revenue, SUM(quantity) as total_qty
       FROM order_items WHERE product_id IS NOT NULL
       GROUP BY product_id ORDER BY total_revenue DESC LIMIT ?`,
    )
    .bind(safeLimit)
    .all();

  return result?.results || [];
}
