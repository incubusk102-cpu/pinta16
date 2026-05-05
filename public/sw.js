/* Canvas Hub PWA service worker.
 *
 * Strategy:
 *  - App shell (precached): "/", "/manifest.webmanifest", icons, /offline
 *  - Static assets (Vite-hashed under /assets/): cache-first, fall back to network.
 *  - Same-origin GET HTML / navigation: network-first, fall back to /offline.
 *  - Same-origin GET API (/api/*): network-first with
 *    a short timeout; never cached so we don't show stale order data.
 *  - All other requests: pass through.
 */

const VERSION = "v6";
const APP_SHELL = `canvhub-shell-${VERSION}`;
const ASSETS = `canvhub-assets-${VERSION}`;
const RUNTIME = `canvhub-runtime-${VERSION}`;

const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/icon.svg",
  "/favicon.png",
];

const OFFLINE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Offline · Canvas Hub</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;
       background:#f5f3ee;color:#1c1c1c;
       font-family:Inter,Helvetica,Arial,sans-serif;padding:24px;}
  .card{max-width:480px;text-align:center;}
  h1{font-family:Georgia,'Playfair Display',serif;font-size:28px;font-weight:400;
     letter-spacing:0.02em;margin:0 0 8px;}
  p{color:#5b5648;line-height:1.6;font-size:14px;margin:0 0 16px;}
  .pill{display:inline-block;padding:8px 14px;border:1px solid #1c1c1c;
        border-radius:999px;font-size:11px;letter-spacing:0.2em;
        text-transform:uppercase;cursor:pointer;background:#1c1c1c;color:#f5f3ee;}
</style>
</head>
<body>
  <div class="card">
    <h1>You're offline</h1>
    <p>Your saved cart and wishlist are still here on this device. New
       paintings, account changes, and checkout will resume as soon as
       you're back online.</p>
    <button class="pill" onclick="location.reload()">Try again</button>
  </div>
</body>
</html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_SHELL);
      // Allow individual precache failures so a missing asset doesn't kill the install.
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: "reload" }));
          } catch {
            /* ignore */
          }
        }),
      );
      self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (k) =>
              ![APP_SHELL, ASSETS, RUNTIME].includes(k) &&
              k.startsWith("canvhub-"),
          )
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting" || event.data?.type === "skipWaiting") {
    self.skipWaiting();
  }
});

// --- Web Push handlers ---------------------------------------------------
// Order-status notifications fan out from /api/push/* to every device that
// opted in for the customer's email. The push payload is the JSON the
// server built in functions/api/_lib/push.js (buildPushPayload):
//   { title, body, icon, badge, tag, url, kind, orderId }
// We deliberately fall back to a generic Canvas Hub notification if the
// payload can't be decoded so the user still sees *something* rather than
// a silent miss (which Chrome will warn about loudly via "site sent push
// without showing a notification").

const FALLBACK_NOTIFICATION = {
  title: "Canvas Hub",
  body: "You have a new order update.",
  icon: "/icon-192.png",
  badge: "/icon-192.png",
  url: "/account",
};

self.addEventListener("push", (event) => {
  let data = null;
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      try {
        data = { body: event.data.text() };
      } catch {
        data = null;
      }
    }
  }
  const payload = data || FALLBACK_NOTIFICATION;
  const title = String(payload.title || FALLBACK_NOTIFICATION.title).slice(
    0,
    120,
  );
  const options = {
    body: String(payload.body || FALLBACK_NOTIFICATION.body).slice(0, 400),
    icon: payload.icon || FALLBACK_NOTIFICATION.icon,
    badge: payload.badge || FALLBACK_NOTIFICATION.badge,
    tag: payload.tag || undefined,
    data: {
      url: payload.url || FALLBACK_NOTIFICATION.url,
      kind: payload.kind || "",
      orderId: payload.orderId || "",
    },
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  const target =
    (event.notification.data && event.notification.data.url) || "/account";
  event.notification.close();
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Reuse an existing tab on the same origin if possible; otherwise
      // open a new one.
      for (const client of all) {
        try {
          const url = new URL(client.url);
          if (url.origin === self.location.origin) {
            await client.focus();
            if ("navigate" in client) {
              try {
                await client.navigate(target);
              } catch {
                /* same-origin navigation may fail in some browsers */
              }
            }
            return;
          }
        } catch {
          /* ignore */
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  // The push subscription was rotated by the user agent (key rotation,
  // GCM->FCM migration, etc.). We can't reconstruct the user's email here,
  // so we just resubscribe with the same applicationServerKey and post the
  // new subscription back through any open client; the client is responsible
  // for re-registering it under the right email.
  event.waitUntil(
    (async () => {
      try {
        const oldSub = event.oldSubscription;
        const opts = oldSub?.options || {};
        const newSub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: opts.applicationServerKey,
        });
        const all = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        for (const client of all) {
          client.postMessage({
            type: "pushsubscriptionchange",
            subscription: newSub.toJSON(),
          });
        }
      } catch {
        /* ignore — best-effort */
      }
    })(),
  );
});

const isApiRequest = (url) => url.pathname.startsWith("/api/");

const isAssetRequest = (url) =>
  url.pathname.startsWith("/assets/") ||
  url.pathname.startsWith("/images/") ||
  /\.(?:js|css|woff2?|ttf|otf|eot|png|jpg|jpeg|svg|webp|gif|ico)$/i.test(
    url.pathname,
  );

const networkFirst = async (request, { timeout = 8000 } = {}) => {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("network timeout"));
    }, timeout);
    fetch(request)
      .then((response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(response);
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
  });
};

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.headers.has("range")) return;

  // API requests: network-first, no cache, fall back to JSON offline marker.
  if (isApiRequest(url)) {
    event.respondWith(
      networkFirst(request, { timeout: 6000 }).catch(
        () =>
          new Response(JSON.stringify({ error: "offline", offline: true }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    return;
  }

  // Navigations: network-first, fall back to cached "/" or offline page.
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await networkFirst(request, { timeout: 5000 });
          const copy = fresh.clone();
          caches.open(RUNTIME).then((c) => c.put(request, copy));
          return fresh;
        } catch {
          const cached =
            (await caches.match(request)) || (await caches.match("/")) || null;
          if (cached) return cached;
          return new Response(OFFLINE_HTML, {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
      })(),
    );
    return;
  }

  // Static assets: cache-first, then network.
  if (isAssetRequest(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const fresh = await fetch(request);
          if (fresh && fresh.ok && fresh.type === "basic") {
            const cache = await caches.open(ASSETS);
            cache.put(request, fresh.clone());
          }
          return fresh;
        } catch {
          if (cached) return cached;
          return new Response("", { status: 504 });
        }
      })(),
    );
    return;
  }
});
