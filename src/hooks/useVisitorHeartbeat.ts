import { useEffect } from "react";

const VISITORS_API = "/api/visitors";
const VISITOR_KEY = "canvhub_visitor_id";
// Heartbeat cadence is intentionally well below the server-side
// LIVE_WINDOW_MS (6 min) so a visitor that briefly drops a heartbeat
// (tab backgrounded, network blip) still gets re-counted as live on
// the next ping. Going much faster than this just burns Workers KV
// writes — every heartbeat costs ~3 writes (heartbeats blob + 24h
// history + rate-limit counter, when enabled) and the free tier only
// gives 1k writes / day. 4 min keeps the live counter visibly
// responsive without eating the daily budget.
const HEARTBEAT_INTERVAL_MS = 4 * 60 * 1000; // 4 min

/**
 * Returns a stable visitor id that survives tab close, refreshes, and
 * cross-tab usage within the same browser. Falls back to sessionStorage
 * (and finally a per-load id) when localStorage is blocked, e.g. in
 * Safari private mode.
 */
const ensureVisitorId = (): string => {
  if (typeof window === "undefined") return "";
  const stores: (Storage | null)[] = [];
  try {
    stores.push(window.localStorage);
  } catch {
    stores.push(null);
  }
  try {
    stores.push(window.sessionStorage);
  } catch {
    stores.push(null);
  }

  for (const store of stores) {
    if (!store) continue;
    try {
      const existing = store.getItem(VISITOR_KEY);
      if (existing) return existing;
      const id = crypto.randomUUID();
      store.setItem(VISITOR_KEY, id);
      return id;
    } catch {
      continue;
    }
  }

  return crypto.randomUUID();
};

/**
 * Pings /api/visitors periodically so the admin live-visitor counter
 * has something to count. Best-effort: failures are swallowed silently.
 *
 * Heartbeats are only sent while the tab is visible so backgrounded
 * tabs do not inflate the live count. The visitor id is persisted in
 * localStorage so the same user across tabs/refreshes counts once.
 *
 * Cadence is paced against the server's LIVE_WINDOW_MS to keep KV
 * writes well under the 1k/day free-tier ceiling — see the constant
 * above for the rationale.
 */
export const useVisitorHeartbeat = () => {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sessionId = ensureVisitorId();
    if (!sessionId) return;

    const ping = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }
      void fetch(VISITORS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
        keepalive: true,
      }).catch(() => {});
    };

    ping();
    const interval = window.setInterval(ping, HEARTBEAT_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
};
