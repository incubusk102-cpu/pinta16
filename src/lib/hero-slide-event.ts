// Client beacon for per-hero-slide engagement events. One row per
// (session, slide, event_type) lands in D1 via /api/hero-slide-events;
// the admin readback in /admin → Hero slider rolls those up into
// impressions / clicks / CTR per slide.
//
// Keep `HERO_SLIDE_EVENT_TYPES` in sync with the same Set in
// `functions/api/_lib/d1.js`.
import { jsonAuthHeaders } from "@/lib/api";
import { detectDevice } from "@/lib/page-event-kind";

const VISITOR_KEY = "canvhub_visitor_id";
const HERO_SLIDE_EVENTS_API = "/api/hero-slide-events";

export type HeroSlideEventType = "impression" | "click";

export const HERO_SLIDE_EVENT_TYPES: readonly HeroSlideEventType[] = [
  "impression",
  "click",
];

const readSessionId = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(VISITOR_KEY);
  } catch {
    return null;
  }
};

/**
 * Fire a fire-and-forget POST to `/api/hero-slide-events`. Never throws
 * and never surfaces failures to the shopper — analytics must never
 * break the hero on the homepage. Returns silently when localStorage
 * is blocked (no session id ⇒ no row).
 */
export const sendHeroSlideEvent = (
  slideId: string,
  eventType: HeroSlideEventType,
): void => {
  if (typeof window === "undefined") return;
  if (!slideId) return;
  const sessionId = readSessionId();
  if (!sessionId) return;

  const payload = {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `hs_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    sessionId,
    slideId,
    eventType,
    device: detectDevice(),
  };

  void fetch(HERO_SLIDE_EVENTS_API, {
    method: "POST",
    headers: jsonAuthHeaders(),
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Best-effort beacon — never surface failures to the shopper.
  });
};
