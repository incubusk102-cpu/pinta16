import { useEffect } from "react";

const VISITORS_API = "/api/visitors";
const SESSION_KEY = "pintaterra_visitor_session";
const HEARTBEAT_INTERVAL_MS = 60 * 1000; // 1 min

const ensureSessionId = (): string => {
  if (typeof window === "undefined") return "";
  let sessionId = window.sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
};

/**
 * Pings /api/visitors periodically so the admin live-visitor counter
 * has something to count. Best-effort: failures are swallowed silently.
 */
export const useVisitorHeartbeat = () => {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sessionId = ensureSessionId();
    if (!sessionId) return;

    const ping = () => {
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
