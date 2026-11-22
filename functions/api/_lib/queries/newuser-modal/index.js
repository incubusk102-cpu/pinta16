// New-user discount modal — A/B variant analytics.
//
// One row per modal interaction recorded by the public POST handler at
// /api/newuser-modal-events. See migrations/0012_newuser_modal_events.sql
// for the full schema. The client beacons three event types:
//   * "impression" — modal mounted into the DOM for this visitor
//   * "copy"       — voucher code copied to clipboard
//   * "submit"     — email captured + voucher requested
//
// `variant` is "a" / "b" / arbitrary lowercase tokens — the regex below
// caps it to 32 chars and forbids DB-control characters. `session_id`
// is the visitor UUIDv4 from localStorage (`canvhub_visitor_id`). We
// dedupe network retries via INSERT OR IGNORE; the client also dedupes
// impressions per page-load so an SPA route change doesn't inflate the
// funnel.
//
// Null-safe: when `env.DB` is unbound the recorder returns `null` and
// the modal keeps working unchanged.

import { getD1 } from "../core.js";

// `variant` was originally a strict { a | b } enum. Now that the admin
// can spin up arbitrary variant ids (A/B/C/D/…) we accept any
// lowercase alphanumeric token, with the same character allow-list as
// `session_id` but capped at 32 chars for the smaller column. The
// regex prevents a malicious client from smuggling DB control chars
// into the ts column or blowing up storage with overlong tokens.
export const NEWUSER_MODAL_VARIANT_RE = /^[a-z0-9_-]{1,32}$/;
export const NEWUSER_MODAL_EVENT_TYPES = new Set([
  "impression",
  "copy",
  "submit",
]);

// Tight character allow-list shared with hero_slide_events / search_events:
// alphanumeric, underscore, hyphen only. Rejects everything else so a
// malicious client can't smuggle in DB control chars / overlong tokens.
const NEWUSER_MODAL_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export async function recordNewUserModalEvent({
  id,
  sessionId,
  variant,
  eventType,
  country = null,
}) {
  const db = getD1();
  if (!db) return null;
  const sid = String(sessionId || "").trim();
  if (!sid || !NEWUSER_MODAL_ID_RE.test(sid)) {
    return { recorded: false, reason: "invalid session_id" };
  }
  const v = String(variant || "").toLowerCase();
  if (!NEWUSER_MODAL_VARIANT_RE.test(v)) {
    return { recorded: false, reason: "invalid variant" };
  }
  const ev = String(eventType || "").toLowerCase();
  if (!NEWUSER_MODAL_EVENT_TYPES.has(ev)) {
    return { recorded: false, reason: "invalid event_type" };
  }
  const eventId =
    typeof id === "string" && NEWUSER_MODAL_ID_RE.test(id)
      ? id
      : `nm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT OR IGNORE INTO newuser_modal_events
           (id, session_id, variant, event_type, country, ts)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(eventId, sid, v, ev, country || null, now)
      .run();
    return { recorded: true };
  } catch (err) {
    return { recorded: false, reason: String(err?.message || err) };
  }
}

// Per-variant rollup over the trailing `days` window. Returns one row per
// variant (a/b) with impressions, copies, submits, and unique session
// counts. Variants with no events in-window are still included so the
// admin panel can render an empty cell instead of dropping the row.
export async function newUserModalStats({ days = 30 } = {}) {
  const db = getD1();
  if (!db) return null;
  const since = new Date(
    Date.now() - Math.max(1, Math.floor(Number(days) || 30)) * 86400_000,
  ).toISOString();
  try {
    const result = await db
      .prepare(
        `SELECT
           variant,
           SUM(CASE WHEN event_type = 'impression' THEN 1 ELSE 0 END) AS impressions,
           SUM(CASE WHEN event_type = 'copy' THEN 1 ELSE 0 END) AS copies,
           SUM(CASE WHEN event_type = 'submit' THEN 1 ELSE 0 END) AS submits,
           COUNT(DISTINCT CASE WHEN event_type = 'impression' THEN session_id END) AS unique_impressions,
           COUNT(DISTINCT CASE WHEN event_type = 'copy' THEN session_id END) AS unique_copies,
           COUNT(DISTINCT CASE WHEN event_type = 'submit' THEN session_id END) AS unique_submits,
           MAX(ts) AS last_seen_at
         FROM newuser_modal_events
         WHERE ts >= ?
         GROUP BY variant
         ORDER BY variant`,
      )
      .bind(since)
      .all();
    // Return every variant that has at least one event in the window.
    // The admin panel pairs these rows with the configured variants list
    // and adds empty rows for any configured variant that hasn't fired
    // an event yet, so we don't need to back-fill A/B here.
    return result?.results || [];
  } catch {
    return null;
  }
}
