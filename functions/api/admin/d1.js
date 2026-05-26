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
  isBenignSchemaError,
  d1All,
  d1First,
  mirrorOrderToD1,
  mirrorProductToD1,
  orderRevenueSummary,
  topProductsByRevenue,
  customersSummary,
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
    const summary = await orderRevenueSummary();
    return json(200, { available: true, ...summary });
  }

  if (action === "top-products") {
    if (!isD1Available()) return json(200, { available: false });
    const products = await topProductsByRevenue();
    return json(200, { available: true, products });
  }

  if (action === "customers-summary") {
    if (!isD1Available()) return json(200, { available: false });
    const summary = await customersSummary();
    return json(200, { available: true, ...summary });
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
    // `D1_SCHEMA_STATEMENTS` is generated from `migrations/*.sql` so
    // it replays the wrangler migration order verbatim. Most
    // statements are `CREATE … IF NOT EXISTS` (idempotent), but older
    // migrations include `ALTER TABLE ADD COLUMN` statements that
    // SQLite has no `IF NOT EXISTS` variant for — re-running them
    // against an already-bootstrapped D1 throws `duplicate column
    // name`. We run statements sequentially and tolerate that
    // specific failure mode (see `isBenignSchemaError`) so the
    // bootstrap endpoint is replayable.
    const db = getD1();
    let statementsExecuted = 0;
    let statementsSkipped = 0;
    for (const sql of D1_SCHEMA_STATEMENTS) {
      try {
        await db.prepare(sql).run();
        statementsExecuted += 1;
      } catch (err) {
        if (isBenignSchemaError(err)) {
          statementsSkipped += 1;
          continue;
        }
        return json(500, {
          error: "Failed to apply schema",
          detail: err?.message || String(err),
          failedStatement: sql,
        });
      }
    }
    return json(200, {
      success: true,
      statementsExecuted,
      statementsSkipped,
      statementsTotal: D1_SCHEMA_STATEMENTS.length,
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
