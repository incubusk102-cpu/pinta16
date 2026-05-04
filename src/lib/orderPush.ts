// Client-side Web Push helpers for order-status notifications.
//
// The PWA service worker is registered separately by src/lib/pwa.ts at /sw.js.
// This module:
//   - asks the user for Notification permission,
//   - subscribes to the browser's PushManager with the server's VAPID key,
//   - POSTs the resulting subscription to /api/push/subscribe with the
//     shopper's email so the server can fan out future order-status pushes,
//   - and gives the rest of the app a tidy `subscribeToOrderPush(email)` /
//     `unsubscribeFromOrderPush(email)` to call.
//
// Every state-changing POST uses jsonAuthHeaders() so the wrapper-level
// CSRF gate (handler-wrapper.js → isCsrfRejected) accepts the request when
// the shopper happens to be logged in (HttpOnly cv_user_session cookie
// present). Without the header those POSTs return a wrapper 403 that
// surfaces as a cryptic `server-403` toast on /order-confirmation.

import { jsonAuthHeaders } from "./api";

const PUSH_LS_KEY = "canvhub.orderPush.email";

// Translate a non-OK fetch Response into a UI-friendly reason string.
// - HTML 403 with `cf-mitigated: challenge` → "cf-challenge" (Cloudflare
//   Bot Fight Mode interstitial — page reload usually clears it)
// - JSON 403 mentioning "csrf" → "csrf-stale" (cookie/session expired
//   between page load and click; reload picks up a fresh token)
// - Everything else → "server-<status>" (preserves the legacy shape so
//   downstream callers / Sentry breadcrumbs keep their grouping).
const readServerErrorReason = async (res: Response): Promise<string> => {
  const status = res.status;
  const cfMitigated = res.headers.get("cf-mitigated") || "";
  if (cfMitigated.toLowerCase() === "challenge") {
    return "cf-challenge";
  }
  let bodyText = "";
  try {
    bodyText = await res.text();
  } catch {
    bodyText = "";
  }
  // Cloudflare BFM challenge pages are HTML even on /api/* paths.
  if (
    status === 403 &&
    bodyText.length > 0 &&
    bodyText.trimStart().startsWith("<")
  ) {
    return "cf-challenge";
  }
  if (status === 403 && /csrf/i.test(bodyText)) {
    return "csrf-stale";
  }
  return `server-${status}`;
};

export interface OrderPushState {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  email: string | null;
}

export const isOrderPushSupported = (): boolean =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

const getPermission = (): NotificationPermission | "unsupported" => {
  if (!isOrderPushSupported()) return "unsupported";
  return Notification.permission;
};

// PushManager.subscribe expects the VAPID public key as raw bytes of the
// uncompressed P-256 point (65 bytes), not the base64url string the
// server hands us. We decode into a fresh ArrayBuffer so the result is
// unambiguously a `BufferSource` backed by `ArrayBuffer` (not
// `SharedArrayBuffer`), which the lib.dom typings for
// `PushSubscriptionOptionsInit.applicationServerKey` require under
// TypeScript >= 5.7.
const urlBase64ToBuffer = (b64: string): ArrayBuffer => {
  const padded = b64 + "===".slice((b64.length + 3) % 4);
  const std = padded.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(std);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
};

const fetchVapidKey = async (): Promise<string | null> => {
  try {
    const res = await fetch("/api/push/vapid-key", {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { publicKey?: string };
    return typeof data.publicKey === "string" && data.publicKey
      ? data.publicKey
      : null;
  } catch {
    return null;
  }
};

const getRegistration = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!isOrderPushSupported()) return null;
  // The PWA registers /sw.js at scope "/" in src/lib/pwa.ts. We look it up
  // here rather than register again, but fall back to register() in case
  // this module gets called before pwa.ts has run (e.g. dev mode).
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) {
    // wait until active so pushManager is usable
    if (!existing.active) {
      await navigator.serviceWorker.ready;
    }
    return existing;
  }
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
};

export const getOrderPushState = async (): Promise<OrderPushState> => {
  const supported = isOrderPushSupported();
  if (!supported) {
    return {
      supported: false,
      permission: "unsupported",
      subscribed: false,
      email: null,
    };
  }
  const reg = await getRegistration();
  let subscribed = false;
  if (reg) {
    try {
      const sub = await reg.pushManager.getSubscription();
      subscribed = !!sub;
    } catch {
      subscribed = false;
    }
  }
  let email: string | null = null;
  try {
    email = window.localStorage.getItem(PUSH_LS_KEY);
  } catch {
    email = null;
  }
  return {
    supported: true,
    permission: getPermission(),
    subscribed,
    email,
  };
};

export const subscribeToOrderPush = async (
  email: string,
): Promise<{ ok: boolean; reason?: string }> => {
  if (!isOrderPushSupported()) {
    return { ok: false, reason: "unsupported" };
  }
  const trimmed = (email || "").trim();
  if (!trimmed || !trimmed.includes("@")) {
    return { ok: false, reason: "invalid email" };
  }
  // 1. Ask for Notification permission.
  let permission = Notification.permission;
  if (permission === "default") {
    try {
      permission = await Notification.requestPermission();
    } catch {
      permission = "denied";
    }
  }
  if (permission !== "granted") {
    return { ok: false, reason: permission };
  }
  // 2. Get SW registration + server VAPID key in parallel.
  const [reg, vapid] = await Promise.all([getRegistration(), fetchVapidKey()]);
  if (!reg) return { ok: false, reason: "no-service-worker" };
  if (!vapid) return { ok: false, reason: "no-vapid-key" };
  // 3. Subscribe (or reuse an existing subscription).
  let sub: PushSubscription | null = null;
  try {
    sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBuffer(vapid),
      });
    }
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "subscribe-failed",
    };
  }
  // 4. Hand the subscription to the server, paired with the email so future
  //    order-status pushes can find the right device(s).
  const json = sub.toJSON();
  try {
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: jsonAuthHeaders(),
      credentials: "same-origin",
      body: JSON.stringify({
        email: trimmed,
        subscription: {
          endpoint: json.endpoint,
          keys: json.keys,
        },
      }),
    });
    if (!res.ok) {
      return { ok: false, reason: await readServerErrorReason(res) };
    }
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "network",
    };
  }
  try {
    window.localStorage.setItem(PUSH_LS_KEY, trimmed.toLowerCase());
  } catch {
    /* ignore */
  }
  return { ok: true };
};

export const unsubscribeFromOrderPush = async (
  email?: string,
): Promise<{ ok: boolean; reason?: string }> => {
  if (!isOrderPushSupported()) {
    return { ok: false, reason: "unsupported" };
  }
  const reg = await getRegistration();
  if (!reg) return { ok: false, reason: "no-service-worker" };
  let sub: PushSubscription | null = null;
  try {
    sub = await reg.pushManager.getSubscription();
  } catch {
    sub = null;
  }
  if (!sub) {
    try {
      window.localStorage.removeItem(PUSH_LS_KEY);
    } catch {
      /* ignore */
    }
    return { ok: true, reason: "no-subscription" };
  }
  const endpoint = sub.endpoint;
  const targetEmail =
    email ||
    (() => {
      try {
        return window.localStorage.getItem(PUSH_LS_KEY) || "";
      } catch {
        return "";
      }
    })();
  // 1. Unsubscribe locally so the browser stops accepting further pushes.
  try {
    await sub.unsubscribe();
  } catch {
    /* ignore — server-side cleanup will still happen */
  }
  // 2. Tell the server to forget this endpoint.
  if (targetEmail) {
    try {
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: jsonAuthHeaders(),
        credentials: "same-origin",
        body: JSON.stringify({ email: targetEmail, endpoint }),
      });
    } catch {
      /* ignore — endpoint will eventually 410 on send */
    }
  }
  try {
    window.localStorage.removeItem(PUSH_LS_KEY);
  } catch {
    /* ignore */
  }
  return { ok: true };
};

// React listener for "pushsubscriptionchange" events the SW forwards back
// to the page. Re-registers the rotated subscription under the same email.
export const handlePushSubscriptionChangeMessages = () => {
  if (!isOrderPushSupported()) return;
  navigator.serviceWorker.addEventListener("message", async (event) => {
    if (
      !event.data ||
      event.data.type !== "pushsubscriptionchange" ||
      !event.data.subscription
    ) {
      return;
    }
    let email = "";
    try {
      email = window.localStorage.getItem(PUSH_LS_KEY) || "";
    } catch {
      email = "";
    }
    if (!email) return;
    try {
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: jsonAuthHeaders(),
        credentials: "same-origin",
        body: JSON.stringify({
          email,
          subscription: event.data.subscription,
        }),
      });
    } catch {
      /* ignore */
    }
  });
};
