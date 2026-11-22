import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  Cake,
  Eye,
  Gift,
  Loader2,
  Mail,
  RefreshCw,
  Save,
  Star,
  Tag,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getAdminToken } from "@/contexts/AdminAuthContext";

interface TriggerBlock {
  enabled: boolean;
  delayDays?: number;
  subject: string;
  heading: string;
}

interface MarketingTriggersConfig {
  reviewFollowUp: TriggerBlock;
  winback: TriggerBlock;
  backInStock: TriggerBlock;
  priceDrop: TriggerBlock;
  birthday: TriggerBlock;
  browseAbandonment: TriggerBlock;
  postPurchaseUpsell: TriggerBlock;
}

interface TriggerStats {
  sent: Record<string, number>;
  optedOut: number;
  notifyMe: { products: number; registrations: number };
}

const DEFAULTS: MarketingTriggersConfig = {
  reviewFollowUp: {
    enabled: true,
    delayDays: 3,
    subject: "How are you enjoying your order?",
    heading: "We\u2019d love your feedback",
  },
  winback: {
    enabled: true,
    delayDays: 60,
    subject: "We miss you at Canvas Hub",
    heading: "It\u2019s been a while",
  },
  backInStock: {
    enabled: true,
    subject: "Good news \u2014 {{title}} is back!",
    heading: "Back in stock",
  },
  priceDrop: {
    enabled: true,
    subject: "Price drop: {{title}} is now {{price}}",
    heading: "New sale alert",
  },
  birthday: {
    enabled: true,
    subject: "Happy birthday \u2014 a gift from Canvas Hub",
    heading: "Happy birthday!",
  },
  browseAbandonment: {
    enabled: true,
    delayDays: 3,
    subject: "Still thinking it over?",
    heading: "The piece you saved",
  },
  postPurchaseUpsell: {
    enabled: true,
    delayDays: 14,
    subject: "You might also love these",
    heading: "Curated for your collection",
  },
};

async function fetchConfig(): Promise<MarketingTriggersConfig> {
  const token = getAdminToken();
  if (!token) throw new Error("Sign in again");
  const res = await fetch("/api/storefront-config?admin=1", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to load config");
  const data = (await res.json()) as {
    config: { marketingTriggers?: MarketingTriggersConfig };
  };
  const mt = data.config.marketingTriggers;
  return {
    reviewFollowUp: { ...DEFAULTS.reviewFollowUp, ...mt?.reviewFollowUp },
    winback: { ...DEFAULTS.winback, ...mt?.winback },
    backInStock: { ...DEFAULTS.backInStock, ...mt?.backInStock },
    priceDrop: { ...DEFAULTS.priceDrop, ...mt?.priceDrop },
    birthday: { ...DEFAULTS.birthday, ...mt?.birthday },
    browseAbandonment: {
      ...DEFAULTS.browseAbandonment,
      ...mt?.browseAbandonment,
    },
    postPurchaseUpsell: {
      ...DEFAULTS.postPurchaseUpsell,
      ...mt?.postPurchaseUpsell,
    },
  };
}

async function saveConfig(
  cfg: MarketingTriggersConfig,
): Promise<MarketingTriggersConfig> {
  const token = getAdminToken();
  if (!token) throw new Error("Sign in again");
  const res = await fetch("/api/storefront-config", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: "update-marketing-triggers",
      marketingTriggers: cfg,
    }),
  });
  if (!res.ok) throw new Error("Failed to save");
  const data = (await res.json()) as {
    config: { marketingTriggers?: MarketingTriggersConfig };
  };
  const mt = data.config.marketingTriggers;
  return {
    reviewFollowUp: { ...DEFAULTS.reviewFollowUp, ...mt?.reviewFollowUp },
    winback: { ...DEFAULTS.winback, ...mt?.winback },
    backInStock: { ...DEFAULTS.backInStock, ...mt?.backInStock },
    priceDrop: { ...DEFAULTS.priceDrop, ...mt?.priceDrop },
    birthday: { ...DEFAULTS.birthday, ...mt?.birthday },
    browseAbandonment: {
      ...DEFAULTS.browseAbandonment,
      ...mt?.browseAbandonment,
    },
    postPurchaseUpsell: {
      ...DEFAULTS.postPurchaseUpsell,
      ...mt?.postPurchaseUpsell,
    },
  };
}

async function fetchStats(): Promise<TriggerStats | null> {
  const token = getAdminToken();
  if (!token) return null;
  try {
    const res = await fetch("/api/marketing-triggers/stats", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as TriggerStats;
  } catch {
    return null;
  }
}

const TRIGGER_META: {
  key: keyof MarketingTriggersConfig;
  label: string;
  icon: typeof Star;
  hint: string;
  hasDelay: boolean;
  delayLabel?: string;
  subjectHint?: string;
}[] = [
  {
    key: "reviewFollowUp",
    label: "Review follow-up",
    icon: Star,
    hint: "Email customers X days after delivery if they haven\u2019t left a review yet.",
    hasDelay: true,
    delayLabel: "Days after delivery",
  },
  {
    key: "winback",
    label: "Win-back / re-engagement",
    icon: UserCheck,
    hint: "Re-engage customers who haven\u2019t ordered in a while.",
    hasDelay: true,
    delayLabel: "Days since last order",
  },
  {
    key: "backInStock",
    label: "Back-in-stock",
    icon: Bell,
    hint: "Notify customers who registered interest when a product becomes available again. Use {{title}} in the subject.",
    hasDelay: false,
    subjectHint: "Supports {{title}}",
  },
  {
    key: "priceDrop",
    label: "Price-drop alert",
    icon: Tag,
    hint: "Email newsletter subscribers when a product\u2019s price drops. Use {{title}} and {{price}} in the subject.",
    hasDelay: false,
    subjectHint: "Supports {{title}}, {{price}}",
  },
  {
    key: "birthday",
    label: "Birthday gift",
    icon: Cake,
    hint: "Email signed-in customers on their birthday with a personal BDAY-XXX promo code. One email per customer per year.",
    hasDelay: false,
  },
  {
    key: "browseAbandonment",
    label: "Browse abandonment",
    icon: Eye,
    hint: "Reach out to customers who saved an item to their wishlist X days ago but never purchased it.",
    hasDelay: true,
    delayLabel: "Days since wishlist add",
  },
  {
    key: "postPurchaseUpsell",
    label: "Post-purchase upsell",
    icon: Gift,
    hint: "Suggest three curated products X days after an order is marked received \u2014 prefers the same category as the customer\u2019s purchase.",
    hasDelay: true,
    delayLabel: "Days after delivery",
  },
];

export function MarketingTriggersSection() {
  const [cfg, setCfg] = useState<MarketingTriggersConfig>(DEFAULTS);
  const [stats, setStats] = useState<TriggerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshingStats, setRefreshingStats] = useState(false);

  const load = useCallback(async () => {
    try {
      const [config, st] = await Promise.all([fetchConfig(), fetchStats()]);
      setCfg(config);
      setStats(st);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not load settings",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveConfig(cfg);
      setCfg(saved);
      toast.success("Marketing trigger settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshStats = async () => {
    setRefreshingStats(true);
    try {
      const st = await fetchStats();
      setStats(st);
    } catch {
      // silently fail
    } finally {
      setRefreshingStats(false);
    }
  };

  const updateBlock = (
    key: keyof MarketingTriggersConfig,
    patch: Partial<TriggerBlock>,
  ) => {
    setCfg((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-8">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading marketing trigger settings…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Mail className="w-5 h-5 text-primary" />
        <h2 className="font-display text-lg">Marketing Triggers</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        Automatic email triggers that run every 6 hours. All are enabled by
        default with sensible timing — customize below or toggle off any you
        don&apos;t need.
      </p>

      {stats && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {(
              [
                ["Reviews sent", stats.sent.reviewFollowUp || 0],
                ["Winbacks sent", stats.sent.winback || 0],
                ["Back-in-stock", stats.sent.backInStock || 0],
                ["Price drops", stats.sent.priceDrop || 0],
                ["Birthday gifts", stats.sent.birthday || 0],
                ["Browse nudges", stats.sent.browseAbandonment || 0],
                ["Upsells sent", stats.sent.postPurchaseUpsell || 0],
                ["Opted out", stats.optedOut],
                ["Notify-me regs", stats.notifyMe.registrations],
              ] as [string, number][]
            ).map(([label, value]) => (
              <div
                key={label}
                className="bg-card/60 border border-border/50 rounded-lg p-3 text-center"
              >
                <div className="text-xl font-semibold tabular-nums">
                  {value}
                </div>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider mt-0.5">
                  {label}
                </div>
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleRefreshStats()}
            disabled={refreshingStats}
          >
            <RefreshCw
              className={`w-3.5 h-3.5 mr-1.5 ${refreshingStats ? "animate-spin" : ""}`}
            />
            Refresh stats
          </Button>
        </>
      )}

      {TRIGGER_META.map((meta) => {
        const block = cfg[meta.key];
        const Icon = meta.icon;
        return (
          <div
            key={meta.key}
            className="space-y-3 border-t border-border/50 pt-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium">{meta.label}</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {block.enabled ? "Active" : "Paused"}
                </span>
                <Switch
                  checked={block.enabled}
                  onCheckedChange={(v) => updateBlock(meta.key, { enabled: v })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{meta.hint}</p>
            <div className="grid sm:grid-cols-2 gap-4">
              {meta.hasDelay && (
                <div>
                  <Label>{meta.delayLabel}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={180}
                    value={block.delayDays ?? 3}
                    onChange={(e) =>
                      updateBlock(meta.key, {
                        delayDays: Math.max(1, Number(e.target.value) || 3),
                      })
                    }
                    className="mt-1"
                  />
                </div>
              )}
              <div>
                <Label>
                  Subject line
                  {meta.subjectHint && (
                    <span className="ml-1 text-[10px] text-muted-foreground font-normal">
                      ({meta.subjectHint})
                    </span>
                  )}
                </Label>
                <Input
                  value={block.subject}
                  maxLength={200}
                  onChange={(e) =>
                    updateBlock(meta.key, { subject: e.target.value })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Email heading</Label>
                <Input
                  value={block.heading}
                  maxLength={100}
                  onChange={(e) =>
                    updateBlock(meta.key, { heading: e.target.value })
                  }
                  className="mt-1"
                />
              </div>
            </div>
          </div>
        );
      })}

      <div className="flex justify-end pt-2">
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? (
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-1.5" />
          )}
          Save settings
        </Button>
      </div>
    </div>
  );
}
