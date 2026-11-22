// Per-topic opt-in toggles for order-status push notifications. The
// admin already gates each kind globally (see Admin → Notifications →
// Order Push), and the customer-side opt-in card next to this one
// handles "subscribe this device at all". This card is the *third*
// veto: once the device is subscribed and the kind is enabled
// site-wide, the shopper still gets to mute individual topics they
// don't care about (e.g. silence behind-the-scenes photos but keep
// shipping updates) without having to unsubscribe their device.
//
// Renders as three labelled groups so the long flat list of nine
// kinds doesn't read like a settings dump:
//
//   • Order updates   — confirmed / in_progress / out_for_delivery / received
//   • Refund updates  — refund_requested / refund_succeeded / refund_failed
//   • Behind the scenes — production_stage / production_photo
//
// The component fetches the current prefs from /api/push/prefs on mount,
// flips toggles optimistically, and reverts the local state if the
// server write fails.

import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  type OrderPushKind,
  type OrderPushKindPrefs,
  fetchOrderPushPrefs,
  getOrderPushState,
  updateOrderPushPrefs,
} from "@/lib/orderPush";

interface TopicRow {
  kind: OrderPushKind;
  label: string;
  description: string;
}

interface TopicGroup {
  title: string;
  rows: TopicRow[];
}

const TOPIC_GROUPS: TopicGroup[] = [
  {
    title: "Order updates",
    rows: [
      {
        kind: "confirmed",
        label: "Order confirmed",
        description: "Right after checkout — your order has landed with us.",
      },
      {
        kind: "in_progress",
        label: "In production",
        description: "The maker has started working on your product.",
      },
      {
        kind: "out_for_delivery",
        label: "On the way",
        description:
          "We've handed it off to the courier with a tracking number.",
      },
      {
        kind: "received",
        label: "Delivered",
        description: "Your product has arrived at your address.",
      },
    ],
  },
  {
    title: "Refunds",
    rows: [
      {
        kind: "refund_requested",
        label: "Refund requested",
        description: "We've logged your refund request.",
      },
      {
        kind: "refund_succeeded",
        label: "Refund completed",
        description: "Your refund has been processed.",
      },
      {
        kind: "refund_failed",
        label: "Refund needs attention",
        description: "Something blocked your refund — we'll reach out.",
      },
    ],
  },
  {
    title: "Behind the scenes",
    rows: [
      {
        kind: "production_stage",
        label: "Stage updates",
        description:
          "Cut, frame, paint, varnish, packed — the artist's checkpoint pings.",
      },
      {
        kind: "production_photo",
        label: "Progress photos",
        description:
          "A thumbnail in your tray every time the artist shares a snap.",
      },
    ],
  },
];

interface OrderPushTopicPrefsProps {
  /** The shopper's email — usually their authenticated session email. */
  email: string;
}

export default function OrderPushTopicPrefs({
  email,
}: OrderPushTopicPrefsProps) {
  const [prefs, setPrefs] = useState<OrderPushKindPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKind, setBusyKind] = useState<OrderPushKind | null>(null);
  // Whether *this* device is subscribed at all. Toggles only matter to
  // the shopper once they've granted permission and registered an
  // endpoint — before that the opt-in card is what they need to see, not
  // a wall of disabled switches. We re-poll on `pageshow` so the state
  // stays in sync after Notification permission flips elsewhere
  // (browser settings, mobile permissions screen).
  const [subscribed, setSubscribed] = useState(false);
  const [stateReady, setStateReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const state = await getOrderPushState();
      if (cancelled) return;
      setSubscribed(state.subscribed);
      setStateReady(true);
    };
    void sync();
    const onPageShow = () => void sync();
    if (typeof window !== "undefined") {
      window.addEventListener("pageshow", onPageShow);
    }
    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("pageshow", onPageShow);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!email || !subscribed) {
      setLoading(false);
      setPrefs(null);
      return;
    }
    setLoading(true);
    void fetchOrderPushPrefs(email).then((next) => {
      if (cancelled) return;
      setPrefs(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [email, subscribed]);

  // Suppress until we know the subscription state — otherwise the toggles
  // would flicker into view and back out for unsubscribed shoppers.
  if (!stateReady || !subscribed) return null;

  const handleToggle = async (kind: OrderPushKind, nextValue: boolean) => {
    if (!prefs || busyKind) return;
    // Optimistic update so the toggle feels instant; we revert below if
    // the server write fails. `prefs` is a flat record so a shallow
    // copy is enough.
    const previous = prefs[kind];
    const optimistic: OrderPushKindPrefs = { ...prefs, [kind]: nextValue };
    setPrefs(optimistic);
    setBusyKind(kind);
    const res = await updateOrderPushPrefs(email, { [kind]: nextValue });
    setBusyKind(null);
    if (!res.ok) {
      // Revert locally so the UI matches what the server still has.
      setPrefs((p) => (p ? { ...p, [kind]: previous } : p));
      toast.error("Couldn't save preference", {
        description: res.reason || "Please try again in a moment.",
      });
      return;
    }
    // The server returns the merged-on-defaults prefs; mirror them back
    // verbatim so any concurrent change another tab made stays visible.
    setPrefs(res.prefs);
  };

  return (
    <div className="rounded-md border border-border/40 bg-background/40 p-4 space-y-4">
      <div className="flex items-start gap-3">
        <Settings2 className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
        <div className="flex-1">
          <p className="font-body text-sm text-foreground">
            Notification topics
          </p>
          <p className="font-body text-xs text-muted-foreground mt-0.5">
            Mute the ones you don't want, keep the ones you do. We respect these
            for every device on this email.
          </p>
        </div>
      </div>
      {loading || !prefs ? (
        <p className="font-body text-xs text-muted-foreground italic pl-7">
          Loading your preferences…
        </p>
      ) : (
        <div className="space-y-4">
          {TOPIC_GROUPS.map((group) => (
            <div key={group.title} className="space-y-2">
              <p className="font-body text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {group.title}
              </p>
              <ul className="space-y-2.5">
                {group.rows.map((row) => {
                  const checked = prefs[row.kind] !== false;
                  const id = `push-pref-${row.kind}`;
                  return (
                    <li key={row.kind} className="flex items-start gap-3 py-1">
                      <div className="flex-1 min-w-0">
                        <label
                          htmlFor={id}
                          className="font-body text-xs text-foreground cursor-pointer"
                        >
                          {row.label}
                        </label>
                        <p className="font-body text-[11px] text-muted-foreground mt-0.5 leading-snug">
                          {row.description}
                        </p>
                      </div>
                      <Switch
                        id={id}
                        checked={checked}
                        onCheckedChange={(next) =>
                          void handleToggle(row.kind, next)
                        }
                        disabled={busyKind !== null}
                        aria-label={`${row.label} notifications`}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
