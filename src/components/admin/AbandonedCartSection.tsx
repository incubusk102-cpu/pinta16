import { useCallback, useEffect, useState } from "react";
import { Loader2, Mail, RefreshCw, Save, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getAdminToken } from "@/contexts/AdminAuthContext";

interface AbandonedCartConfig {
  enabled: boolean;
  nudge1Minutes: number;
  nudge2Minutes: number;
  nudge3Minutes: number;
  nudge1Subject: string;
  nudge2Subject: string;
  nudge3Subject: string;
  nudge1Heading: string;
  nudge2Heading: string;
  nudge3Heading: string;
  ctaLabel: string;
  ctaUrl: string;
}

interface AbandonedCartStats {
  total: number;
  pending: number;
  nudge1Sent: number;
  nudge2Sent: number;
  nudge3Sent: number;
  converted: number;
  unsubscribed: number;
  recoveredRevenue: number;
}

const DEFAULTS: AbandonedCartConfig = {
  enabled: true,
  nudge1Minutes: 60,
  nudge2Minutes: 1440,
  nudge3Minutes: 4320,
  nudge1Subject: "You left something behind at Canvas Hub",
  nudge2Subject: "Still thinking about it? Your cart is waiting",
  nudge3Subject: "Last chance \u2014 your cart at Canvas Hub",
  nudge1Heading: "Your cart is waiting",
  nudge2Heading: "Don\u2019t miss out on your picks",
  nudge3Heading: "Final reminder",
  ctaLabel: "Complete your order",
  ctaUrl: "",
};

const peso = (n: number) =>
  `\u20b1${(Number.isFinite(n) ? n : 0).toLocaleString("en-PH", {
    maximumFractionDigits: 2,
  })}`;

const formatMinutes = (m: number) => {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const remainder = m % 60;
  if (remainder === 0) {
    if (h === 1) return "1 hour";
    if (h % 24 === 0) {
      const days = h / 24;
      return days === 1 ? "1 day" : `${days} days`;
    }
    return `${h} hours`;
  }
  return `${h}h ${remainder}m`;
};

async function fetchConfig(): Promise<AbandonedCartConfig> {
  const token = getAdminToken();
  if (!token) throw new Error("Sign in again");
  const res = await fetch("/api/storefront-config?admin=1", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to load config");
  const data = (await res.json()) as {
    config: { abandonedCart?: AbandonedCartConfig };
  };
  return { ...DEFAULTS, ...data.config.abandonedCart };
}

async function saveConfig(
  cfg: AbandonedCartConfig,
): Promise<AbandonedCartConfig> {
  const token = getAdminToken();
  if (!token) throw new Error("Sign in again");
  const res = await fetch("/api/storefront-config", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: "update-abandoned-cart",
      abandonedCart: cfg,
    }),
  });
  if (!res.ok) throw new Error("Failed to save");
  const data = (await res.json()) as {
    config: { abandonedCart?: AbandonedCartConfig };
  };
  return { ...DEFAULTS, ...data.config.abandonedCart };
}

async function fetchStats(): Promise<AbandonedCartStats | null> {
  const token = getAdminToken();
  if (!token) return null;
  try {
    const res = await fetch("/api/abandoned-cart/stats", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 503) return null;
    if (!res.ok) return null;
    return (await res.json()) as AbandonedCartStats;
  } catch {
    return null;
  }
}

export function AbandonedCartSection() {
  const [cfg, setCfg] = useState<AbandonedCartConfig>(DEFAULTS);
  const [stats, setStats] = useState<AbandonedCartStats | null>(null);
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
      toast.success("Abandoned-cart settings saved");
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

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-8">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading abandoned-cart settings…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-primary" />
          <h2 className="font-display text-lg">Cart Recovery</h2>
        </div>
        <div className="flex items-center gap-3">
          <Label htmlFor="ac-enabled" className="text-sm">
            {cfg.enabled ? "Active" : "Paused"}
          </Label>
          <Switch
            id="ac-enabled"
            checked={cfg.enabled}
            onCheckedChange={(v) => setCfg((p) => ({ ...p, enabled: v }))}
          />
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Automatically send recovery emails when shoppers abandon their cart at
        checkout. The cron runs every 30 min — no manual trigger needed.
      </p>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {(
            [
              ["Pending", String(stats.pending)],
              ["Nudge 1 sent", String(stats.nudge1Sent)],
              ["Nudge 2 sent", String(stats.nudge2Sent)],
              ["Nudge 3 sent", String(stats.nudge3Sent ?? 0)],
              ["Converted", String(stats.converted)],
              ["Recovered revenue", peso(Number(stats.recoveredRevenue) || 0)],
              ["Unsubscribed", String(stats.unsubscribed)],
              ["Total (7d)", String(stats.total)],
            ] as [string, string][]
          ).map(([label, value]) => (
            <div
              key={label}
              className="bg-card/60 border border-border/50 rounded-lg p-3 text-center"
            >
              <div className="text-xl font-semibold tabular-nums">{value}</div>
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider mt-0.5">
                {label}
              </div>
            </div>
          ))}
        </div>
      )}

      {stats && (
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
      )}

      {!stats && (
        <p className="text-xs text-muted-foreground italic">
          Stats unavailable — the ABANDONED_CARTS KV namespace may not be bound
          yet.
        </p>
      )}

      <div className="space-y-4 border-t border-border/50 pt-4">
        <h3 className="text-sm font-medium flex items-center gap-1.5">
          <Mail className="w-4 h-4" /> Timing
        </h3>
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="ac-nudge1">
              First reminder after ({formatMinutes(cfg.nudge1Minutes)})
            </Label>
            <Input
              id="ac-nudge1"
              type="number"
              min={15}
              max={10080}
              value={cfg.nudge1Minutes}
              onChange={(e) =>
                setCfg((p) => ({
                  ...p,
                  nudge1Minutes: Math.max(15, Number(e.target.value) || 60),
                }))
              }
              className="mt-1"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Minutes after cart abandonment (min 15, max 10 080 = 7 days)
            </p>
          </div>
          <div>
            <Label htmlFor="ac-nudge2">
              Second reminder after ({formatMinutes(cfg.nudge2Minutes)})
            </Label>
            <Input
              id="ac-nudge2"
              type="number"
              min={60}
              max={10080}
              value={cfg.nudge2Minutes}
              onChange={(e) =>
                setCfg((p) => ({
                  ...p,
                  nudge2Minutes: Math.max(60, Number(e.target.value) || 1440),
                }))
              }
              className="mt-1"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Minutes after cart abandonment (min 60, max 10 080 = 7 days)
            </p>
          </div>
          <div>
            <Label htmlFor="ac-nudge3">
              Last-chance reminder after ({formatMinutes(cfg.nudge3Minutes)})
            </Label>
            <Input
              id="ac-nudge3"
              type="number"
              min={60}
              max={10080}
              value={cfg.nudge3Minutes}
              onChange={(e) =>
                setCfg((p) => ({
                  ...p,
                  nudge3Minutes: Math.max(60, Number(e.target.value) || 4320),
                }))
              }
              className="mt-1"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Minutes after cart abandonment (min 60, max 10 080 = 7 days)
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 border-t border-border/50 pt-4">
        <h3 className="text-sm font-medium">Email copy</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="ac-subj1">Nudge 1 — subject line</Label>
            <Input
              id="ac-subj1"
              value={cfg.nudge1Subject}
              maxLength={200}
              onChange={(e) =>
                setCfg((p) => ({ ...p, nudge1Subject: e.target.value }))
              }
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="ac-subj2">Nudge 2 — subject line</Label>
            <Input
              id="ac-subj2"
              value={cfg.nudge2Subject}
              maxLength={200}
              onChange={(e) =>
                setCfg((p) => ({ ...p, nudge2Subject: e.target.value }))
              }
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="ac-head1">Nudge 1 — email heading</Label>
            <Input
              id="ac-head1"
              value={cfg.nudge1Heading}
              maxLength={100}
              onChange={(e) =>
                setCfg((p) => ({ ...p, nudge1Heading: e.target.value }))
              }
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="ac-head2">Nudge 2 — email heading</Label>
            <Input
              id="ac-head2"
              value={cfg.nudge2Heading}
              maxLength={100}
              onChange={(e) =>
                setCfg((p) => ({ ...p, nudge2Heading: e.target.value }))
              }
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="ac-subj3">
              Nudge 3 (last chance) — subject line
            </Label>
            <Input
              id="ac-subj3"
              value={cfg.nudge3Subject}
              maxLength={200}
              onChange={(e) =>
                setCfg((p) => ({ ...p, nudge3Subject: e.target.value }))
              }
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="ac-head3">
              Nudge 3 (last chance) — email heading
            </Label>
            <Input
              id="ac-head3"
              value={cfg.nudge3Heading}
              maxLength={100}
              onChange={(e) =>
                setCfg((p) => ({ ...p, nudge3Heading: e.target.value }))
              }
              className="mt-1"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4 border-t border-border/50 pt-4">
        <h3 className="text-sm font-medium">Call-to-action button</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="ac-cta-label">Button label</Label>
            <Input
              id="ac-cta-label"
              value={cfg.ctaLabel}
              maxLength={60}
              onChange={(e) =>
                setCfg((p) => ({ ...p, ctaLabel: e.target.value }))
              }
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="ac-cta-url">Button URL (blank = homepage)</Label>
            <Input
              id="ac-cta-url"
              value={cfg.ctaUrl}
              maxLength={500}
              placeholder="https://canvhub.com"
              onChange={(e) =>
                setCfg((p) => ({ ...p, ctaUrl: e.target.value }))
              }
              className="mt-1"
            />
          </div>
        </div>
      </div>

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
