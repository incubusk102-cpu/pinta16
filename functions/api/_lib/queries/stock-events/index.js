// Stock-event queries.
//
// Persists every product-availability transition (created / edited /
// sold / reserved / deleted) into the `stock_events` ledger so the admin
// can answer "what state was painting X in last Monday?" without
// archaeology in git.
//
// Callers fire-and-forget from the products handler AFTER the KV write
// succeeds. Helper never throws — a logging failure must not break the
// mutation. Null-safe: when `env.DB` is unbound everything returns
// `null` and the admin panel's stock history simply renders empty.

import { getD1, sinceFromDays } from "../core.js";

// Allow-listed product availability states. The recorder and the
// readback endpoint both filter against this so a refactor that
// introduces a typo'd state can't pollute the table.
export const STOCK_STATES = new Set([
  "available",
  "made-to-order",
  "reserved",
  "sold",
  "draft",
]);

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
