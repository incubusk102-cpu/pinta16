import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { jsonAuthHeaders } from "@/lib/api";
import {
  detectDevice,
  pathToPageEventKind,
  type PageEventKind,
} from "@/lib/page-event-kind";

const VISITOR_KEY = "canvhub_visitor_id";
const PAGE_EVENTS_API = "/api/page-events";
const ADMIN_PATH_PREFIX = "/admin";

/**
 * Read the same `canvhub_visitor_id` that `useVisitorHeartbeat` writes
 * (UUIDv4 in localStorage). One stable id per browser; never PII.
 * Returns null when storage is blocked — in that case we skip the
 * beacon entirely rather than minting an ephemeral id that would
 * inflate "unique session" counts.
 */
const readSessionId = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(VISITOR_KEY);
  } catch {
    return null;
  }
};

/**
 * Fire a fire-and-forget POST to /api/page-events on every TanStack
 * Router transition to a new pathname. Never beacons admin routes
 * (admin shouldn't pollute storefront analytics) and de-dupes
 * back-to-back identical (pathname, kind) transitions client-side so
 * an in-place state update doesn't double-count.
 *
 * Failures are silently swallowed — the public site must keep working
 * unchanged when D1 is down or the analytics endpoint is unreachable.
 */
export const usePageEventBeacon = () => {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const lastPathRef = useRef<string>("");
  const lastKindRef = useRef<PageEventKind | "">("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!pathname || pathname.startsWith(ADMIN_PATH_PREFIX)) return;

    const sessionId = readSessionId();
    if (!sessionId) return;

    const kind = pathToPageEventKind(pathname);
    if (pathname === lastPathRef.current && kind === lastKindRef.current) {
      return;
    }
    lastPathRef.current = pathname;
    lastKindRef.current = kind;

    const payload = {
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `pe_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      sessionId,
      path: pathname.slice(0, 500),
      pathKind: kind,
      referrer:
        typeof document !== "undefined" ? document.referrer || null : null,
      device: detectDevice(),
    };

    void fetch(PAGE_EVENTS_API, {
      method: "POST",
      headers: jsonAuthHeaders(),
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // Beacon is best-effort — never surface failures to the shopper.
    });
  }, [pathname]);
};
