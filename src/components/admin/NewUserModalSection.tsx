import { useEffect, useState } from "react";
import {
  Eye,
  Loader2,
  MousePointerClick,
  Save,
  Sparkles,
  ScrollText,
  Timer,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { PREVIEW_EVENT } from "@/components/NewUserModal";
import { NewUserModalAnalyticsPanel } from "@/components/admin/NewUserModalAnalyticsPanel";
import {
  DEFAULT_NEW_USER_MODAL,
  DEFAULT_NEW_USER_MODAL_VARIANT_B,
  useStorefrontConfig,
  type NewUserModalConfig,
} from "@/contexts/StorefrontConfigContext";

interface AdminPromoSummary {
  code: string;
  type?: string;
  value?: number;
  description?: string;
  enabled?: boolean;
}

const formatPromoLabel = (p: AdminPromoSummary) => {
  const value =
    p.type === "percent"
      ? `${p.value ?? 0}% off`
      : p.type === "free_shipping"
        ? "free shipping"
        : `₱${p.value ?? 0} off`;
  const status = p.enabled === false ? " (disabled)" : "";
  return `${p.code} — ${value}${status}`;
};

const NONE_VALUE = "__none__";

export function NewUserModalSection() {
  const { token } = useAdminAuth();
  const { refresh } = useStorefrontConfig();
  const [cfg, setCfg] = useState<NewUserModalConfig>(DEFAULT_NEW_USER_MODAL);
  const [promos, setPromos] = useState<AdminPromoSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingWelcome, setCreatingWelcome] = useState(false);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/storefront-config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      config?: {
        newUserModal?: NewUserModalConfig;
        promoCodes?: AdminPromoSummary[];
      };
      error?: string;
      created?: boolean;
    };
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    if (data.config?.newUserModal) {
      setCfg(data.config.newUserModal);
    }
    if (Array.isArray(data.config?.promoCodes)) {
      setPromos(data.config.promoCodes);
    }
    // Await so the modal's StorefrontConfigContext sees the new
    // voucher / triggers / copy before "Save & preview" pops it open.
    await refresh();
    return data;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/storefront-config?admin=1", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as {
          config?: {
            newUserModal?: NewUserModalConfig;
            promoCodes?: AdminPromoSummary[];
          };
        };
        if (cancelled) return;
        if (data.config?.newUserModal) {
          setCfg({ ...DEFAULT_NEW_USER_MODAL, ...data.config.newUserModal });
        }
        if (Array.isArray(data.config?.promoCodes)) {
          setPromos(data.config.promoCodes);
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(
            e instanceof Error
              ? e.message
              : "Could not load new-user modal config",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await post({ action: "update-newuser-modal", newUserModal: cfg });
      toast.success("New-user modal saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = (variant?: "a" | "b") => {
    // Persist whatever the admin has tweaked locally before showing the
    // preview — otherwise the modal renders against the last-saved
    // config and the admin's unsaved copy / voucher / toggles wouldn't
    // be visible. Done as a non-blocking save: the toast confirms it.
    handleSave().then(() => {
      window.dispatchEvent(
        new CustomEvent(PREVIEW_EVENT, {
          detail: variant ? { variant } : undefined,
        }),
      );
    });
  };

  const handleAutoCreateWelcome10 = async () => {
    setCreatingWelcome(true);
    try {
      const data = await post({ action: "auto-create-welcome10" });
      toast.success(
        data.created
          ? "Created WELCOME10 (10% off, no min spend)"
          : "WELCOME10 already exists — attached to the modal",
      );
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not create WELCOME10",
      );
    } finally {
      setCreatingWelcome(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading new-user modal…
      </div>
    );
  }

  const hasWelcome10 = promos.some((p) => p.code === "WELCOME10");

  return (
    <div className="space-y-8 max-w-3xl">
      <header className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-md bg-card/40 border border-border/60 flex items-center justify-center shrink-0">
          <UserPlus className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-xl">New-user modal</h2>
          <p className="text-sm text-muted-foreground">
            One-time welcome dialog for first-time visitors. Uses Google sign-in
            and (optionally) a promo voucher to convert anonymous browsers.
          </p>
        </div>
      </header>

      <section className="rounded-md border border-border/60 bg-card/30 p-4 sm:p-5 space-y-4">
        <label className="flex items-center justify-between gap-3 p-3 bg-background/30 border border-border/40 rounded-md">
          <div>
            <p className="text-sm font-medium">Show new-user modal</p>
            <p className="text-xs text-muted-foreground">
              Master switch — disables all triggers when off.
            </p>
          </div>
          <Switch
            checked={cfg.enabled}
            onCheckedChange={(v) => setCfg((c) => ({ ...c, enabled: v }))}
          />
        </label>
      </section>

      <section className="rounded-md border border-border/60 bg-card/30 p-4 sm:p-5 space-y-4">
        <div>
          <h3 className="font-display text-base">Triggers</h3>
          <p className="text-xs text-muted-foreground mt-1">
            All three are on by default. Mute any individually if you only want
            one trigger active.
          </p>
        </div>

        <TriggerToggle
          icon={<Timer className="w-4 h-4" />}
          label="Time on page"
          description={`Open after ${cfg.timeSeconds}s on the site.`}
          checked={cfg.triggers.time}
          onChange={(v) =>
            setCfg((c) => ({ ...c, triggers: { ...c.triggers, time: v } }))
          }
        >
          <div className="flex items-center gap-2 pt-1">
            <Label className="text-xs text-muted-foreground">Seconds</Label>
            <Input
              type="number"
              min={1}
              max={120}
              value={cfg.timeSeconds}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  timeSeconds: Number(e.target.value) || 0,
                }))
              }
              className="w-24 h-8 text-xs"
              disabled={!cfg.triggers.time}
            />
          </div>
        </TriggerToggle>

        <TriggerToggle
          icon={<ScrollText className="w-4 h-4" />}
          label="Scroll depth"
          description={`Open once visitor scrolls past ${cfg.scrollPercent}% of the page.`}
          checked={cfg.triggers.scroll}
          onChange={(v) =>
            setCfg((c) => ({
              ...c,
              triggers: { ...c.triggers, scroll: v },
            }))
          }
        >
          <div className="flex items-center gap-2 pt-1">
            <Label className="text-xs text-muted-foreground">Percent</Label>
            <Input
              type="number"
              min={5}
              max={95}
              value={cfg.scrollPercent}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  scrollPercent: Number(e.target.value) || 0,
                }))
              }
              className="w-24 h-8 text-xs"
              disabled={!cfg.triggers.scroll}
            />
          </div>
        </TriggerToggle>

        <TriggerToggle
          icon={<MousePointerClick className="w-4 h-4" />}
          label="Exit intent"
          description="Open when the cursor leaves the top of the viewport."
          checked={cfg.triggers.exitIntent}
          onChange={(v) =>
            setCfg((c) => ({
              ...c,
              triggers: { ...c.triggers, exitIntent: v },
            }))
          }
        />
      </section>

      <section className="rounded-md border border-border/60 bg-card/30 p-4 sm:p-5 space-y-4">
        <div>
          <h3 className="font-display text-base">Voucher</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Attach an existing Marketing promo, or auto-create a 10% welcome
            code in one click.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Promo code</Label>
          <Select
            value={cfg.voucherCode || NONE_VALUE}
            onValueChange={(v) =>
              setCfg((c) => ({
                ...c,
                voucherCode: v === NONE_VALUE ? "" : v,
              }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="None — show no code" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>None — show no code</SelectItem>
              {promos.length === 0 ? (
                <SelectItem value="__no_promos" disabled>
                  No promos configured yet
                </SelectItem>
              ) : (
                promos.map((p) => (
                  <SelectItem key={p.code} value={p.code}>
                    {formatPromoLabel(p)}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Manage promo codes in Storefront → Promo codes.
          </p>
        </div>

        <div className="flex items-center gap-3 pt-2 border-t border-border/40">
          <Button
            type="button"
            variant="outline"
            onClick={handleAutoCreateWelcome10}
            disabled={creatingWelcome}
          >
            {creatingWelcome ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            {hasWelcome10 ? "Re-attach WELCOME10" : "Auto-create WELCOME10"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Creates WELCOME10 (10% off, no min spend) if it doesn't exist and
            attaches it to the modal.
          </p>
        </div>
      </section>

      <section className="rounded-md border border-border/60 bg-card/30 p-4 sm:p-5 space-y-4">
        <div>
          <h3 className="font-display text-base">Email capture</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Off by default so launching the modal doesn't accidentally start a
            newsletter list. When on, an "I just want the voucher" link appears
            next to the Google button.
          </p>
        </div>
        <label className="flex items-center justify-between gap-3 p-3 bg-background/30 border border-border/40 rounded-md">
          <div>
            <p className="text-sm font-medium">Allow email-only voucher</p>
            <p className="text-xs text-muted-foreground">
              Visitor enters email → POST /api/newsletter → code sent via the
              configured Resend / Brevo provider.
            </p>
          </div>
          <Switch
            checked={cfg.emailCaptureEnabled}
            onCheckedChange={(v) =>
              setCfg((c) => ({ ...c, emailCaptureEnabled: v }))
            }
          />
        </label>
      </section>

      <section className="rounded-md border border-border/60 bg-card/30 p-4 sm:p-5 space-y-4">
        <div>
          <h3 className="font-display text-base">Copy</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Headline and body shown in the modal.
          </p>
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Headline</Label>
          <Input
            value={cfg.headline}
            maxLength={120}
            onChange={(e) =>
              setCfg((c) => ({ ...c, headline: e.target.value }))
            }
            placeholder={DEFAULT_NEW_USER_MODAL.headline}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Body</Label>
          <Textarea
            value={cfg.body}
            maxLength={400}
            rows={3}
            onChange={(e) => setCfg((c) => ({ ...c, body: e.target.value }))}
            placeholder={DEFAULT_NEW_USER_MODAL.body}
          />
        </div>
      </section>

      <section className="rounded-md border border-border/60 bg-card/30 p-4 sm:p-5 space-y-4">
        <div>
          <h3 className="font-display text-base">A/B variant (B)</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Optional second copy that splits new visitors deterministically by
            their visitor id. The fields above are variant A. Disable variant B
            to revert to a single copy.
          </p>
        </div>
        <label className="flex items-center justify-between gap-3 p-3 bg-background/30 border border-border/40 rounded-md">
          <div>
            <p className="text-sm font-medium">Enable variant B</p>
            <p className="text-xs text-muted-foreground">
              When off, every visitor sees variant A.
            </p>
          </div>
          <Switch
            checked={cfg.variantB.enabled}
            onCheckedChange={(v) =>
              setCfg((c) => ({
                ...c,
                variantB: { ...c.variantB, enabled: v },
              }))
            }
          />
        </label>
        {cfg.variantB.enabled && (
          <div className="space-y-4 pl-1">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Traffic to variant B ({cfg.variantB.weight}%)
              </Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={cfg.variantB.weight}
                onChange={(e) => {
                  const next = Math.min(
                    100,
                    Math.max(0, Math.floor(Number(e.target.value) || 0)),
                  );
                  setCfg((c) => ({
                    ...c,
                    variantB: { ...c.variantB, weight: next },
                  }));
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                0 → no one sees B (pause). 100 → every new visitor sees B.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Variant B headline
              </Label>
              <Input
                value={cfg.variantB.headline}
                maxLength={120}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    variantB: { ...c.variantB, headline: e.target.value },
                  }))
                }
                placeholder={DEFAULT_NEW_USER_MODAL_VARIANT_B.headline}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Variant B body
              </Label>
              <Textarea
                value={cfg.variantB.body}
                maxLength={400}
                rows={3}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    variantB: { ...c.variantB, body: e.target.value },
                  }))
                }
                placeholder={DEFAULT_NEW_USER_MODAL_VARIANT_B.body}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Variant B voucher code (leave blank to use variant A's code)
              </Label>
              <Input
                value={cfg.variantB.voucherCode}
                maxLength={30}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    variantB: {
                      ...c.variantB,
                      voucherCode: e.target.value.toUpperCase(),
                    },
                  }))
                }
                placeholder="WELCOME15"
              />
            </div>
          </div>
        )}
      </section>

      <NewUserModalAnalyticsPanel />

      <div className="flex flex-wrap gap-2 pt-2 border-t border-border/40">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save new-user modal
        </Button>
        {cfg.variantB.enabled ? (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => handlePreview("a")}
              disabled={saving}
              title="Save and pop variant A open."
            >
              <Eye className="w-4 h-4 mr-2" />
              Preview A
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handlePreview("b")}
              disabled={saving}
              title="Save and pop variant B open."
            >
              <Eye className="w-4 h-4 mr-2" />
              Preview B
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => handlePreview()}
            disabled={saving}
            title="Save and pop the modal open right now—bypasses one-shot localStorage gate."
          >
            <Eye className="w-4 h-4 mr-2" />
            Save & preview
          </Button>
        )}
      </div>
    </div>
  );
}

const TriggerToggle = ({
  icon,
  label,
  description,
  checked,
  onChange,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children?: React.ReactNode;
}) => (
  <div className="p-3 bg-background/30 border border-border/40 rounded-md space-y-2">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
    {children}
  </div>
);
