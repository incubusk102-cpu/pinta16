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

const PUSH_LS_KEY = "canvhub.orderPush.email";

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

// PushManager.subscribe expects the VAPID public key as a Uint8Array of the
// raw uncompressed P-256 point (65 bytes), not the base64url string the
// server hands us. So we decode here.
const urlBase64ToUint8Array = (b64: string): Uint8Array => {
  const padded = b64 + "===".slice((b64.length + 3) % 4);
  const std = padded.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(std);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
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
        applicationServerKey: urlBase64ToUint8Array(vapid),
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: trimmed,
        subscription: {
          endpoint: json.endpoint,
          keys: json.keys,
        },
      }),
    });
    if (!res.ok) {
      return { ok: false, reason: `server-${res.status}` };
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
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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
