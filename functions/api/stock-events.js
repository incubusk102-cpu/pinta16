// /api/stock-events — admin readback for the product-availability
// transition ledger written from inside the products handler in
// `functions/api/products.js`.
//
// There is no public POST here on purpose. Nothing on the storefront
// side writes to this table directly — every row is the result of a
// server-internal product mutation that already passed admin auth
// (POST/PATCH/DELETE on /api/products) or a system-internal job
// (e.g. a future checkout-reservation flow). The readback is the
// only externally-reachable surface and is gated by `isAuthenticated()`.
//
// Available actions:
//   ?action=summary       — daily + by-product + recent + currentStock
//                           in one round-trip
//   ?action=daily         — per-day sold/reserved/restocked timeseries
//   ?action=by-product    — per-product summary table
//   ?action=recent        — most-recent raw rows (optional filters)
//                           &productId=… &toState=available|reserved|sold|draft|deleted
//                           &source=admin-create|admin-edit|admin-bulk|admin-delete|checkout|system
//   ?action=current       — current snapshot from KV (source of truth):
//                           counts by state, by category, and a
//                           low-stock flag when the available count
//                           sits at or below the threshold.
//
// Low-stock threshold defaults to 5 and is overridable via the
// `?threshold=N` query parameter so the same endpoint can serve both
// the panel's KPI cards and a future cron worker that pages an admin.

import { initRequestContext } from "./_lib/handler-wrapper.js";
import { isAuthenticated } from "./_lib/admin-auth.js";
import { logError } from "./_lib/redact.js";
import { makeStore } from "./_lib/kv-store.js";
import {
  isD1Available,
  stockEventsDaily,
  stockEventsByProduct,
  recentStockEvents,
  STOCK_STATES,
  STOCK_SOURCES,
} from "./_lib/d1.js";

const PRODUCTS_KEY = "all-products";
const DEFAULT_LOW_STOCK_THRESHOLD = 5;
const TERMINAL_STATES = new Set([...STOCK_STATES, "deleted"]);

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
    },
  });

const parseDays = (raw) => {
  const n = Math.floor(Number(raw) || 30);
  return Math.max(1, Math.min(365, n));
};

const parseLimit = (raw, def = 50, max = 200) => {
  const n = Math.floor(Number(raw) || def);
  return Math.max(1, Math.min(max, n));
};

const parseThreshold = (raw) => {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 0) return DEFAULT_LOW_STOCK_THRESHOLD;
  return Math.min(1000, n);
};

const parseToState = (raw) => {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  return TERMINAL_STATES.has(v) ? v : null;
};

const parseSource = (raw) => {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  return STOCK_SOURCES.has(v) ? v : null;
};

const parseProductId = (raw) => {
  if (typeof raw !== "string") return null;
  const v = raw.trim().slice(0, 64);
  if (!v || !/^[a-zA-Z0-9._-]+$/.test(v)) return null;
  return v;
};

// Compute the current snapshot from PRODUCTS KV. KV is the source of
// truth for availability — D1 stock_events is the queryable mirror —
// so the panel's KPI cards and the low-stock alert read directly from
// KV here rather than reconstructing state from the event log.
const computeCurrentStock = async (env, threshold) => {
  if (!env?.PRODUCTS) {
    return {
      available: false,
      reason: "PRODUCTS KV binding missing",
    };
  }
  const store = makeStore(env.PRODUCTS);
  const products = await store.get(PRODUCTS_KEY, { type: "json" });
  const list = Array.isArray(products) ? products : [];
  const byState = { available: 0, reserved: 0, sold: 0, draft: 0 };
  const byCategory = new Map();
  for (const p of list) {
    const state =
      typeof p?.availability === "string" && STOCK_STATES.has(p.availability)
        ? p.availability
        : "available";
    byState[state] = (byState[state] || 0) + 1;
    if (state === "available") {
      const cat =
        typeof p?.category === "string" && p.category.trim()
          ? p.category.trim().slice(0, 60)
          : "Uncategorised";
      byCategory.set(cat, (byCategory.get(cat) || 0) + 1);
    }
  }
  const categoryRows = Array.from(byCategory.entries())
    .map(([category, available]) => ({ category, available }))
    .sort((a, b) => a.available - b.available);
  const isLowStock = byState.available <= threshold;
  return {
    available: true,
    total: list.length,
    byState,
    byCategory: categoryRows,
    threshold,
    isLowStock,
  };
};

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
  const action = url.searchParams.get("action") || "summary";
  const days = parseDays(url.searchParams.get("days"));
  const limit = parseLimit(url.searchParams.get("limit"), 50, 200);
  const threshold = parseThreshold(url.searchParams.get("threshold"));
  const productId = parseProductId(url.searchParams.get("productId"));
  const toState = parseToState(url.searchParams.get("toState"));
  const source = parseSource(url.searchParams.get("source"));

  // The current-stock action does not require D1. It reads straight
  // from KV (source of truth), so an admin can still see "how many
  // paintings are available right now?" before D1 is provisioned.
  try {
    if (action === "current") {
      const current = await computeCurrentStock(env, threshold);
      return json(200, current);
    }

    if (!isD1Available()) {
      return json(200, {
        available: false,
        message:
          "D1 binding (env.DB) not configured. Stock events require D1 — " +
          "the migration table is in `migrations/0008_stock_events.sql`.",
      });
    }

    if (action === "daily") {
      const rows = await stockEventsDaily({ days });
      return json(200, { available: true, days, results: rows || [] });
    }
    if (action === "by-product") {
      const rows = await stockEventsByProduct({ days, limit });
      return json(200, { available: true, days, results: rows || [] });
    }
    if (action === "recent") {
      const rows = await recentStockEvents({
        limit,
        productId,
        toState,
        source,
      });
      return json(200, { available: true, results: rows || [] });
    }
    if (action === "summary") {
      const [daily, byProduct, recent, current] = await Promise.all([
        stockEventsDaily({ days }),
        stockEventsByProduct({ days, limit: Math.min(limit, 30) }),
        recentStockEvents({ limit: Math.min(limit, 100) }),
        computeCurrentStock(env, threshold),
      ]);
      return json(200, {
        available: true,
        days,
        daily: daily || [],
        byProduct: byProduct || [],
        recent: recent || [],
        current,
      });
    }
    return json(400, { error: `Unknown action '${action}'` });
  } catch (error) {
    logError("stock-events GET error:", error);
    return json(500, { error: "Could not load stock events" });
  }
};
