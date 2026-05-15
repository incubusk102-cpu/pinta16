// Hero-carousel analytics beacon. Posts one fire-and-forget event per
// impression (slide settles on screen) or click (CTA activates) to
// `/api/hero-slides/events`. The server (functions/api/hero-slides/events.js)
// persists to D1 — see `migrations/0011_hero_events.sql`.
//
// Best-effort by design: every failure mode (no localStorage, no D1,
// blocked fetch) silently no-ops so the public homepage never breaks.

import { jsonAuthHeaders } from "@/lib/api";

const VISITOR_KEY = "canvhub_visitor_id";
const HERO_EVENTS_API = "/api/hero-slides/events";

export type HeroBeaconKind = "impression" | "click";

const readSessionId = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(VISITOR_KEY);
  } catch {
    return null;
  }
};

const newClickId = (): string => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `hc_${crypto.randomUUID()}`;
  }
  return `hc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

// Sanitise to the same shape the server-side regex accepts so a
// stale / mangled id can't trigger a 400 we'd see in the network tab.
const SLIDE_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

interface SendArgs {
  slideId: string;
  kind: HeroBeaconKind;
}

export const sendHeroBeacon = ({ slideId, kind }: SendArgs): void => {
  if (typeof window === "undefined") return;
  if (!SLIDE_ID_RE.test(slideId)) return;

  const sessionId = readSessionId();
  if (!sessionId) return;

  // Deterministic impression id collapses repeats from autoplay loops
  // into a single D1 row per (session, slide). Click ids are always
  // fresh because repeat clicks legitimately count.
  const id =
    kind === "impression"
      ? `hi_${sessionId}_${slideId}`.slice(0, 96)
      : newClickId();

  const payload = JSON.stringify({ id, sessionId, slideId, kind });

  // Prefer navigator.sendBeacon for clicks — same-tab navigation can
  // cancel an in-flight fetch but never a beacon. Impressions can
  // fall through to fetch + keepalive since the page is still alive.
  if (
    kind === "click" &&
    typeof navigator !== "undefined" &&
    navigator.sendBeacon
  ) {
    try {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon(HERO_EVENTS_API, blob)) return;
    } catch {
      // fall through to fetch
    }
  }

  void fetch(HERO_EVENTS_API, {
    method: "POST",
    headers: jsonAuthHeaders(),
    body: payload,
    keepalive: true,
  }).catch(() => {
    // Beacon is best-effort — never surface failures to the shopper.
  });
};
