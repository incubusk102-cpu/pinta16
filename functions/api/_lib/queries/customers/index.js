// Customers analytics queries.
//
// The `customers` table is populated by `upsertCustomerFromOrder` (in
// `queries/orders/index.js`) — every settled order touches the customer
// row's `total_orders` / `total_spent` counters. The aggregates in this
// module summarise those counters for the admin analytics panel.
//
// This module was created as part of the "Database Query Organization"
// roadmap (improvement.md item B9). Before the refactor the SQL lived
// inline in `functions/api/admin/d1.js`.
//
// Null-safe: when `env.DB` is unbound every helper returns `null` and
// the admin endpoint replies `{ available: false }`.

import { getD1 } from "../core.js";

// Site-wide customer summary used by the admin analytics card. Returns:
//   { totalCustomers, avgLtv, repeatCustomers }
// where `avgLtv` is the average value of `total_spent` across every
// customer row (rounded to whole pesos) and `repeatCustomers` counts
// customers with two or more settled orders.
export async function customersSummary() {
  const db = getD1();
  if (!db) return null;

  const totals = await db
    .prepare(
      `SELECT COUNT(*) as total_customers, COALESCE(AVG(total_spent),0) as avg_ltv FROM customers`,
    )
    .first();

  const repeat = await db
    .prepare(`SELECT COUNT(*) as cnt FROM customers WHERE total_orders >= 2`)
    .first();

  return {
    totalCustomers: totals?.total_customers || 0,
    avgLtv: Math.round(totals?.avg_ltv || 0),
    repeatCustomers: repeat?.cnt || 0,
  };
}
