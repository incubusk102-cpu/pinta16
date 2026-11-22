// Hero-slide event queries.
//
// D1 ledger of per-hero-slide engagement events. Powers the admin
// panel's per-slide analytics rail (impressions / clicks / CTR per
// slide) so the operator can A/B-compare copy + imagery without
// bolting on a third-party pixel.
//
// `INSERT OR IGNORE` on the caller-supplied id keeps retries idempotent.
// Null-safe: when `env.DB` is unbound everything resolves to `null` and
// the homepage hero keeps autoplaying.

import { ALLOWED_DEVICES, getD1, sinceFromDays } from "../core.js";

// Allow-listed event types. The client beacon emits one of these two
// strings per event; rows with any other value would inflate CTR. Keep
// in sync with `HERO_SLIDE_EVENT_TYPES` in `src/lib/hero-slide-event.ts`.
export const HERO_SLIDE_EVENT_TYPES = new Set(["impression", "click"]);

// Record one hero-slide engagement event from the public storefront
// beacon. Caller is `functions/api/hero-slide-events.js`. Null-safe
// when env.DB is unbound — the homepage hero keeps autoplaying
// regardless of D1 availability.
export async function recordHeroSlideEvent({
  id,
  sessionId,
  slideId,
  eventType,
  country = null,
  device = null,
}) {
  const db = getD1();
  if (!db) return null;
  const sid = String(sessionId || "")
    .trim()
    .slice(0, 64);
  if (!sid || !/^[a-zA-Z0-9_-]+$/.test(sid)) return null;
  const slide = String(slideId || "")
    .trim()
    .slice(0, 64);
  if (!slide || !/^[a-zA-Z0-9_-]+$/.test(slide)) return null;
  const type = String(eventType || "").trim();
  if (!HERO_SLIDE_EVENT_TYPES.has(type)) return null;
  const dev =
    device && ALLOWED_DEVICES.has(String(device)) ? String(device) : null;
  const eventId =
    typeof id === "string" && id.length > 0 && id.length <= 64
      ? id
      : `hs_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT OR IGNORE INTO hero_slide_events
         (id, session_id, slide_id, event_type, country, device, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(eventId, sid, slide, type, country || null, dev, now)
      .run();
    return { recorded: true };
  } catch (err) {
    return { recorded: false, reason: String(err?.message || err) };
  }
}

// Per-slide impressions / clicks / CTR over the trailing `days` window.
// Returns one row per slide_id that saw any event. Caller cross-joins
// against the current slides list to render rows for new slides that
// haven't accumulated events yet. Null-safe when env.DB is unbound.
export async function heroSlideStats({ days = 30 } = {}) {
  const db = getD1();
  if (!db) return null;
  const since = sinceFromDays(days);
  try {
    const result = await db
      .prepare(
        `SELECT
           slide_id,
           SUM(CASE WHEN event_type = 'impression' THEN 1 ELSE 0 END) AS impressions,
           SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) AS clicks,
           COUNT(DISTINCT CASE
                            WHEN event_type = 'impression' THEN session_id
                            ELSE NULL
                          END) AS unique_impressions,
           COUNT(DISTINCT CASE
                            WHEN event_type = 'click' THEN session_id
                            ELSE NULL
                          END) AS unique_clicks,
           MAX(ts) AS last_seen_at
         FROM hero_slide_events
         WHERE ts >= ?
         GROUP BY slide_id`,
      )
      .bind(since)
      .all();
    return result?.results || [];
  } catch {
    return null;
  }
}
