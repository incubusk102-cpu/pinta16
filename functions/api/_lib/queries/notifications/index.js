// Notification-log queries.
//
// Persists every outgoing transactional notification (email or web push)
// AFTER the provider responds. The recorder never throws — a logging
// failure must not break the actual send — and every aggregation is
// null-safe when `env.DB` is unbound (the admin "Notifications" panel
// then simply renders empty.
//
// Callers live in `functions/api/_lib/email.js` and `_lib/push.js`.

import { getD1, sinceFromDays } from "../core.js";

// Allow-listed channels. The admin panel and the readback endpoint both
// filter against this so a malformed call from a refactor can't pollute
// the table with a typo'd channel.
export const NOTIFICATION_CHANNELS = new Set(["email", "push"]);

// Persist one outgoing-notification attempt. Called from the high-level
// send wrappers in `email.js` and `push.js` AFTER the provider returns.
// Never throws — a logging failure must not break the actual send.
//
// `result` is the object the send wrapper returns:
//   { delivered, skipped, reason, provider, error, attempted, successful }
// We translate that into the row fields. Truncates `reason`/`error` to
// 200 chars so a misbehaving provider can't dump a 100 KB stack trace
// into D1.
export async function recordNotification({
  channel,
  kind,
  recipient = null,
  orderId = null,
  result,
}) {
  const db = getD1();
  if (!db) return null;
  if (!NOTIFICATION_CHANNELS.has(channel)) return null;
  const k = String(kind || "")
    .trim()
    .slice(0, 64);
  if (!k) return null;
  const r = result || {};
  const recipientLc =
    typeof recipient === "string" && recipient
      ? recipient.trim().toLowerCase().slice(0, 160) || null
      : null;
  const oid =
    typeof orderId === "string" && orderId
      ? orderId.trim().slice(0, 64) || null
      : null;
  const delivered = r.delivered ? 1 : 0;
  const skipped = r.skipped ? 1 : 0;
  const provider =
    typeof r.provider === "string" && r.provider
      ? r.provider.slice(0, 32)
      : null;
  const rawReason =
    (typeof r.reason === "string" && r.reason) ||
    (typeof r.error === "string" && r.error) ||
    "";
  const reason = rawReason ? String(rawReason).slice(0, 200) : null;
  const attempted =
    typeof r.attempted === "number" && Number.isFinite(r.attempted)
      ? Math.max(0, Math.floor(r.attempted))
      : null;
  const successful =
    typeof r.successful === "number" && Number.isFinite(r.successful)
      ? Math.max(0, Math.floor(r.successful))
      : null;
  const id = `nl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const ts = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO notification_log
         (id, channel, kind, recipient, order_id, delivered, skipped,
          provider, reason, attempted, successful, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        channel,
        k,
        recipientLc,
        oid,
        delivered,
        skipped,
        provider,
        reason,
        attempted,
        successful,
        ts,
      )
      .run();
    return { recorded: true };
  } catch (err) {
    return { recorded: false, reason: String(err?.message || err) };
  }
}

// Per-day rollup so the admin panel can render a sent/skipped/failed
// timeseries. `delivered = 1` is sent, `skipped = 1` is skipped, the
// remainder (`delivered = 0 AND skipped = 0`) is failed.
export async function notificationLogDaily({ days = 30 } = {}) {
  const db = getD1();
  if (!db) return null;
  const since = sinceFromDays(days);
  try {
    const result = await db
      .prepare(
        `SELECT substr(ts, 1, 10) AS day,
                SUM(CASE WHEN delivered = 1 THEN 1 ELSE 0 END) AS delivered,
                SUM(CASE WHEN skipped = 1 THEN 1 ELSE 0 END) AS skipped,
                SUM(CASE WHEN delivered = 0 AND skipped = 0 THEN 1 ELSE 0 END)
                  AS failed,
                COUNT(*) AS total
         FROM notification_log
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

// Per-(channel, kind) summary so the admin can spot which kinds are
// failing or being skipped disproportionately.
export async function notificationLogByKind({ days = 30, limit = 50 } = {}) {
  const db = getD1();
  if (!db) return null;
  const since = sinceFromDays(days);
  const cap = Math.min(200, Math.max(1, Math.floor(Number(limit) || 50)));
  try {
    const result = await db
      .prepare(
        `SELECT channel,
                kind,
                COUNT(*) AS total,
                SUM(CASE WHEN delivered = 1 THEN 1 ELSE 0 END) AS delivered,
                SUM(CASE WHEN skipped = 1 THEN 1 ELSE 0 END) AS skipped,
                SUM(CASE WHEN delivered = 0 AND skipped = 0 THEN 1 ELSE 0 END)
                  AS failed,
                MAX(ts) AS last_seen_at
         FROM notification_log
         WHERE ts >= ?
         GROUP BY channel, kind
         ORDER BY total DESC, last_seen_at DESC
         LIMIT ?`,
      )
      .bind(since, cap)
      .all();
    return result?.results || [];
  } catch {
    return null;
  }
}

// Recent raw rows for the timeline view. Optional filters: `kind`,
// `channel`, and `deliveredOnly` (when true, only `delivered = 1`).
export async function recentNotificationLog({
  limit = 100,
  kind = null,
  channel = null,
  deliveredOnly = false,
} = {}) {
  const db = getD1();
  if (!db) return null;
  const cap = Math.min(500, Math.max(1, Math.floor(Number(limit) || 100)));
  const where = [];
  const params = [];
  if (typeof channel === "string" && NOTIFICATION_CHANNELS.has(channel)) {
    where.push("channel = ?");
    params.push(channel);
  }
  if (typeof kind === "string" && kind.trim()) {
    where.push("kind = ?");
    params.push(kind.trim().slice(0, 64));
  }
  if (deliveredOnly) {
    where.push("delivered = 1");
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  params.push(cap);
  try {
    const result = await db
      .prepare(
        `SELECT id, channel, kind, recipient, order_id, delivered, skipped,
                provider, reason, attempted, successful, ts
         FROM notification_log
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
