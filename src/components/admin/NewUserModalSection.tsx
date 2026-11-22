import { useEffect, useMemo, useState } from "react";
import {
  Eye,
  Loader2,
  MousePointerClick,
  Plus,
  Save,
  Sparkles,
  ScrollText,
  Timer,
  Trash2,
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
  NEW_USER_MODAL_MAX_VARIANTS,
  newUserModalVariantId,
  newUserModalVariantLabel,
  useStorefrontConfig,
  type NewUserModalConfig,
  type NewUserModalVariant,
} from "@/contexts/StorefrontConfigContext";
import { listNewUserModalVariants } from "@/lib/newuser-modal-variant";

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
const VARIANT_ID_RE = /^[a-z0-9_-]{1,32}$/;

const sanitizeIdInput = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 32);

// Build the next unused variant id when the admin clicks "Add variant".
// Walks through a, b, c, … and falls back to numbered suffixes if all
// 26 letters are taken (extremely unlikely with the 8-variant cap).
const nextVariantId = (existing: NewUserModalVariant[]): string => {
  const taken = new Set(existing.map((v) => v.id));
  for (let i = 0; i < 26; i++) {
    const id = newUserModalVariantId(i);
    if (!taken.has(id)) return id;
  }
  for (let i = 1; i < 100; i++) {
    const id = `v${i}`;
    if (!taken.has(id)) return id;
  }
  return `v${existing.length + 1}`;
};

// Coerce whatever the server returned into a fully-populated config so
// the form has stable defaults for both old (top-level only) and new
// (variants array) shapes. Mirrors `listNewUserModalVariants` from the
// resolver lib so the admin sees the same variants the modal would.
const normalizeIncoming = (
  raw: Partial<NewUserModalConfig>,
): NewUserModalConfig => {
  const merged: NewUserModalConfig = {
    ...DEFAULT_NEW_USER_MODAL,
    ...raw,
    triggers: {
      ...DEFAULT_NEW_USER_MODAL.triggers,
      ...(raw.triggers || {}),
    },
    variantB: {
      ...DEFAULT_NEW_USER_MODAL.variantB,
      ...(raw.variantB || {}),
    },
    variants: Array.isArray(raw.variants) ? raw.variants : [],
    variantsEnabled: raw.variantsEnabled === true,
  };
  const variants = listNewUserModalVariants(merged);
  return {
    ...merged,
    variants: variants.length > 0 ? variants : DEFAULT_NEW_USER_MODAL.variants,
  };
};

// Build a fresh variant ready to drop into the list, defaulting to the
// active variant A's copy so the admin only has to tweak deltas.
const makeBlankVariant = (
  existing: NewUserModalVariant[],
): NewUserModalVariant => {
  const id = nextVariantId(existing);
  const head = existing[0];
  return {
    id,
    label: newUserModalVariantLabel(existing.length),
    weight: 0,
    headline: head?.headline || DEFAULT_NEW_USER_MODAL.headline,
    body: head?.body || DEFAULT_NEW_USER_MODAL.body,
    voucherCode: head?.voucherCode || "",
  };
};

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
      setCfg(normalizeIncoming(data.config.newUserModal));
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
          setCfg(
            normalizeIncoming({
              ...DEFAULT_NEW_USER_MODAL,
              ...data.config.newUserModal,
            }),
          );
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

  const handlePreview = (variant?: string) => {
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

  // Variants — mutators are co-located with the form state so the
  // editor sub-component stays pure (it just receives a change handler).
  const updateVariant = (index: number, next: NewUserModalVariant) => {
    setCfg((c) => {
      const variants = c.variants.slice();
      variants[index] = next;
      return { ...c, variants };
    });
  };

  const removeVariant = (index: number) => {
    setCfg((c) => {
      if (c.variants.length <= 1) return c;
      const variants = c.variants.filter((_, i) => i !== index);
      return {
        ...c,
        variants,
        // Auto-disable the test when we drop back to a single variant
        // so we don't end up in a state where the toggle is on but the
        // resolver short-circuits to variant A anyway.
        variantsEnabled: c.variantsEnabled && variants.length >= 2,
      };
    });
  };

  const addVariant = () => {
    setCfg((c) => {
      if (c.variants.length >= NEW_USER_MODAL_MAX_VARIANTS) return c;
      return {
        ...c,
        variants: [...c.variants, makeBlankVariant(c.variants)],
      };
    });
  };

  // Show a normalised breakdown when the test is on so the admin can see
  // the actual % each variant will receive after weights are scaled.
  const weightSummary = useMemo(() => {
    if (!cfg.variantsEnabled || cfg.variants.length < 2) return "";
    const total = cfg.variants.reduce(
      (acc, v) => acc + Math.max(0, v.weight),
      0,
    );
    if (total <= 0)
      return "All weights are zero — every visitor will see Variant A.";
    const parts = cfg.variants.map((v) => {
      const pct = (Math.max(0, v.weight) / total) * 100;
      return `${v.label || v.id.toUpperCase()} ${pct.toFixed(pct >= 10 ? 0 : 1)}%`;
    });
    return `Split: ${parts.join(" / ")}`;
  }, [cfg.variantsEnabled, cfg.variants]);

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
          <h3 className="font-display text-base">Voucher shortcut</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Each variant picks its own promo below. This shortcut bootstraps a
            10% welcome code and attaches it to Variant A in one click.
          </p>
        </div>

        <div className="flex items-center gap-3">
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
            Creates WELCOME10 (10% off, no min spend) if it doesn&apos;t exist
            and attaches it to Variant A. Manage all promo codes in Storefront →
            Promo codes.
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
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-base">Variants</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Build out A/B/C/… copy variants and split traffic by weight. Each
              variant gets its own headline, body and voucher; weights are
              normalised at render time so they don&apos;t need to sum to 100.
            </p>
          </div>
        </div>

        <label className="flex items-center justify-between gap-3 p-3 bg-background/30 border border-border/40 rounded-md">
          <div>
            <p className="text-sm font-medium">Enable multivariate test</p>
            <p className="text-xs text-muted-foreground">
              When off, every visitor sees Variant A. When on, visitors are
              bucketed deterministically by their visitor id against the
              cumulative weights below.
            </p>
          </div>
          <Switch
            checked={cfg.variantsEnabled}
            disabled={cfg.variants.length < 2}
            onCheckedChange={(v) =>
              setCfg((c) => ({ ...c, variantsEnabled: v }))
            }
          />
        </label>

        {weightSummary ? (
          <p className="text-[11px] text-muted-foreground">{weightSummary}</p>
        ) : null}

        <div className="space-y-4">
          {cfg.variants.map((variant, index) => (
            <VariantEditor
              key={`${variant.id}-${index}`}
              index={index}
              variant={variant}
              promos={promos}
              showWeight={cfg.variantsEnabled && cfg.variants.length >= 2}
              onChange={(next) => updateVariant(index, next)}
              onRemove={
                cfg.variants.length > 1 ? () => removeVariant(index) : undefined
              }
              onPreview={() => handlePreview(variant.id)}
              saving={saving}
              idTaken={(candidate) =>
                cfg.variants.some((v, i) => i !== index && v.id === candidate)
              }
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/40">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addVariant}
            disabled={cfg.variants.length >= NEW_USER_MODAL_MAX_VARIANTS}
            title={
              cfg.variants.length >= NEW_USER_MODAL_MAX_VARIANTS
                ? `Up to ${NEW_USER_MODAL_MAX_VARIANTS} variants`
                : "Add another variant"
            }
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add variant
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Up to {NEW_USER_MODAL_MAX_VARIANTS} variants.
          </p>
        </div>
      </section>

      <NewUserModalAnalyticsPanel variants={cfg.variants} />

      <div className="flex flex-wrap gap-2 pt-2 border-t border-border/40">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save new-user modal
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => handlePreview()}
          disabled={saving}
          title="Save and pop the modal open with the visitor's natural variant."
        >
          <Eye className="w-4 h-4 mr-2" />
          Save & preview
        </Button>
      </div>
    </div>
  );
}

interface VariantEditorProps {
  index: number;
  variant: NewUserModalVariant;
  promos: AdminPromoSummary[];
  showWeight: boolean;
  onChange: (next: NewUserModalVariant) => void;
  onRemove?: () => void;
  onPreview: () => void;
  saving: boolean;
  // Lets the parent flag duplicate ids without re-rendering the whole
  // form on every keystroke.
  idTaken: (candidate: string) => boolean;
}

const VariantEditor = ({
  index,
  variant,
  promos,
  showWeight,
  onChange,
  onRemove,
  onPreview,
  saving,
  idTaken,
}: VariantEditorProps) => {
  const idInvalid =
    !VARIANT_ID_RE.test(variant.id) ||
    idTaken(variant.id) ||
    variant.id.length === 0;

  return (
    <div className="rounded-md border border-border/40 bg-background/30 p-3 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-foreground/85 text-background text-xs font-mono uppercase">
            {variant.id || "?"}
          </span>
          <Input
            value={variant.label}
            maxLength={60}
            onChange={(e) => onChange({ ...variant, label: e.target.value })}
            placeholder={newUserModalVariantLabel(index)}
            className="h-8 text-sm w-48"
            aria-label="Variant label"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onPreview}
            disabled={saving}
            title={`Save and preview ${variant.label || variant.id.toUpperCase()}.`}
          >
            <Eye className="w-4 h-4 mr-1.5" />
            Preview
          </Button>
          {onRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onRemove}
              title="Remove variant"
              aria-label="Remove variant"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            ID
          </Label>
          <Input
            value={variant.id}
            maxLength={32}
            onChange={(e) =>
              onChange({
                ...variant,
                id: sanitizeIdInput(e.target.value),
              })
            }
            placeholder={newUserModalVariantId(index)}
            className={`h-8 text-sm font-mono ${
              idInvalid
                ? "border-destructive focus-visible:ring-destructive"
                : ""
            }`}
            aria-invalid={idInvalid}
          />
          {idInvalid ? (
            <p className="text-[11px] text-destructive">
              {variant.id.length === 0
                ? "ID required."
                : idTaken(variant.id)
                  ? "Already used by another variant."
                  : "Use lowercase letters, digits, _ or -."}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Sticks to the visitor — keep stable mid-test.
            </p>
          )}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            Voucher
          </Label>
          <Select
            value={variant.voucherCode || NONE_VALUE}
            onValueChange={(v) =>
              onChange({
                ...variant,
                voucherCode: v === NONE_VALUE ? "" : v,
              })
            }
          >
            <SelectTrigger className="h-8 text-sm">
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
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          Headline
        </Label>
        <Input
          value={variant.headline}
          maxLength={120}
          onChange={(e) => onChange({ ...variant, headline: e.target.value })}
          placeholder={DEFAULT_NEW_USER_MODAL.headline}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          Body
        </Label>
        <Textarea
          value={variant.body}
          maxLength={400}
          rows={3}
          onChange={(e) => onChange({ ...variant, body: e.target.value })}
          placeholder={DEFAULT_NEW_USER_MODAL.body}
        />
      </div>

      {showWeight ? (
        <div className="space-y-1.5">
          <Label className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            Weight ({variant.weight})
          </Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={variant.weight}
            onChange={(e) => {
              const next = Math.min(
                100,
                Math.max(0, Math.floor(Number(e.target.value) || 0)),
              );
              onChange({ ...variant, weight: next });
            }}
            className="w-32 h-8 text-sm"
          />
          <p className="text-[11px] text-muted-foreground">
            Relative weight 0–100. The renderer normalises across all variants,
            so the numbers don&apos;t need to sum to 100.
          </p>
        </div>
      ) : null}
    </div>
  );
};

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
