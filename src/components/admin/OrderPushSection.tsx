// Admin section for the free Web Push order-status notification channel.
// Mirrors OrderEmailSection's structure (master toggle + per-kind cards
// with enable/title/body) but stays intentionally lighter — push is just
// title + body, no HTML chrome, no banner.
//
// Config schema (functions/api/_lib/push.js):
//   {
//     enabled: boolean,
//     kinds: {
//       confirmed:        { enabled, title, body },
//       in_progress:      { enabled, title, body },
//       out_for_delivery: { enabled, title, body },
//       received:         { enabled, title, body },
//       refund_requested: { enabled, title, body },
//       refund_succeeded: { enabled, title, body },
//       refund_failed:    { enabled, title, body },
//     },
//   }
//
// Server endpoints used:
//   GET  /api/storefront-config?admin=1               read current config
//   POST /api/storefront-config { action: "update-order-push", orderPush }
//   POST /api/push/test         { email, kind, name } send a test push

import { useEffect, useMemo, useState } from "react";
import { Bell, Loader2, RotateCcw, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

type OrderPushKind =
  | "confirmed"
  | "in_progress"
  | "out_for_delivery"
  | "received"
  | "refund_requested"
  | "refund_succeeded"
  | "refund_failed";

const KINDS: { value: OrderPushKind; label: string; hint: string }[] = [
  {
    value: "confirmed",
    label: "Confirmed",
    hint: "Fires the moment the customer pays.",
  },
  {
    value: "in_progress",
    label: "In progress",
    hint: "Fires when the artist marks work as started.",
  },
  {
    value: "out_for_delivery",
    label: "Out for delivery",
    hint: "Fires when the order is shipped or marked out for delivery.",
  },
  {
    value: "received",
    label: "Received",
    hint: "Fires when the customer (or admin) marks the order received.",
  },
  {
    value: "refund_requested",
    label: "Refund requested",
    hint: "Fires the moment a refund is initiated.",
  },
  {
    value: "refund_succeeded",
    label: "Refund completed",
    hint: "Fires when the gateway confirms the refund landed.",
  },
  {
    value: "refund_failed",
    label: "Refund failed",
    hint: "Fires when the gateway rejects the refund. Customer support follow-up signal.",
  },
];

interface PushKindConfig {
  enabled: boolean;
  title: string;
  body: string;
}

interface PushConfig {
  enabled: boolean;
  kinds: Record<OrderPushKind, PushKindConfig>;
}

const DEFAULT_KINDS: Record<OrderPushKind, PushKindConfig> = {
  confirmed: {
    enabled: true,
    title: "Order {{orderId}} confirmed",
    body: "Hi {{name}}, your Canvas Hub order is confirmed. We'll let you know when it's on the way.",
  },
  in_progress: {
    enabled: true,
    title: "Your order is in progress",
    body: "The maker has started working on order {{orderId}}. You'll get another nudge when it ships.",
  },
  out_for_delivery: {
    enabled: true,
    title: "Order {{orderId}} is on the way",
    body: "{{courier}} has your order. Track it anytime from your Canvas Hub account.",
  },
  received: {
    enabled: true,
    title: "Order {{orderId}} delivered",
    body: "Welcome home. We'd love a quick review when you've had a chance to live with it.",
  },
  refund_requested: {
    enabled: true,
    title: "Refund request received",
    body: "We've logged your refund for order {{orderId}}. We'll update you once it's processed.",
  },
  refund_succeeded: {
    enabled: true,
    title: "Refund completed",
    body: "Refund of ₱{{refundAmount}} for order {{orderId}} has landed. Allow up to 5 business days for posting.",
  },
  refund_failed: {
    enabled: true,
    title: "Refund needs attention",
    body: "Your refund for order {{orderId}} could not be completed: {{failureMessage}}. We'll reach out.",
  },
};

const DEFAULT_PUSH: PushConfig = {
  enabled: true,
  kinds: { ...DEFAULT_KINDS },
};

const mergePushConfig = (raw: unknown): PushConfig => {
  const base: PushConfig = {
    enabled: DEFAULT_PUSH.enabled,
    kinds: { ...DEFAULT_KINDS },
  };
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  base.enabled = r.enabled !== false;
  if (r.kinds && typeof r.kinds === "object") {
    const kindsRaw = r.kinds as Record<string, unknown>;
    for (const k of KINDS.map((x) => x.value)) {
      const v = kindsRaw[k] as Partial<PushKindConfig> | undefined;
      if (v && typeof v === "object") {
        base.kinds[k] = {
          enabled: v.enabled !== false,
          title:
            typeof v.title === "string" && v.title.trim()
              ? v.title.trim().slice(0, 80)
              : DEFAULT_KINDS[k].title,
          body:
            typeof v.body === "string" && v.body.trim()
              ? v.body.trim().slice(0, 240)
              : DEFAULT_KINDS[k].body,
        };
      }
    }
  }
  return base;
};

export const OrderPushSection = () => {
  const { token } = useAdminAuth();
  const [config, setConfig] = useState<PushConfig>(DEFAULT_PUSH);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testKind, setTestKind] = useState<OrderPushKind>("confirmed");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/storefront-config?admin=1", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json().catch(() => ({}))) as {
          config?: { orderPush?: unknown };
        };
        if (cancelled) return;
        setConfig(mergePushConfig(data?.config?.orderPush));
      } catch (e) {
        if (cancelled) return;
        toast.error(
          e instanceof Error
            ? `Could not load order push config: ${e.message}`
            : "Could not load order push config",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const updateMaster = (enabled: boolean) =>
    setConfig((c) => ({ ...c, enabled }));

  const updateKind = (kind: OrderPushKind, patch: Partial<PushKindConfig>) =>
    setConfig((c) => ({
      ...c,
      kinds: { ...c.kinds, [kind]: { ...c.kinds[kind], ...patch } },
    }));

  const resetKindToDefault = (kind: OrderPushKind) =>
    updateKind(kind, { ...DEFAULT_KINDS[kind] });

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/storefront-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: "update-order-push",
          orderPush: config,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      toast.success("Order push notifications saved");
    } catch (e) {
      toast.error(
        e instanceof Error
          ? `Save failed: ${e.message}`
          : "Save failed — check the browser console.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (testing) return;
    const email = testEmail.trim();
    if (!email || !email.includes("@")) {
      toast.error("Enter a valid email that has opted in for push on a device");
      return;
    }
    setTesting(true);
    try {
      const res = await fetch("/api/push/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ email, kind: testKind }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        result?: {
          delivered?: boolean;
          reason?: string;
          attempted?: number;
          successful?: number;
        };
      };
      if (data.ok && data.result?.delivered) {
        const successful = data.result.successful ?? 0;
        const attempted = data.result.attempted ?? 0;
        toast.success(
          `Push delivered to ${successful}/${attempted} device(s) for ${email}`,
        );
      } else {
        toast.error(
          `Test push not delivered: ${data.result?.reason || "see Cloudflare logs"}`,
        );
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? `Test failed: ${e.message}` : "Test failed",
      );
    } finally {
      setTesting(false);
    }
  };

  const placeholderHint = useMemo(
    () =>
      "Available placeholders: {{name}}, {{orderId}}, {{trackingNumber}}, {{courier}}, {{trackingUrl}}, {{refundAmount}}, {{failureMessage}}",
    [],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading push notification config…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5" />
          <h2 className="text-lg font-display font-semibold">
            Order push notifications
          </h2>
        </div>
        <p className="text-xs text-muted-foreground max-w-prose">
          Free Web Push notifications fire alongside order emails on every
          status change. Customers opt in from the order confirmation modal. Set{" "}
          <code>VAPID_PUBLIC_KEY</code>, <code>VAPID_PRIVATE_KEY</code> and{" "}
          <code>VAPID_SUBJECT</code> in Cloudflare Pages → Settings →
          Environment Variables for delivery to work.
        </p>
      </header>

      <div className="rounded-md border border-border/40 bg-muted/20 p-4 flex items-center justify-between gap-4">
        <div className="space-y-1">
          <Label className="text-sm">Master switch</Label>
          <p className="text-xs text-muted-foreground">
            When off, no push notifications fire on any status change. Per-kind
            toggles still apply when this is on.
          </p>
        </div>
        <Switch checked={config.enabled} onCheckedChange={updateMaster} />
      </div>

      <div className="rounded-md border border-border/40 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4" />
          <Label className="text-sm">Send a test push</Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Sends a real push to every device an email has opted in on. The
          customer must have already enabled push from a checkout completion on
          this site.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input
            placeholder="email@example.com"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            type="email"
          />
          <select
            className="border border-input bg-background rounded-md px-3 py-2 text-sm"
            value={testKind}
            onChange={(e) => setTestKind(e.target.value as OrderPushKind)}
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <Button onClick={handleTest} disabled={testing} variant="outline">
            {testing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Send test
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">{placeholderHint}</p>
        {KINDS.map((k) => {
          const kc = config.kinds[k.value];
          return (
            <div
              key={k.value}
              className="rounded-md border border-border/40 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{k.label}</p>
                  <p className="text-xs text-muted-foreground">{k.hint}</p>
                </div>
                <Switch
                  checked={kc.enabled}
                  onCheckedChange={(v) => updateKind(k.value, { enabled: v })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider">
                  Title
                </Label>
                <Input
                  value={kc.title}
                  onChange={(e) =>
                    updateKind(k.value, {
                      title: e.target.value.slice(0, 80),
                    })
                  }
                  maxLength={80}
                  placeholder={DEFAULT_KINDS[k.value].title}
                />
                <p className="text-[10px] text-muted-foreground">
                  {kc.title.length}/80 characters
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider">Body</Label>
                <Textarea
                  value={kc.body}
                  rows={2}
                  onChange={(e) =>
                    updateKind(k.value, {
                      body: e.target.value.slice(0, 240),
                    })
                  }
                  maxLength={240}
                  placeholder={DEFAULT_KINDS[k.value].body}
                />
                <p className="text-[10px] text-muted-foreground">
                  {kc.body.length}/240 characters
                </p>
              </div>
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => resetKindToDefault(k.value)}
                  type="button"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset to default
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm py-3 border-t border-border/30">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save push notifications
        </Button>
      </div>
    </div>
  );
};

export default OrderPushSection;
