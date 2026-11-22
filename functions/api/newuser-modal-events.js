// /api/newuser-modal-events
//
// New-user discount modal A/B/C/… engagement endpoint.
//
//   POST  → public beacon. Body:
//             { sessionId, variant, eventType }
//           sessionId: visitor UUIDv4 from localStorage (`canvhub_visitor_id`)
//           variant:   lowercase token matching /^[a-z0-9_-]{1,32}$/
//                       (defaults are "a", "b", "c", … but the admin can
//                       define custom ids)
//           eventType: "impression" | "copy" | "submit"
//           Always returns 200; { recorded: false } when D1 is unbound or
//           input is invalid. Fire-and-forget — the modal must never break
//           because analytics failed.
//
//   GET   → admin readback. Auth required (same cookie/Bearer as the rest
//           of /admin). Query: `?days=30` (default 30, max 365).
//           Returns one row per variant that recorded at least one event
//           in the window. Variants with no recorded events are omitted —
//           the admin UI pairs the response with the configured variants
//           list and back-fills empty rows itself.

import { initRequestContext, isCsrfRejected } from "./_lib/handler-wrapper.js";
import { isAuthenticated } from "./_lib/admin-auth.js";
import {
  isD1Available,
  recordNewUserModalEvent,
  newUserModalStats,
  NEWUSER_MODAL_EVENT_TYPES,
  NEWUSER_MODAL_VARIANT_RE,
} from "./_lib/d1.js";

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });

// Same allow-list the d1 helper uses — duplicated here so we reject malformed
// IDs before any KV/D1 work, and so the regex stays co-located with its
// caller for grepability.
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const readCountry = (request) =>
  request.headers.get("cf-ipcountry") || request.cf?.country || null;

// ─── POST ──────────────────────────────────────────────────────────────────

export const onRequestPost = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;

  if (!isD1Available()) {
    return json(200, { recorded: false, reason: "d1 unavailable" });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json(200, { recorded: false, reason: "invalid json" });
  }
  const data = payload && typeof payload === "object" ? payload : {};
  const sessionId = String(data.sessionId || "").trim();
  const variant = String(data.variant || "").toLowerCase();
  const eventType = String(data.eventType || "").toLowerCase();

  if (!ID_RE.test(sessionId)) {
    return json(200, { recorded: false, reason: "invalid session_id" });
  }
  if (!NEWUSER_MODAL_VARIANT_RE.test(variant)) {
    return json(200, { recorded: false, reason: "invalid variant" });
  }
  if (!NEWUSER_MODAL_EVENT_TYPES.has(eventType)) {
    return json(200, { recorded: false, reason: "invalid event_type" });
  }

  const result = await recordNewUserModalEvent({
    sessionId,
    variant,
    eventType,
    country: readCountry(request),
  });
  return json(200, result || { recorded: false });
};

// ─── GET ───────────────────────────────────────────────────────────────────

export const onRequestGet = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;
  if (isCsrfRejected(blocked)) return blocked;

  const headers = Object.fromEntries(request.headers.entries());
  if (!(await isAuthenticated({ headers }))) {
    return json(401, { error: "Not authenticated" });
  }

  if (!isD1Available()) {
    return json(200, { available: false, variants: [] });
  }

  const url = new URL(request.url);
  const rawDays = Number(url.searchParams.get("days") || "30");
  const days = Number.isFinite(rawDays)
    ? Math.min(365, Math.max(1, Math.floor(rawDays)))
    : 30;

  const variants = (await newUserModalStats({ days })) || [];
  return json(200, { available: true, days, variants });
};
