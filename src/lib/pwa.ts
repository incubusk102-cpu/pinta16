/* PWA registration helper.
 *
 * Registers /sw.js after the page is idle, exposes a tiny event bus so
 * components can react to "update-available" or "offline-ready", and a
 * helper to ask the SW to skipWaiting + reload. The install prompt
 * (beforeinstallprompt) is captured once and replayed via the same bus.
 */

type PwaEvent =
  | { type: "registered" }
  | { type: "update-available" }
  | { type: "controlling" }
  | { type: "install-available"; promptEvent: BeforeInstallPromptEvent }
  | { type: "installed" }
  | { type: "online"; online: boolean };

type Listener = (e: PwaEvent) => void;

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const listeners = new Set<Listener>();

const emit = (event: PwaEvent) => {
  listeners.forEach((l) => {
    try {
      l(event);
    } catch {
      /* ignore */
    }
  });
};

export const onPwaEvent = (listener: Listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

let cachedInstallEvent: BeforeInstallPromptEvent | null = null;
let registration: ServiceWorkerRegistration | null = null;

export const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as { standalone?: boolean }).standalone === true);

export const triggerInstallPrompt = async (): Promise<
  "accepted" | "dismissed" | "unavailable"
> => {
  if (!cachedInstallEvent) return "unavailable";
  try {
    await cachedInstallEvent.prompt();
    const choice = await cachedInstallEvent.userChoice;
    cachedInstallEvent = null;
    return choice.outcome;
  } catch {
    return "dismissed";
  }
};

export const applyServiceWorkerUpdate = async () => {
  if (!registration) return;
  if (registration.waiting) {
    registration.waiting.postMessage("skipWaiting");
  } else if (registration.installing) {
    registration.installing.postMessage("skipWaiting");
  }
};

export const registerPwa = () => {
  if (typeof window === "undefined") return;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    cachedInstallEvent = e as BeforeInstallPromptEvent;
    emit({ type: "install-available", promptEvent: cachedInstallEvent });
  });

  window.addEventListener("appinstalled", () => {
    cachedInstallEvent = null;
    emit({ type: "installed" });
  });

  window.addEventListener("online", () =>
    emit({ type: "online", online: true }),
  );
  window.addEventListener("offline", () =>
    emit({ type: "online", online: false }),
  );

  if (!("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) return;

  // Wire up the rotation listener so the SW can hand back rotated push
  // subscriptions and we re-register them under the same email. Safe to
  // call before the SW finishes registering; addEventListener attaches to
  // navigator.serviceWorker which exists immediately.
  void import("@/lib/orderPush").then(
    ({ handlePushSubscriptionChangeMessages }) => {
      try {
        handlePushSubscriptionChangeMessages();
      } catch {
        /* ignore — push isn't critical to PWA registration */
      }
    },
  );

  const start = () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        registration = reg;
        emit({ type: "registered" });

        if (reg.waiting) emit({ type: "update-available" });

        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (
              installing.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              emit({ type: "update-available" });
            }
          });
        });

        // Reload once when the new SW takes control so users see the new
        // version. Use a guard so we don't loop on subsequent activations.
        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (refreshing) return;
          refreshing = true;
          emit({ type: "controlling" });
          window.location.reload();
        });

        // Periodic update check while the tab is open.
        setInterval(
          () => {
            reg.update().catch(() => {
              /* ignore */
            });
          },
          60 * 60 * 1000,
        );
      })
      .catch(() => {
        /* ignore - SW failed to register */
      });
  };

  if ("requestIdleCallback" in window) {
    (
      window as Window & {
        requestIdleCallback?: (cb: () => void) => void;
      }
    ).requestIdleCallback?.(start);
  } else {
    setTimeout(start, 1500);
  }
};
