// /api/admin/d1 — D1 database status, analytics queries, and one-shot backfill.
//
// GET  ?action=status    → D1 binding available? Table row counts.
// GET  ?action=revenue   → Revenue summary (this month, last month, all-time).
// GET  ?action=top-products → Top 10 products by revenue.
// GET  ?action=customers-summary → Customer count, avg LTV, repeat rate.
// POST ?action=apply-schema → Bootstrap the schema (idempotent, IF NOT EXISTS).
// POST ?action=backfill  → Walk ORDERS KV and mirror all orders into D1.
// POST ?action=backfill-products → Mirror all products (defaults + uploads) into D1.
//
// All actions require admin auth (same session cookie as the rest of /admin).

import { initRequestContext, isCsrfRejected } from "../_lib/handler-wrapper.js";
import { isAuthenticated } from "../_lib/admin-auth.js";
import {
  getD1,
  isD1Available,
  d1All,
  d1First,
  mirrorOrderToD1,
  mirrorProductToD1,
} from "../_lib/d1.js";
import { D1_SCHEMA_STATEMENTS } from "../_lib/d1-schema.js";
import { connectLambda, getStore } from "../_lib/kv-stores.js";

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
    },
  });

// ─── GET ───────────────────────────────────────────────────────────────────────

export const onRequestGet = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;
  if (
    !(await isAuthenticated({
      headers: Object.fromEntries(request.headers.entries()),
    }))
  ) {
    return json(401, { error: "Not authenticated" });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "status";

  if (action === "status") {
    if (!isD1Available()) {
      return json(200, {
        available: false,
        schemaApplied: false,
        message:
          "D1 binding (env.DB) not configured. Create the database in Cloudflare dashboard and add the binding.",
      });
    }
    // Probe sqlite_master for our expected tables.
    const tables = ["customers", "orders", "order_items", "products"];
    const present = await d1All(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN (?, ?, ?, ?)`,
      tables,
    );
    const presentSet = new Set(
      (present?.results || []).map((r) => r.name).filter(Boolean),
    );
    const schemaApplied = tables.every((t) => presentSet.has(t));

    if (!schemaApplied) {
      return json(200, {
        available: true,
        schemaApplied: false,
        message:
          "D1 binding is connected but tables are missing. POST /api/admin/d1?action=apply-schema to bootstrap.",
        existingTables: Array.from(presentSet),
      });
    }
    const counts = {};
    for (const table of tables) {
      const row = await d1First(`SELECT COUNT(*) as cnt FROM ${table}`);
      counts[table] = row?.cnt ?? 0;
    }
    return json(200, { available: true, schemaApplied: true, tables: counts });
  }

  if (action === "revenue") {
    if (!isD1Available()) return json(200, { available: false });
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01T00:00:00`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStart = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}-01T00:00:00`;
    const lastMonthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01T00:00:00`;

    const thisMonth = await d1First(
      `SELECT COALESCE(SUM(total),0) as revenue, COUNT(*) as order_count
       FROM orders WHERE created_at >= ? AND status NOT IN ('cancelled','refunded')`,
      [monthStart],
    );
    const lastMonth = await d1First(
      `SELECT COALESCE(SUM(total),0) as revenue, COUNT(*) as order_count
       FROM orders WHERE created_at >= ? AND created_at < ? AND status NOT IN ('cancelled','refunded')`,
      [lastMonthStart, lastMonthEnd],
    );
    const allTime = await d1First(
      `SELECT COALESCE(SUM(total),0) as revenue, COUNT(*) as order_count
       FROM orders WHERE status NOT IN ('cancelled','refunded')`,
    );

    // Pull a 6-month revenue history so the analytics card can render
    // a path-draw sparkline beside the headline figure. Months with
    // zero orders still emit a row (LEFT-joined against a generated
    // calendar in JS) so the trendline doesn't visually skip gaps.
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const sixMonthsAgoIso = `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, "0")}-01T00:00:00`;
    const monthlyRows = await d1All(
      `SELECT
         substr(created_at, 1, 7) as ym,
         COALESCE(SUM(total),0) as revenue,
         COUNT(*) as order_count
       FROM orders
       WHERE created_at >= ? AND status NOT IN ('cancelled','refunded')
       GROUP BY ym
       ORDER BY ym ASC`,
      [sixMonthsAgoIso],
    );
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

    return json(200, {
      available: true,
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
    });
  }

  if (action === "top-products") {
    if (!isD1Available()) return json(200, { available: false });
    const result = await d1All(
      `SELECT product_id, product_title, SUM(subtotal) as total_revenue, SUM(quantity) as total_qty
       FROM order_items WHERE product_id IS NOT NULL
       GROUP BY product_id ORDER BY total_revenue DESC LIMIT 10`,
    );
    return json(200, { available: true, products: result?.results || [] });
  }

  if (action === "customers-summary") {
    if (!isD1Available()) return json(200, { available: false });
    const totals = await d1First(
      `SELECT COUNT(*) as total_customers, COALESCE(AVG(total_spent),0) as avg_ltv FROM customers`,
    );
    const repeat = await d1First(
      `SELECT COUNT(*) as cnt FROM customers WHERE total_orders >= 2`,
    );
    return json(200, {
      available: true,
      totalCustomers: totals?.total_customers || 0,
      avgLtv: Math.round(totals?.avg_ltv || 0),
      repeatCustomers: repeat?.cnt || 0,
    });
  }

  return json(400, { error: `Unknown action: ${action}` });
};

// ─── POST ──────────────────────────────────────────────────────────────────────

export const onRequestPost = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;
  const url = new URL(request.url);
  // Defense-in-depth: the admin session cookie is already `SameSite=Strict`,
  // but layering the double-submit CSRF check closes the gap if a subdomain
  // or future XSS ever sidesteps SameSite. `isCsrfRejected` is a no-op for
  // bearer-auth callers (curl / CI / the SPA's authed fetches).
  if (isCsrfRejected(request, url.pathname)) {
    return json(403, { error: "Invalid CSRF token" });
  }
  if (
    !(await isAuthenticated({
      headers: Object.fromEntries(request.headers.entries()),
    }))
  ) {
    return json(401, { error: "Not authenticated" });
  }

  const action = url.searchParams.get("action") || "";

  if (!isD1Available()) {
    return json(503, {
      error: "D1 binding not available. Create the database first.",
    });
  }

  if (action === "apply-schema") {
    // Idempotent: every statement is CREATE … IF NOT EXISTS, so re-running is a no-op.
    const db = getD1();
    const stmts = D1_SCHEMA_STATEMENTS.map((sql) => db.prepare(sql));
    try {
      await db.batch(stmts);
    } catch (err) {
      return json(500, {
        error: "Failed to apply schema",
        detail: err?.message || String(err),
      });
    }
    return json(200, {
      success: true,
      statementsExecuted: D1_SCHEMA_STATEMENTS.length,
    });
  }

  if (action === "backfill") {
    connectLambda({ headers: Object.fromEntries(request.headers.entries()) });
    const store = getStore("orders");
    const raw = await store.get("all-orders", { type: "json" });
    const orders = Array.isArray(raw) ? raw : [];

    let mirrored = 0;
    let failed = 0;
    const errors = [];

    for (const order of orders) {
      const result = await mirrorOrderToD1(order);
      if (result.mirrored) {
        mirrored++;
      } else {
        failed++;
        if (errors.length < 10)
          errors.push({ id: order.id, reason: result.reason });
      }
    }

    return json(200, {
      success: true,
      total: orders.length,
      mirrored,
      failed,
      errors: errors.length ? errors : undefined,
    });
  }

  if (action === "backfill-products") {
    connectLambda({ headers: Object.fromEntries(request.headers.entries()) });
    const store = getStore("products");

    // KV stores products under various keys; the main one is "all-products"
    // or individual product keys. Let's check the pattern used.
    const allRaw = await store.get("all-products", { type: "json" });
    const products = Array.isArray(allRaw) ? allRaw : [];

    let mirrored = 0;
    for (const product of products) {
      await mirrorProductToD1(product, Boolean(product.isDefault));
      mirrored++;
    }

    return json(200, { success: true, mirrored });
  }

  return json(400, { error: `Unknown action: ${action}` });
};
