// Inline opt-in card that the OrderConfirmation modal mounts the moment a
// shopper finishes checkout. Asks the user for browser-push permission so
// every subsequent status change (confirmed → in_progress →
// out_for_delivery → received → refund states) lands as a free, no-cost
// push notification on the same device. The customer's email comes
// straight from the order they just placed.

import { useEffect, useState } from "react";
import { Bell, BellOff, Check, X } from "lucide-react";
import { toast } from "sonner";
import {
  isOrderPushSupported,
  isOrderPushServerConfigured,
  getOrderPushState,
  subscribeToOrderPush,
  unsubscribeFromOrderPush,
} from "@/lib/orderPush";

const DISMISS_KEY = "canvhub:orderPush:dismissed-at";
const DISMISS_DAYS = 14;

const wasRecentlyDismissed = () => {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < DISMISS_DAYS * 86400000;
  } catch {
    return false;
  }
};

interface OrderPushOptInPromptProps {
  /** Email the order was placed under — used to register the subscription. */
  email: string;
  /** Tone: a compact card on the OrderConfirmation modal vs. a richer block in /account. */
  variant?: "card" | "inline";
  /** Forces the prompt to appear even if dismissed previously (for /account). */
  forceShow?: boolean;
}

export default function OrderPushOptInPrompt({
  email,
  variant = "card",
  forceShow = false,
}: OrderPushOptInPromptProps) {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(
    forceShow ? false : wasRecentlyDismissed(),
  );
  // `null` until the probe finishes so we can render nothing instead of
  // briefly flashing the card on devices where VAPID isn't configured.
  const [serverReady, setServerReady] = useState<boolean | null>(null);

  // Sync state with the browser/SW on mount and whenever the email changes.
  // We also probe `/api/push/vapid-key` so the card hides cleanly when
  // the server isn't configured for Web Push (no VAPID env vars).
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const [state, ready] = await Promise.all([
        getOrderPushState(),
        isOrderPushServerConfigured(),
      ]);
      if (cancelled) return;
      setSupported(state.supported);
      setPermission(state.permission);
      setSubscribed(state.subscribed);
      setServerReady(ready);
    };
    sync();
    return () => {
      cancelled = true;
    };
  }, [email]);

  const handleEnable = async () => {
    if (busy) return;
    setBusy(true);
    const res = await subscribeToOrderPush(email);
    setBusy(false);
    if (res.ok) {
      setSubscribed(true);
      setPermission("granted");
      toast.success("Order updates enabled", {
        description:
          "We'll send a notification whenever your order status changes.",
      });
    } else if (res.reason === "denied") {
      toast.error("Notifications blocked", {
        description:
          "Reset notifications for this site in your browser settings, then try again.",
      });
    } else if (res.reason === "default") {
      toast.message("Permission required", {
        description:
          "Tap Enable and accept the browser prompt to get order updates.",
      });
    } else if (res.reason === "unsupported") {
      toast.error("Not supported on this browser");
    } else if (res.reason === "no-vapid-key") {
      // The server hasn't been configured for Web Push (missing VAPID
      // env vars). Hide the card and surface a clear message rather
      // than a generic failure toast.
      setServerReady(false);
      toast.error("Order updates aren't available yet", {
        description:
          "This site hasn't been set up for push notifications. We'll still email you on every status change.",
      });
    } else if (res.reason === "cf-challenge") {
      // Cloudflare Bot Fight Mode interstitial. A full reload picks up a
      // fresh challenge cookie which usually clears it; tell the user to
      // try that rather than showing the cryptic underlying status code.
      toast.error("Couldn't enable notifications", {
        description:
          "Please refresh the page and try again. If it keeps happening, contact support.",
      });
    } else if (res.reason === "csrf-stale") {
      // Stale CSRF cookie — almost always means the session ticked over
      // between page load and the click. A reload re-issues the token.
      toast.error("Session expired", {
        description: "Please refresh the page and try again.",
      });
    } else {
      toast.error("Couldn't enable notifications", {
        description: res.reason || "Please try again in a moment.",
      });
    }
  };

  const handleDisable = async () => {
    if (busy) return;
    setBusy(true);
    const res = await unsubscribeFromOrderPush(email);
    setBusy(false);
    if (res.ok) {
      setSubscribed(false);
      toast.success("Order updates turned off");
    }
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  // Hide the card for browsers that can't deliver web push at all (mostly
  // ancient Safari / Firefox-on-iOS-pre-16.4) so we don't promise something
  // that won't work.
  if (!supported && permission === "unsupported") return null;
  if (!isOrderPushSupported()) return null;
  // Probe still in flight or the server returned 503 vapid-not-configured
  // — render nothing rather than dangle a button that always errors out.
  if (serverReady !== true) return null;
  // Hide if the user already explicitly hard-blocked notifications — there's
  // no UI we can show to recover from that beyond "fix it in browser
  // settings", and the toast above already says that on click.
  if (permission === "denied" && !forceShow) return null;
  if (dismissed && !subscribed && !forceShow) return null;

  if (variant === "inline") {
    // Richer layout used in /account where there's room to breathe.
    return (
      <div className="rounded-md border border-border/40 bg-muted/20 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Bell className="w-5 h-5 mt-0.5 text-foreground" />
          <div className="flex-1">
            <p className="font-body text-sm text-foreground">
              {subscribed
                ? "Order updates are on for this device"
                : "Get free order updates on this device"}
            </p>
            <p className="font-body text-xs text-muted-foreground mt-1">
              {subscribed
                ? "We'll notify you whenever an order changes status — confirmed, in progress, out for delivery, delivered, refunded."
                : "Free, no extra charges. Skip refreshing your inbox — your phone or browser will buzz the moment we have news."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {subscribed ? (
            <button
              type="button"
              onClick={handleDisable}
              disabled={busy}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border/60 text-xs font-body uppercase tracking-wider hover:bg-accent disabled:opacity-50"
            >
              <BellOff className="w-3.5 h-3.5" />
              Turn off
            </button>
          ) : (
            <button
              type="button"
              onClick={handleEnable}
              disabled={busy || !email}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-foreground text-background text-xs font-body uppercase tracking-wider hover:opacity-90 disabled:opacity-50"
            >
              <Bell className="w-3.5 h-3.5" />
              {busy ? "Enabling…" : "Enable order updates"}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Compact card for the OrderConfirmation modal.
  return (
    <div className="rounded-md border border-border/40 bg-muted/20 p-3 space-y-2.5">
      <div className="flex items-start gap-2.5">
        <Bell className="w-4 h-4 mt-0.5 text-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-body text-xs text-foreground">
            {subscribed
              ? "You're all set for live order updates"
              : "Get live order updates"}
          </p>
          <p className="font-body text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
            {subscribed
              ? "We'll buzz this device on every status change — free."
              : "Free push notifications on every status change. No SMS charges, no inbox refreshes."}
          </p>
        </div>
        {!subscribed && (
          <button
            type="button"
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-foreground -mt-1"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {subscribed ? (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-body">
          <Check className="w-3 h-3 text-green-700" />
          Notifications enabled for {email}
        </div>
      ) : (
        <button
          type="button"
          onClick={handleEnable}
          disabled={busy || !email}
          className="w-full py-2 rounded-md bg-foreground text-background font-body text-[11px] uppercase tracking-wider hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {busy ? "Enabling…" : "Enable for free"}
        </button>
      )}
    </div>
  );
}
