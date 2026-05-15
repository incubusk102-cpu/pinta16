// /api/hero-slides/stats — admin-only aggregated per-slide impressions,
// clicks, unique-session impressions, and CTR for the admin Hero Slides
// editor. Reads from D1 (`hero_events` table) populated by the public
// beacon at `/api/hero-slides/events`.

import { initRequestContext } from "../_lib/handler-wrapper.js";
import { isAuthenticated } from "../_lib/admin-auth.js";
import { withSecurityHeaders } from "../_lib/security-headers.js";
import { logError } from "../_lib/redact.js";
import { isD1Available, heroSlideStats } from "../_lib/d1.js";

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: withSecurityHeaders(),
  });

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
        "D1 binding (env.DB) not configured. Hero analytics require D1 — the migration is in `migrations/0011_hero_events.sql`.",
      days: 30,
      results: [],
    });
  }

  const url = new URL(request.url);
  const days = Math.max(
    1,
    Math.min(365, Math.floor(Number(url.searchParams.get("days")) || 30)),
  );

  try {
    const rows = await heroSlideStats({ days });
    return json(200, { available: true, days, results: rows || [] });
  } catch (error) {
    logError("hero-slides/stats GET error:", error);
    return json(500, { error: "Could not load hero stats" });
  }
};
