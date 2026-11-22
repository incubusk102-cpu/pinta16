// Orders analytics queries.
//
// Aggregates that power the admin analytics card on `/admin → Analytics`:
// revenue and order counts for the current month, the previous month,
// all-time, plus a 6-month rolling history so the card can render the
// path-draw sparkline beside the headline figure.
//
// These helpers used to live inline in `functions/api/admin/d1.js`.
// They were extracted as part of the "Database Query Organization"
// roadmap (improvement.md item B9) so every D1 query lives in one
// repository under `_lib/queries/`.
//
// Null-safe: when `env.DB` is unbound every helper returns `null` and
// the admin endpoint replies `{ available: false }`.

import { getD1 } from "../core.js";

// `cancelled` / `refunded` orders are excluded from every revenue figure
// — admin analytics tracks settled revenue only. Centralised here so a
// future status change (e.g. `chargeback`) is a one-line edit.
const SETTLED_STATUS_FILTER = "status NOT IN ('cancelled','refunded')";

// First-of-month ISO timestamp (local-time YYYY-MM-01T00:00:00, matching
// the format admin/d1.js used historically). The created_at column on
// `orders` is stored as an ISO string so lexicographic comparison gives
// us "this month" / "last month" boundaries without a DATE() conversion.
function isoMonthStart(year, monthIndex0) {
  return `${year}-${String(monthIndex0 + 1).padStart(2, "0")}-01T00:00:00`;
}

// Revenue summary used by `GET /api/admin/d1?action=revenue`. Returns:
//   {
//     thisMonth:    { revenue, orders },
//     lastMonth:    { revenue, orders },
//     allTime:      { revenue, orders },
//     monthlyHistory: [{ ym, revenue, orders }, ...]  // 6 months, oldest-first
//   }
// `monthlyHistory` always emits 6 rows — months with zero settled orders
// still appear so the sparkline doesn't visually skip gaps.
export async function orderRevenueSummary(now = new Date()) {
  const db = getD1();
  if (!db) return null;

  const monthStart = isoMonthStart(now.getFullYear(), now.getMonth());
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStart = isoMonthStart(
    lastMonthDate.getFullYear(),
    lastMonthDate.getMonth(),
  );
  const lastMonthEnd = monthStart;

  const thisMonth = await db
    .prepare(
      `SELECT COALESCE(SUM(total),0) as revenue, COUNT(*) as order_count
       FROM orders WHERE created_at >= ? AND ${SETTLED_STATUS_FILTER}`,
    )
    .bind(monthStart)
    .first();

  const lastMonth = await db
    .prepare(
      `SELECT COALESCE(SUM(total),0) as revenue, COUNT(*) as order_count
       FROM orders WHERE created_at >= ? AND created_at < ? AND ${SETTLED_STATUS_FILTER}`,
    )
    .bind(lastMonthStart, lastMonthEnd)
    .first();

  const allTime = await db
    .prepare(
      `SELECT COALESCE(SUM(total),0) as revenue, COUNT(*) as order_count
       FROM orders WHERE ${SETTLED_STATUS_FILTER}`,
    )
    .first();

  // 6-month rolling history. LEFT-joined against a generated calendar in
  // JS so months with zero settled orders still emit a row.
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const sixMonthsAgoIso = isoMonthStart(
    sixMonthsAgo.getFullYear(),
    sixMonthsAgo.getMonth(),
  );
  const monthlyRows = await db
    .prepare(
      `SELECT
         substr(created_at, 1, 7) as ym,
         COALESCE(SUM(total),0) as revenue,
         COUNT(*) as order_count
       FROM orders
       WHERE created_at >= ? AND ${SETTLED_STATUS_FILTER}
       GROUP BY ym
       ORDER BY ym ASC`,
    )
    .bind(sixMonthsAgoIso)
    .all();

  const monthlyByYm = new Map();
  for (const row of monthlyRows?.results || []) {
    monthlyByYm.set(row.ym, {
      revenue: row.revenue || 0,
      orders: row.order_count || 0,
    });
  }
  const monthlyHistory = [];
  for (let i = 0; i < 6; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const cell = monthlyByYm.get(ym) || { revenue: 0, orders: 0 };
    monthlyHistory.push({ ym, ...cell });
  }

  return {
    thisMonth: {
      revenue: thisMonth?.revenue || 0,
      orders: thisMonth?.order_count || 0,
    },
    lastMonth: {
      revenue: lastMonth?.revenue || 0,
      orders: lastMonth?.order_count || 0,
    },
    allTime: {
      revenue: allTime?.revenue || 0,
      orders: allTime?.order_count || 0,
    },
    monthlyHistory,
  };
}
