// Core D1 helpers.
//
// Thin wrappers around the Cloudflare D1 binding (`env.DB`). Every helper
// in this file is *null-safe*: when the binding is missing (user hasn't
// provisioned the D1 database yet, or we're running against a Pages
// preview without the binding configured), the helper resolves to `null`
// instead of throwing. Every higher-level domain module (orders,
// wishlists, coupons, …) builds on top of this contract — see
// `queries/README.md` for the full conventions.
//
// History note: these used to live as the first ~50 lines of
// `functions/api/_lib/d1.js`. They were extracted alongside the
// domain-specific helpers as part of the query repository refactor
// described in `improvement.md` (item B1 / B4). `d1.js` is now a thin
// barrel re-export that keeps every existing import site working.

import { getCloudflareEnv } from "../context.js";

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

// Shared device allow-list used by page-event and hero-slide recorders to
// gate the optional `device` column. Kept in core so adding a new device
// bucket requires touching one file, not two.
export const ALLOWED_DEVICES = new Set([
  "mobile",
  "tablet",
  "desktop",
  "unknown",
]);

// ISO timestamp `days` whole days before `now`. Centralised so every
// analytics rollup uses the same "trailing window" semantics.
export const sinceFromDays = (days) =>
  new Date(
    Date.now() - Math.max(1, Math.floor(Number(days) || 30)) * 86400_000,
  ).toISOString();

// SQLite's `ALTER TABLE ADD COLUMN` rejects duplicates with a
// `duplicate column name: <col>` error and there's no `IF NOT EXISTS`
// variant. The runtime schema bootstrap (`POST
// /api/admin/d1?action=apply-schema`) replays every statement from
// `D1_SCHEMA_STATEMENTS` (which is generated from `migrations/*.sql`
// and therefore includes the non-idempotent ALTER TABLE statements),
// so we tolerate that specific failure mode and let the rest of the
// bootstrap continue.
export const isBenignSchemaError = (err) => {
  const msg = String(err?.message || err || "").toLowerCase();
  return msg.includes("duplicate column");
};
