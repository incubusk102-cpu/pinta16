// /api/hero-slide-events — per-hero-slide engagement beacon + admin
// readback. Powers the "Slide analytics" rail in /admin → Hero slider
// (impressions / clicks / CTR per slide over the trailing window).
//
// Public POST: client beacon from `HeroSlider.tsx`. Fires once per
// (session, slide_id) per page load when a slide becomes active
// ("impression"), and once per CTA activation ("click"). The client
// dedupes impressions in-memory so an autoplay loop-around doesn't
// double-count. Persisted to D1 (table `hero_slide_events`).
//
// Admin GET: aggregated per-slide rollup — total + unique impressions
// and clicks, plus computed CTR. The admin UI cross-joins this against
// the live slides list so newly-added slides show with zeros.
//
// Privacy posture is identical to `/api/page-events` (see header doc
// in `migrations/0006_page_events.sql`). The endpoint never reads or
// stores the IP — country comes from `cf-ipcountry`, session id is
// the same UUIDv4 that `useVisitorHeartbeat` writes to localStorage.
//
// Null-safe: when env.DB is unbound the public POST returns
// 200/{ recorded: false } and the admin GET returns 503/{ available:
// false } so the rest of the API keeps working unchanged. This
// matches every other D1-backed analytics endpoint in this repo.

import { initRequestContext } from "./_lib/handler-wrapper.js";
import { isAuthenticated } from "./_lib/admin-auth.js";
import { logError } from "./_lib/redact.js";
import {
  isD1Available,
  recordHeroSlideEvent,
  heroSlideStats,
  HERO_SLIDE_EVENT_TYPES,
} from "./_lib/d1.js";

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
    },
  });

const parseJson = async (request) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

const extractCountry = (request) => {
  const cc = (request.headers?.get?.("cf-ipcountry") || "")
    .trim()
    .toUpperCase();
  if (!cc || cc === "XX") return null;
  return cc.slice(0, 4);
};

const sanitizeShortString = (value, maxLen = 64) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, maxLen);
  return trimmed || null;
};

const ALLOWED_DEVICES = new Set(["mobile", "tablet", "desktop", "unknown"]);

export const onRequestPost = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;

  if (!isD1Available()) {
    return json(200, { recorded: false, reason: "d1-unbound" });
  }

  const body = await parseJson(request);
  if (!body || typeof body !== "object") {
    return json(400, { error: "JSON body required" });
  }

  const sessionId = sanitizeShortString(body.sessionId);
  const slideId = sanitizeShortString(body.slideId);
  const eventType = sanitizeShortString(body.eventType, 16);
  if (!sessionId || !slideId || !eventType) {
    return json(400, { error: "sessionId, slideId, eventType required" });
  }
  if (!HERO_SLIDE_EVENT_TYPES.has(eventType)) {
    return json(400, { error: "Unsupported eventType" });
  }

  const device =
    typeof body.device === "string" && ALLOWED_DEVICES.has(body.device)
      ? body.device
      : null;
  const country = extractCountry(request);
  const id = sanitizeShortString(body.id);

  try {
    const result = await recordHeroSlideEvent({
      id,
      sessionId,
      slideId,
      eventType,
      country,
      device,
    });
    return json(200, result || { recorded: false });
  } catch (error) {
    logError("hero-slide-events POST error:", error);
    return json(500, { error: "Could not record hero slide event" });
  }
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
        "D1 binding (env.DB) not configured. Hero slide analytics require D1 — the migration table is in `migrations/0011_hero_slide_events.sql`.",
    });
  }

  const url = new URL(request.url);
  const days = Math.max(
    1,
    Math.min(365, Math.floor(Number(url.searchParams.get("days")) || 30)),
  );

  try {
    const rows = await heroSlideStats({ days });
    return json(200, { available: true, days, rows: rows || [] });
  } catch (error) {
    logError("hero-slide-events GET error:", error);
    return json(500, { error: "Could not load hero slide stats" });
  }
};
