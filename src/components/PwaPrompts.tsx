import { useEffect, useState } from "react";
import { Download, RefreshCw, WifiOff, X } from "lucide-react";
import {
  applyServiceWorkerUpdate,
  isStandalone,
  onPwaEvent,
  triggerInstallPrompt,
} from "@/lib/pwa";

const INSTALL_DISMISSED_KEY = "pintaterra:pwa:install-dismissed-at";
const INSTALL_DISMISS_DAYS = 14;

const wasRecentlyDismissed = () => {
  try {
    const raw = localStorage.getItem(INSTALL_DISMISSED_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < INSTALL_DISMISS_DAYS * 86400000;
  } catch {
    return false;
  }
};

export default function PwaPrompts() {
  const [installAvailable, setInstallAvailable] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [offline, setOffline] = useState(
    typeof navigator !== "undefined" && navigator.onLine === false,
  );
  const [installing, setInstalling] = useState(false);
  const [dismissedInstall, setDismissedInstall] = useState(
    () => wasRecentlyDismissed() || isStandalone(),
  );

  useEffect(() => {
    const off = onPwaEvent((e) => {
      if (e.type === "install-available") {
        setInstallAvailable(true);
      } else if (e.type === "installed") {
        setInstallAvailable(false);
      } else if (e.type === "update-available") {
        setUpdateAvailable(true);
      } else if (e.type === "online") {
        setOffline(!e.online);
      }
    });
    return () => {
      off();
    };
  }, []);

  const handleInstall = async () => {
    setInstalling(true);
    const outcome = await triggerInstallPrompt();
    setInstalling(false);
    if (outcome === "dismissed") {
      try {
        localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now()));
      } catch {
        /* ignore */
      }
      setDismissedInstall(true);
    } else if (outcome === "accepted") {
      setInstallAvailable(false);
    }
  };

  const handleDismissInstall = () => {
    try {
      localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setDismissedInstall(true);
  };

  return (
    <>
      {/* Offline indicator */}
      {offline && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 px-3 py-1.5 rounded-full bg-foreground text-background text-xs shadow-md">
          <WifiOff className="w-3.5 h-3.5" />
          You&apos;re offline · cached pages and saved cart still work
        </div>
      )}

      {/* Update banner */}
      {updateAvailable && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[1000] max-w-sm w-[calc(100vw-2rem)] rounded-md border border-border bg-background shadow-lg p-3 flex items-start gap-3">
          <RefreshCw className="w-4 h-4 text-foreground mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              A new version is ready
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Reload to pick up the latest paintings and fixes.
            </p>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => void applyServiceWorkerUpdate()}
                className="text-xs px-3 py-1.5 rounded bg-foreground text-background hover:opacity-90"
              >
                Reload now
              </button>
              <button
                type="button"
                onClick={() => setUpdateAvailable(false)}
                className="text-xs px-3 py-1.5 rounded text-muted-foreground hover:text-foreground"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Install prompt */}
      {installAvailable && !dismissedInstall && !updateAvailable && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[999] max-w-sm w-[calc(100vw-2rem)] rounded-md border border-border bg-background shadow-lg p-3 flex items-start gap-3">
          <Download className="w-4 h-4 text-foreground mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              Install Pintaterra
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Add to your home screen for one-tap access and offline browsing of
              saved paintings.
            </p>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                disabled={installing}
                onClick={() => void handleInstall()}
                className="text-xs px-3 py-1.5 rounded bg-foreground text-background hover:opacity-90 disabled:opacity-50"
              >
                {installing ? "Installing…" : "Install app"}
              </button>
              <button
                type="button"
                onClick={handleDismissInstall}
                className="text-xs px-3 py-1.5 rounded text-muted-foreground hover:text-foreground"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismissInstall}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Dismiss install prompt"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
}
