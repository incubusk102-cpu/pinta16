// /api/notification-log — admin readback for the unified email/push
// notification ledger written from inside the send wrappers in
// `_lib/email.js` and `_lib/push.js`.
//
// There is no public POST here on purpose. Nothing on the storefront
// side writes to this table directly — every row is the result of a
// server-internal send attempt that already passed admin auth (e.g.
// an order status change) or a system-internal cron-style send. The
// readback is the only externally-reachable surface and is gated by
// `isAuthenticated()`.
//
// Available actions:
//   ?action=summary       — daily + by-kind + recent in one round-trip
//   ?action=daily         — per-day sent / skipped / failed timeseries
//   ?action=by-kind       — per-(channel, kind) rollup table
//   ?action=recent        — most-recent raw rows (optional filters)
//                           &channel=email|push &kind=order.confirmed
//                           &deliveredOnly=1
//
// Privacy: rows include the recipient email (operationally needed for
// "did this customer get their confirmation?" lookups). This endpoint
// is admin-only.

import { initRequestContext } from "./_lib/handler-wrapper.js";
import { isAuthenticated } from "./_lib/admin-auth.js";
import { logError } from "./_lib/redact.js";
import {
  isD1Available,
  notificationLogDaily,
  notificationLogByKind,
  recentNotificationLog,
  NOTIFICATION_CHANNELS,
} from "./_lib/d1.js";

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

const parseChannel = (raw) => {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  return NOTIFICATION_CHANNELS.has(v) ? v : null;
};

const parseKind = (raw) => {
  if (typeof raw !== "string") return null;
  const v = raw.trim().slice(0, 64);
  // Mirror the server-side allow-list shape — letters, digits, dot,
  // dash, underscore. Anything else is a typo / probe; reject.
  if (!v || !/^[a-zA-Z0-9._-]+$/.test(v)) return null;
  return v;
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

  if (!isD1Available()) {
    return json(200, {
      available: false,
      message:
        "D1 binding (env.DB) not configured. Notification log requires D1 — the migration table is in `migrations/0007_notification_log.sql`.",
    });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "summary";
  const days = parseDays(url.searchParams.get("days"));
  const limit = parseLimit(url.searchParams.get("limit"), 50, 200);
  const channel = parseChannel(url.searchParams.get("channel"));
  const kind = parseKind(url.searchParams.get("kind"));
  const deliveredOnly = url.searchParams.get("deliveredOnly") === "1";

  try {
    if (action === "daily") {
      const rows = await notificationLogDaily({ days });
      return json(200, { available: true, days, results: rows || [] });
    }
    if (action === "by-kind") {
      const rows = await notificationLogByKind({ days, limit });
      return json(200, { available: true, days, results: rows || [] });
    }
    if (action === "recent") {
      const rows = await recentNotificationLog({
        limit,
        channel,
        kind,
        deliveredOnly,
      });
      return json(200, { available: true, results: rows || [] });
    }
    if (action === "summary") {
      const [daily, byKind, recent] = await Promise.all([
        notificationLogDaily({ days }),
        notificationLogByKind({ days, limit: Math.min(limit, 30) }),
        recentNotificationLog({ limit: Math.min(limit, 100) }),
      ]);
      return json(200, {
        available: true,
        days,
        daily: daily || [],
        byKind: byKind || [],
        recent: recent || [],
      });
    }
    return json(400, { error: `Unknown action '${action}'` });
  } catch (error) {
    logError("notification-log GET error:", error);
    return json(500, { error: "Could not load notification log" });
  }
};
