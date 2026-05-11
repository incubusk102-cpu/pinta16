import { useEffect, useMemo, useRef, useState } from "react";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import {
  Megaphone,
  MessageSquare,
  Truck,
  Tag,
  Plus,
  Trash2,
  Loader2,
  PackageOpen,
  Palmtree,
  Clapperboard,
} from "lucide-react";
import {
  COURIERS,
  DEFAULT_SHIPPING_RATES,
  DEFAULT_LALAMOVE_FARE,
  type ShippingRate,
  type LalamoveFareConfig,
} from "@/lib/shipment";
import { SHIPPING_ZONES } from "@/lib/ph-regions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useStorefrontConfig } from "@/contexts/StorefrontConfigContext";
import {
  CHAT_FAQ_ANSWER_MAX,
  CHAT_FAQ_MAX,
  CHAT_FAQ_QUESTION_MAX,
  DEFAULT_CHAT_FAQS,
  DEFAULT_CHAT_WELCOME,
  slugifyFaqId,
  type ChatFaqItem,
} from "@/lib/chat-faqs";
import { toast } from "sonner";
import ScrollableTable from "./ScrollableTable";

type AdminPromoType = "percent" | "fixed" | "flat" | "free_shipping";

interface AdminPromo {
  code: string;
  type: AdminPromoType;
  value: number;
  freeShipping: boolean;
  minSpend: number;
  usageLimit: number | null;
  usageCount: number;
  // Per-customer redemption cap. 0 (or missing) means unlimited and is
  // back-compat with codes saved before this field existed. Enforced by
  // the place-order handler against the D1 redemption ledger.
  maxRedemptionsPerCustomer: number;
  expiresAt: string | null;
  enabled: boolean;
  description: string;
}

const sizeClassMap: Record<string, string> = {
  compact: "text-xs sm:text-sm py-1.5",
  normal: "text-sm sm:text-base py-2",
  large: "text-base sm:text-lg py-3",
};

const formatPromoLine = (template: string, p: AdminPromo): string => {
  const discount =
    p.type === "percent"
      ? `${p.value}%`
      : p.type === "flat"
        ? `flat ₱${p.value.toLocaleString()}`
        : p.type === "free_shipping"
          ? "free shipping"
          : `₱${p.value.toLocaleString()}`;
  const minSpend =
    p.minSpend > 0 ? ` orders ₱${p.minSpend.toLocaleString()}+` : "";
  return template
    .replace(/\{code\}/g, p.code)
    .replace(/\{discount\}/g, discount)
    .replace(/\{minSpend\}/g, minSpend)
    .replace(/\{description\}/g, p.description || "")
    .trim();
};

const formatPromoBadge = (p: AdminPromo): string => {
  if (p.type === "percent") return `${p.value}% off`;
  if (p.type === "flat") return `Flat ₱${p.value.toLocaleString()}`;
  if (p.type === "free_shipping") return "Free shipping";
  return `₱${p.value.toLocaleString()} off`;
};

type AdminAnnouncementAnimation =
  | "fade"
  | "marquee"
  | "slide"
  | "typewriter"
  | "pulse";

interface AdminConfig {
  announcement: {
    enabled: boolean;
    message: string;
    link: string;
    backgroundColor: string;
    textColor: string;
    showFreeShipping: boolean;
    showPromoCodes: boolean;
    promoTemplate: string;
    rotateSeconds: number;
    size: "compact" | "normal" | "large";
    bold: boolean;
    animation: AdminAnnouncementAnimation;
    marqueeSpeedSeconds: number;
    marqueeDirection: "left" | "right";
    gradientEnabled: boolean;
    gradientFrom: string;
    gradientTo: string;
    iconPrefix: string;
    dismissable: boolean;
  };
  freeShipping: {
    enabled: boolean;
    threshold: number;
    shippingFee: number;
  };
  lalamoveFare: LalamoveFareConfig;
  shippingRates: ShippingRate[];
  promoCodes: AdminPromo[];
  chat: {
    enabled: boolean;
    welcome: string;
    agentHandoff: boolean;
    faqs: ChatFaqItem[];
    ai: {
      enabled: boolean;
      // Empty string → server falls back to the bundled prompt in
      // chat-ai.js. Override only if you want a non-default tone /
      // persona.
      systemPrompt: string;
      // Empty string → server uses the default Groq model. Tighten
      // here if a future model serves canvhub better.
      model: string;
      handoffKeywords: string[];
    };
  };
  vacationMode: {
    enabled: boolean;
    returnDate: string;
    message: string;
    pauseCheckout: boolean;
  };
  landingVideo: {
    enabled: boolean;
    videoUrl: string;
    posterUrl: string;
    eyebrow: string;
    headline: string;
    description: string;
    ctaLabel: string;
    ctaHref: string;
  };
}

const DEFAULTS: AdminConfig = {
  announcement: {
    enabled: false,
    message: "",
    link: "",
    backgroundColor: "#1f2937",
    textColor: "#ffffff",
    showFreeShipping: true,
    showPromoCodes: true,
    promoTemplate: "Use code {code} for {discount} off{minSpend}",
    rotateSeconds: 5,
    size: "normal",
    bold: true,
    animation: "fade",
    marqueeSpeedSeconds: 18,
    marqueeDirection: "left",
    gradientEnabled: false,
    gradientFrom: "#1f2937",
    gradientTo: "#0ea5e9",
    iconPrefix: "",
    dismissable: false,
  },
  freeShipping: {
    enabled: true,
    threshold: 8000,
    shippingFee: 500,
  },
  lalamoveFare: DEFAULT_LALAMOVE_FARE,
  shippingRates: DEFAULT_SHIPPING_RATES,
  promoCodes: [],
  chat: {
    enabled: true,
    welcome: DEFAULT_CHAT_WELCOME,
    agentHandoff: true,
    faqs: DEFAULT_CHAT_FAQS,
    ai: {
      enabled: false,
      systemPrompt: "",
      model: "",
      handoffKeywords: [],
    },
  },
  vacationMode: {
    enabled: false,
    returnDate: "",
    message: "",
    pauseCheckout: true,
  },
  landingVideo: {
    enabled: false,
    videoUrl: "",
    posterUrl: "",
    eyebrow: "Behind the brush",
    headline: "Watch the studio in motion.",
    description:
      "A short montage of every painting coming to life \u2014 from blank canvas to the wall it was made for.",
    ctaLabel: "Browse the collection",
    ctaHref: "/collection",
  },
};

// Common minimum-spend / shipping-fee presets surfaced as one-tap chips
// so admins don't have to think about the right round number to type.
const THRESHOLD_PRESETS: { value: number; label: string }[] = [
  { value: 0, label: "Always" },
  { value: 2500, label: "₱2,500" },
  { value: 5000, label: "₱5,000" },
  { value: 8000, label: "₱8,000" },
  { value: 10000, label: "₱10,000" },
  { value: 15000, label: "₱15,000" },
];

const SHIPPING_FEE_PRESETS = [100, 150, 250, 350, 500, 800];

interface FreeShippingRuleSectionProps {
  freeShipping: AdminConfig["freeShipping"];
  onChange: (next: Partial<AdminConfig["freeShipping"]>) => void;
  onReset: () => void;
  onSave: () => void;
  saving: boolean;
  previewSubtotal: number;
  onPreviewSubtotalChange: (next: number) => void;
}

function FreeShippingRuleSection({
  freeShipping,
  onChange,
  onReset,
  onSave,
  saving,
  previewSubtotal,
  onPreviewSubtotalChange,
}: FreeShippingRuleSectionProps) {
  const { enabled, threshold, shippingFee } = freeShipping;
  // Cap the slider's range so the thumb is always meaningfully placed —
  // a bit above the threshold so admins can drag past "free shipping
  // unlocked" and see the green state too.
  const previewMax = Math.max(threshold * 1.5, threshold + 4000, 12000);
  const remaining = Math.max(0, threshold - previewSubtotal);
  const previewIsFree =
    enabled && (threshold === 0 || previewSubtotal >= threshold);
  const progressPercent =
    threshold > 0 ? Math.min((previewSubtotal / threshold) * 100, 100) : 100;

  const feeExceedsThreshold =
    enabled && threshold > 0 && shippingFee >= threshold;
  const feeIsZero = enabled && threshold > 0 && shippingFee === 0;

  return (
    <section className="bg-card/40 border border-border/60 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-1">
        <Truck className="w-4 h-4 text-primary" />
        <h2 className="font-display text-lg">Free-shipping rule</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Pick a minimum spend that unlocks free shipping. The cart drawer shows
        "₱X away from free shipping" automatically and the announcement bar
        reflects this threshold.
      </p>

      <label className="flex items-center justify-between gap-3 p-3 bg-background/30 border border-border/40 rounded-md mb-3">
        <div>
          <p className="text-sm font-medium">Offer free shipping</p>
          <p className="text-xs text-muted-foreground">
            {enabled
              ? "Above the minimum spend below, the shipping fee is waived."
              : "Customers always pay the shipping fee. The threshold below has no effect while this is off."}
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => onChange({ enabled: v })}
        />
      </label>

      <div
        className={cn(
          "grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 transition-opacity",
          !enabled && "opacity-60",
        )}
      >
        {/* Minimum spend */}
        <div className="space-y-2">
          <Label htmlFor="fs-threshold">
            Minimum spend to unlock free shipping
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
              ₱
            </span>
            <Input
              id="fs-threshold"
              type="number"
              inputMode="numeric"
              min={0}
              step={500}
              className="pl-7"
              disabled={!enabled}
              value={threshold}
              onChange={(e) =>
                onChange({
                  threshold: Math.max(0, Number(e.target.value) || 0),
                })
              }
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {THRESHOLD_PRESETS.map((p) => {
              const active = threshold === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  disabled={!enabled}
                  onClick={() => onChange({ threshold: p.value })}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs border transition-colors",
                    active
                      ? "bg-foreground text-background border-foreground"
                      : "bg-background/40 text-muted-foreground border-border/50 hover:border-foreground/40",
                    !enabled && "cursor-not-allowed",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {threshold === 0
              ? "Every order ships free regardless of cart total."
              : `Customers see free shipping when their cart reaches ₱${threshold.toLocaleString()}.`}
          </p>
        </div>

        {/* Shipping fee */}
        <div className="space-y-2">
          <Label htmlFor="fs-fee">Default shipping fee</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
              ₱
            </span>
            <Input
              id="fs-fee"
              type="number"
              inputMode="numeric"
              min={0}
              step={50}
              className="pl-7"
              value={shippingFee}
              onChange={(e) =>
                onChange({
                  shippingFee: Math.max(0, Number(e.target.value) || 0),
                })
              }
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SHIPPING_FEE_PRESETS.map((preset) => {
              const active = shippingFee === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onChange({ shippingFee: preset })}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs border transition-colors",
                    active
                      ? "bg-foreground text-background border-foreground"
                      : "bg-background/40 text-muted-foreground border-border/50 hover:border-foreground/40",
                  )}
                >
                  ₱{preset.toLocaleString()}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Used when no per-courier rate matches. Customers below the threshold
            pay this.
          </p>
        </div>
      </div>

      {/* Plain-English summary */}
      <div className="rounded-md border border-border/40 bg-background/30 p-3 mb-3 text-xs sm:text-sm space-y-1">
        {!enabled ? (
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">
              Free shipping is off.
            </span>{" "}
            Every order pays ₱{shippingFee.toLocaleString()} (or the per-courier
            rate when available).
          </p>
        ) : threshold === 0 ? (
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">
              Every order ships free.
            </span>{" "}
            Threshold is ₱0, so the shipping fee is waived for every cart.
          </p>
        ) : (
          <>
            <p className="text-muted-foreground">
              Cart{" "}
              <span className="font-medium text-foreground">
                ≥ ₱{threshold.toLocaleString()}
              </span>{" "}
              → Free shipping{" "}
              {shippingFee > 0 && (
                <span className="text-success">
                  (saves ₱{shippingFee.toLocaleString()})
                </span>
              )}
            </p>
            <p className="text-muted-foreground">
              Cart{" "}
              <span className="font-medium text-foreground">
                &lt; ₱{threshold.toLocaleString()}
              </span>{" "}
              → ₱{shippingFee.toLocaleString()} shipping fee
            </p>
          </>
        )}
      </div>

      {/* Validation hints */}
      {feeExceedsThreshold && (
        <div className="rounded-md border border-amber-400/40 bg-amber-400/5 p-3 mb-3 text-xs text-amber-200">
          Heads up: your shipping fee (₱{shippingFee.toLocaleString()}) is at or
          above the threshold (₱{threshold.toLocaleString()}). Customers will
          hit free shipping with very small orders, which usually isn't what you
          want.
        </div>
      )}
      {feeIsZero && (
        <div className="rounded-md border border-border/40 bg-background/30 p-3 mb-3 text-xs text-muted-foreground">
          Note: shipping fee is ₱0, so the threshold doesn't change what
          customers pay — every order already ships free.
        </div>
      )}

      {/* Live customer preview */}
      <div className="rounded-md border border-border/40 bg-background/30 p-3 mb-4">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
          What customers will see
        </p>
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-muted-foreground">Mock cart subtotal</span>
          <span className="font-medium text-foreground">
            ₱{previewSubtotal.toLocaleString()}
          </span>
        </div>
        <Slider
          value={[Math.min(previewSubtotal, previewMax)]}
          max={previewMax}
          step={500}
          onValueChange={([v]) => onPreviewSubtotalChange(v)}
          aria-label="Mock cart subtotal"
        />
        <div className="rounded-md border border-border/30 bg-card/40 p-3 mt-3 text-xs space-y-2">
          {enabled && threshold > 0 && previewSubtotal < threshold ? (
            <>
              <div className="flex items-center gap-2">
                <Truck className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">
                  ₱{remaining.toLocaleString()} away from free shipping (₱
                  {threshold.toLocaleString()})
                </span>
              </div>
              <div className="w-full h-1 bg-border/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-foreground/50 rounded-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </>
          ) : enabled ? (
            <div className="flex items-center gap-2">
              <Truck className="w-3.5 h-3.5 text-success" />
              <span className="text-success font-medium">
                Free shipping unlocked
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Truck className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">
                Free shipping is off — customer pays ₱
                {shippingFee.toLocaleString()}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between pt-2 border-t border-border/20 text-muted-foreground">
            <span>Shipping</span>
            <span>
              {previewIsFree ? (
                <>
                  {shippingFee > 0 && (
                    <span className="line-through mr-1">
                      ₱{shippingFee.toLocaleString()}
                    </span>
                  )}
                  <span className="text-foreground">FREE</span>
                </>
              ) : (
                <>₱{shippingFee.toLocaleString()}</>
              )}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onReset}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Reset to defaults
        </button>
        <Button onClick={onSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…
            </>
          ) : (
            "Save shipping rule"
          )}
        </Button>
      </div>
    </section>
  );
}

interface LalamoveFareSectionProps {
  lalamoveFare: AdminConfig["lalamoveFare"];
  onChange: (next: Partial<AdminConfig["lalamoveFare"]>) => void;
  onReset: () => void;
  onSave: () => void;
  saving: boolean;
}

function LalamoveFareSection({
  lalamoveFare,
  onChange,
  onReset,
  onSave,
  saving,
}: LalamoveFareSectionProps) {
  const {
    enabled,
    warehouseLat,
    warehouseLng,
    warehouseLabel,
    perKmRate,
    baseFee,
    minFare,
  } = lalamoveFare;

  // Sample distance from Bagong Silang, Caloocan to Imus (Cavite) ≈ 35 km.
  // Useful sanity-check for the admin: at ₱25/km + ₱50 base fee + ₱100
  // floor → ₱925, which is in the right ballpark for Lalamove sedan
  // intra-CALABARZON.
  const previewKm = 35;
  const previewFare = Math.max(
    minFare,
    Math.round(baseFee + previewKm * perKmRate),
  );

  return (
    <section className="bg-card/40 border border-border/60 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-1">
        <PackageOpen className="w-4 h-4 text-primary" />
        <h2 className="font-display text-lg">Lalamove fare estimate</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Show buyers a single-peso Lalamove fare estimate at checkout based on
        straight-line distance from your studio × your per-km rate + a base fee.
        Distance is computed from your warehouse coordinates to the buyer's
        province centroid (Luzon only). When this is off, the checkout falls
        back to the per-province range you have today.
      </p>

      <div className="flex items-center justify-between gap-3 rounded-md border border-border/40 bg-background/30 p-3 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Show distance-based estimate</p>
          <p className="text-xs text-muted-foreground">
            Customer-facing toggle — turn off if your rate is wildly out of sync
            with what riders are quoting.
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => onChange({ enabled: v })}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <Label className="text-xs">Warehouse / studio label</Label>
          <Input
            type="text"
            value={warehouseLabel}
            maxLength={80}
            placeholder="Bagong Silang, Caloocan"
            onChange={(e) => onChange({ warehouseLabel: e.target.value })}
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Shown next to the fare ("from <i>{warehouseLabel || "…"}</i>").
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Latitude</Label>
            <Input
              type="number"
              step="0.000001"
              inputMode="decimal"
              value={Number.isFinite(warehouseLat) ? warehouseLat : ""}
              onChange={(e) =>
                onChange({ warehouseLat: Number(e.target.value) })
              }
            />
          </div>
          <div>
            <Label className="text-xs">Longitude</Label>
            <Input
              type="number"
              step="0.000001"
              inputMode="decimal"
              value={Number.isFinite(warehouseLng) ? warehouseLng : ""}
              onChange={(e) =>
                onChange({ warehouseLng: Number(e.target.value) })
              }
            />
          </div>
          <p className="col-span-2 text-[11px] text-muted-foreground">
            Pick coordinates from Google Maps: right-click the studio's location
            → click the lat/lng to copy. Must be inside the Philippines (4–22°N,
            116–127°E).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div>
          <Label className="text-xs">Per-km rate (₱)</Label>
          <Input
            type="number"
            min={0}
            max={500}
            step={1}
            inputMode="numeric"
            value={Number.isFinite(perKmRate) ? perKmRate : 0}
            onChange={(e) => onChange({ perKmRate: Number(e.target.value) })}
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Lalamove sedan ≈ ₱13/km; bump for inter-city detours.
          </p>
        </div>
        <div>
          <Label className="text-xs">Base fee (₱)</Label>
          <Input
            type="number"
            min={0}
            max={2000}
            step={5}
            inputMode="numeric"
            value={Number.isFinite(baseFee) ? baseFee : 0}
            onChange={(e) => onChange({ baseFee: Number(e.target.value) })}
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Flat add-on (flag-down + handling).
          </p>
        </div>
        <div>
          <Label className="text-xs">Minimum fare (₱)</Label>
          <Input
            type="number"
            min={0}
            max={2000}
            step={5}
            inputMode="numeric"
            value={Number.isFinite(minFare) ? minFare : 0}
            onChange={(e) => onChange({ minFare: Number(e.target.value) })}
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Floor for short-distance trips.
          </p>
        </div>
      </div>

      <div className="rounded-md border border-border/40 bg-background/30 p-3 mb-4 text-xs">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
          Sanity check
        </p>
        <p className="text-foreground/90">
          {warehouseLabel || "your studio"} → Imus, Cavite (≈{previewKm} km
          straight-line) →{" "}
          <span className="font-semibold">
            ₱{previewFare.toLocaleString("en-PH")}
          </span>{" "}
          ({baseFee.toLocaleString("en-PH")} base + {previewKm} ×{" "}
          {perKmRate.toLocaleString("en-PH")}, floor ₱
          {minFare.toLocaleString("en-PH")})
        </p>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <Button variant="outline" size="sm" onClick={onReset}>
          Reset to defaults
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving…
            </>
          ) : (
            "Save Lalamove fare"
          )}
        </Button>
      </div>
    </section>
  );
}

export function StorefrontSection() {
  const { token } = useAdminAuth();
  const { refresh } = useStorefrontConfig();
  const [cfg, setCfg] = useState<AdminConfig>(DEFAULTS);
  // Snapshot of the last persisted config so we can detect when the
  // admin has unsaved edits. Updated after a successful load or save.
  const baselineCfg = useRef<AdminConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const isDirty = useMemo(() => {
    if (loading) return false;
    try {
      // baselineCfg is a stable useRef snapshot of the last persisted server
      // state; reading .current here is the entire point of the comparison
      // and is gated on `cfg`/`loading` deps, so the memo recomputes when
      // either side changes.
      // eslint-disable-next-line react-hooks/refs
      return JSON.stringify(cfg) !== JSON.stringify(baselineCfg.current);
    } catch {
      return false;
    }
  }, [cfg, loading]);
  useUnsavedChangesGuard(isDirty);
  const [saving, setSaving] = useState<
    | null
    | "announcement"
    | "shipping"
    | "shipping-rates"
    | "promo"
    | "chat"
    | "vacation"
    | "lalamove-fare"
    | "landing-video"
  >(null);

  // Free-shipping rule preview — admin-only state used to show what
  // the customer cart will say at a hypothetical subtotal. Defaults to
  // half the threshold so the "₱X away from free shipping" copy is
  // visible right away when the section first renders.
  const [previewSubtotal, setPreviewSubtotal] = useState<number>(() =>
    Math.round((DEFAULTS.freeShipping.threshold || 0) / 2),
  );

  // Promo form state
  const [promoCode, setPromoCode] = useState("");
  const [promoType, setPromoType] = useState<AdminPromoType>("percent");
  const [promoValue, setPromoValue] = useState("");
  const [promoFreeShipping, setPromoFreeShipping] = useState(false);
  const [promoMinSpend, setPromoMinSpend] = useState("");
  const [promoUsageLimit, setPromoUsageLimit] = useState("");
  const [promoMaxPerCustomer, setPromoMaxPerCustomer] = useState("");
  const [promoExpiresAt, setPromoExpiresAt] = useState("");
  const [promoDescription, setPromoDescription] = useState("");

  const loadConfig = async () => {
    try {
      const res = await fetch("/api/storefront-config?admin=1", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data?.config) {
        const next: AdminConfig = {
          announcement: {
            ...DEFAULTS.announcement,
            ...data.config.announcement,
          },
          freeShipping: {
            ...DEFAULTS.freeShipping,
            ...data.config.freeShipping,
          },
          lalamoveFare: {
            ...DEFAULTS.lalamoveFare,
            ...(data.config.lalamoveFare &&
            typeof data.config.lalamoveFare === "object"
              ? data.config.lalamoveFare
              : {}),
          },
          shippingRates: Array.isArray(data.config.shippingRates)
            ? (data.config.shippingRates as ShippingRate[])
            : DEFAULTS.shippingRates,
          promoCodes: Array.isArray(data.config.promoCodes)
            ? data.config.promoCodes
            : [],
          chat: {
            ...DEFAULTS.chat,
            ...(data.config.chat && typeof data.config.chat === "object"
              ? data.config.chat
              : {}),
            faqs: Array.isArray(data.config.chat?.faqs)
              ? data.config.chat.faqs
              : DEFAULTS.chat.faqs,
            ai: {
              ...DEFAULTS.chat.ai,
              ...(data.config.chat?.ai &&
              typeof data.config.chat.ai === "object"
                ? data.config.chat.ai
                : {}),
              handoffKeywords: Array.isArray(
                data.config.chat?.ai?.handoffKeywords,
              )
                ? data.config.chat.ai.handoffKeywords
                : DEFAULTS.chat.ai.handoffKeywords,
            },
          },
          vacationMode: {
            ...DEFAULTS.vacationMode,
            ...(data.config.vacationMode &&
            typeof data.config.vacationMode === "object"
              ? data.config.vacationMode
              : {}),
          },
          landingVideo: {
            ...DEFAULTS.landingVideo,
            ...(data.config.landingVideo &&
            typeof data.config.landingVideo === "object"
              ? data.config.landingVideo
              : {}),
          },
        };
        setCfg(next);
        baselineCfg.current = next;
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not load storefront config",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/storefront-config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data?.config) {
      const next = data.config as AdminConfig;
      setCfg(next);
      baselineCfg.current = next;
    }
    void refresh();
  };

  const handleSaveAnnouncement = async () => {
    setSaving("announcement");
    try {
      await post({
        action: "update-announcement",
        announcement: cfg.announcement,
      });
      toast.success("Announcement saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(null);
    }
  };

  const handleSaveVacation = async () => {
    setSaving("vacation");
    try {
      await post({
        action: "update-vacation-mode",
        vacationMode: cfg.vacationMode,
      });
      toast.success(
        cfg.vacationMode.enabled
          ? "Shop paused — buyers will see the vacation banner"
          : "Vacation mode off — shop is open",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(null);
    }
  };

  const handleSaveLandingVideo = async () => {
    setSaving("landing-video");
    try {
      await post({
        action: "update-landing-video",
        landingVideo: cfg.landingVideo,
      });
      toast.success(
        cfg.landingVideo.videoUrl
          ? "Studio reel saved — visitors will see it on the homepage"
          : "Studio reel cleared — the homepage section is hidden",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(null);
    }
  };

  const handleSaveShipping = async () => {
    setSaving("shipping");
    try {
      await post({
        action: "update-free-shipping",
        freeShipping: cfg.freeShipping,
      });
      toast.success("Shipping rule saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(null);
    }
  };

  const handleSaveLalamoveFare = async () => {
    setSaving("lalamove-fare");
    try {
      await post({
        action: "update-lalamove-fare",
        lalamoveFare: cfg.lalamoveFare,
      });
      toast.success("Lalamove fare saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(null);
    }
  };

  const handleSaveShippingRates = async () => {
    setSaving("shipping-rates");
    try {
      await post({
        action: "update-shipping-rates",
        shippingRates: cfg.shippingRates,
      });
      toast.success("Shipping rates saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(null);
    }
  };

  const updateShippingRateRow = (
    courierId: string,
    patch: Partial<ShippingRate> | { fees: Partial<ShippingRate["fees"]> },
  ) => {
    setCfg((c) => ({
      ...c,
      shippingRates: c.shippingRates.map((row) =>
        row.courierId === courierId
          ? {
              ...row,
              ...("courierLabel" in patch
                ? { courierLabel: patch.courierLabel as string }
                : {}),
              fees: { ...row.fees, ...(patch.fees ?? {}) },
            }
          : row,
      ),
    }));
  };

  const removeShippingRateRow = (courierId: string) => {
    setCfg((c) => ({
      ...c,
      shippingRates: c.shippingRates.filter((r) => r.courierId !== courierId),
    }));
  };

  const addShippingRateRow = (courier: { id: string; label: string }) => {
    setCfg((c) => {
      if (c.shippingRates.some((r) => r.courierId === courier.id)) return c;
      const seed = DEFAULT_SHIPPING_RATES.find(
        (r) => r.courierId === courier.id,
      );
      const fees = seed
        ? { ...seed.fees }
        : { metro_manila: 0, luzon: 0, visayas: 0, mindanao: 0 };
      return {
        ...c,
        shippingRates: [
          ...c.shippingRates,
          {
            courierId: courier.id,
            courierLabel: courier.label,
            fees,
          },
        ],
      };
    });
  };

  const handleAddPromo = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) return toast.error("Code required");
    const value = Number(promoValue);
    if (promoType !== "free_shipping") {
      if (!value || value <= 0)
        return toast.error("Discount value must be > 0");
      if (promoType === "percent" && value > 100)
        return toast.error("Percent must be 1–100");
    }
    setSaving("promo");
    try {
      await post({
        action: "upsert-promo",
        promo: {
          code,
          type: promoType,
          value: promoType === "free_shipping" ? 0 : value,
          freeShipping:
            promoType === "free_shipping" ? true : promoFreeShipping,
          minSpend: Number(promoMinSpend) || 0,
          usageLimit: promoUsageLimit ? Number(promoUsageLimit) : null,
          maxRedemptionsPerCustomer: Math.max(
            0,
            Math.floor(Number(promoMaxPerCustomer) || 0),
          ),
          expiresAt: promoExpiresAt
            ? new Date(promoExpiresAt).toISOString()
            : null,
          enabled: true,
          description: promoDescription.trim(),
        },
      });
      toast.success(`Promo ${code} saved`);
      setPromoCode("");
      setPromoValue("");
      setPromoFreeShipping(false);
      setPromoMinSpend("");
      setPromoUsageLimit("");
      setPromoMaxPerCustomer("");
      setPromoExpiresAt("");
      setPromoDescription("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save promo");
    } finally {
      setSaving(null);
    }
  };

  const handleTogglePromo = async (p: AdminPromo) => {
    try {
      await post({
        action: "upsert-promo",
        promo: { ...p, enabled: !p.enabled },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not toggle promo");
    }
  };

  const handleSaveChat = async () => {
    setSaving("chat");
    try {
      const cleanedFaqs = cfg.chat.faqs
        .map((f) => {
          const question = f.question.trim().slice(0, CHAT_FAQ_QUESTION_MAX);
          const answer = f.answer.trim().slice(0, CHAT_FAQ_ANSWER_MAX);
          if (!question || !answer) return null;
          const id = (f.id || "").trim().slice(0, 40) || slugifyFaqId(question);
          return { id, question, answer };
        })
        .filter((f): f is ChatFaqItem => f !== null)
        .slice(0, CHAT_FAQ_MAX);
      const cleanedKeywords = cfg.chat.ai.handoffKeywords
        .map((kw) => kw.trim().toLowerCase())
        .filter((kw) => kw.length >= 3)
        .filter((kw, i, arr) => arr.indexOf(kw) === i)
        .slice(0, 20);
      await post({
        action: "update-chat",
        chat: {
          enabled: cfg.chat.enabled,
          welcome: cfg.chat.welcome.trim(),
          agentHandoff: cfg.chat.agentHandoff,
          faqs: cleanedFaqs,
          ai: {
            enabled: cfg.chat.ai.enabled,
            systemPrompt: cfg.chat.ai.systemPrompt.trim(),
            model: cfg.chat.ai.model.trim(),
            handoffKeywords: cleanedKeywords,
          },
        },
      });
      toast.success("Chat settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(null);
    }
  };

  const updateFaq = (idx: number, patch: Partial<ChatFaqItem>) => {
    setCfg((prev) => ({
      ...prev,
      chat: {
        ...prev.chat,
        faqs: prev.chat.faqs.map((f, i) =>
          i === idx ? { ...f, ...patch } : f,
        ),
      },
    }));
  };

  const addFaq = () => {
    setCfg((prev) => {
      if (prev.chat.faqs.length >= CHAT_FAQ_MAX) return prev;
      return {
        ...prev,
        chat: {
          ...prev.chat,
          faqs: [
            ...prev.chat.faqs,
            {
              id: `faq-${Date.now().toString(36)}`,
              question: "",
              answer: "",
            },
          ],
        },
      };
    });
  };

  const removeFaq = (idx: number) => {
    setCfg((prev) => ({
      ...prev,
      chat: {
        ...prev.chat,
        faqs: prev.chat.faqs.filter((_, i) => i !== idx),
      },
    }));
  };

  const resetFaqsToDefaults = () => {
    if (!window.confirm("Replace current FAQs with the defaults?")) return;
    setCfg((prev) => ({
      ...prev,
      chat: { ...prev.chat, faqs: DEFAULT_CHAT_FAQS },
    }));
  };

  const handleDeletePromo = async (code: string) => {
    if (!window.confirm(`Delete promo code ${code}?`)) return;
    try {
      await post({ action: "delete-promo", code });
      toast.success(`Promo ${code} deleted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete promo");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading storefront settings…
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Unsaved-changes pill — slides into view at the top of the
          section as soon as the admin edits any field, and disappears
          after a successful save. Pairs with the `useUnsavedChangesGuard`
          hook above, which warns if the admin tries to navigate away
          (refresh, tab close, browser back) with pending edits. */}
      {isDirty && (
        <div
          role="status"
          aria-live="polite"
          className="sticky top-2 z-30 -mx-1 flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-700 dark:text-amber-300 font-body text-xs"
        >
          <span className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-full bg-amber-500"
              aria-hidden="true"
            />
            Unsaved changes — use the section's <em>Save</em> button to persist.
          </span>
        </div>
      )}
      {/* Vacation / shop pause — top of section so it's the first thing
          admin sees on the Storefront tab. Visually distinct (amber tint)
          when active so it's obvious the shop is paused. */}
      <section
        className={`border rounded-xl p-6 ${
          cfg.vacationMode.enabled
            ? "bg-amber-500/10 border-amber-500/40"
            : "bg-card/40 border-border/60"
        }`}
      >
        <div className="flex items-center gap-2 mb-1">
          <Palmtree
            className={`w-4 h-4 ${
              cfg.vacationMode.enabled ? "text-amber-500" : "text-primary"
            }`}
          />
          <h2 className="font-display text-lg">Vacation / shop pause</h2>
          {cfg.vacationMode.enabled && (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 bg-amber-500 text-white text-[10px] font-body tracking-[0.2em] uppercase rounded-sm">
              Active
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Pause the shop while you travel, attend a gallery opening, or take a
          break. Buyers can still browse, wishlist, and read every page — they
          just can't add to cart or check out. Existing orders and messages keep
          working normally.
        </p>
        <div className="space-y-3">
          <label className="flex items-center justify-between gap-3 p-3 bg-background/30 border border-border/40 rounded-md">
            <div>
              <p className="text-sm font-medium">Pause shop</p>
              <p className="text-xs text-muted-foreground">
                Replaces the announcement bar with a "back soon" banner and
                hides every Add-to-cart button.
              </p>
            </div>
            <Switch
              checked={cfg.vacationMode.enabled}
              onCheckedChange={(v) =>
                setCfg((c) => ({
                  ...c,
                  vacationMode: { ...c.vacationMode, enabled: v },
                }))
              }
            />
          </label>
          <div>
            <Label htmlFor="vac-return-date">
              Return date{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Input
              id="vac-return-date"
              type="date"
              value={cfg.vacationMode.returnDate}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  vacationMode: {
                    ...c.vacationMode,
                    returnDate: e.target.value,
                  },
                }))
              }
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Shown to buyers as "back on May 5". Leave blank for an open-ended
              pause.
            </p>
          </div>
          <div>
            <Label htmlFor="vac-message">
              Custom banner message{" "}
              <span className="text-muted-foreground font-normal">
                (optional, overrides default)
              </span>
            </Label>
            <Textarea
              id="vac-message"
              maxLength={280}
              rows={3}
              placeholder={
                cfg.vacationMode.returnDate
                  ? `Canvas Hub is on a research trip — back ${cfg.vacationMode.returnDate}. Bookmark a piece, I'll reach out when I'm back.`
                  : "Canvas Hub is briefly paused — bookmark a piece, I'll reach out when I'm back."
              }
              value={cfg.vacationMode.message}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  vacationMode: {
                    ...c.vacationMode,
                    message: e.target.value.slice(0, 280),
                  },
                }))
              }
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {cfg.vacationMode.message.length}/280 characters. Leave blank to
              use the default phrasing.
            </p>
          </div>
          <label className="flex items-center justify-between gap-3 p-3 bg-background/30 border border-border/40 rounded-md">
            <div>
              <p className="text-sm font-medium">
                Block new orders at checkout
              </p>
              <p className="text-xs text-muted-foreground">
                When on, the API refuses new orders even if a buyer somehow
                bypasses the disabled buttons. Turn off for a soft pause where
                you still want to take orders but warn buyers about delays.
              </p>
            </div>
            <Switch
              checked={cfg.vacationMode.pauseCheckout}
              onCheckedChange={(v) =>
                setCfg((c) => ({
                  ...c,
                  vacationMode: { ...c.vacationMode, pauseCheckout: v },
                }))
              }
            />
          </label>
          <div className="flex justify-end">
            <Button
              onClick={() => void handleSaveVacation()}
              disabled={saving === "vacation"}
            >
              {saving === "vacation" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save vacation settings"
              )}
            </Button>
          </div>
        </div>
      </section>

      {/* Studio reel — optional cinematic video section that lives
          between DailyFeature and the Cinematic Collection scene on
          the homepage. Section renders to nothing on the storefront
          while videoUrl is empty, so this is safe to leave blank
          until the admin uploads a montage. */}
      <section className="bg-card/40 border border-border/60 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-1">
          <Clapperboard className="w-4 h-4 text-primary" />
          <h2 className="font-display text-lg">Studio reel (homepage)</h2>
          {cfg.landingVideo.videoUrl && (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 bg-primary text-primary-foreground text-[10px] font-body tracking-[0.2em] uppercase rounded-sm">
              Live
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Optional autoplay-muted video reel that sits between the daily feature
          and the cinematic "Browse the collection" scene on the homepage. Leave
          the video URL blank to hide the section completely. Looping, muted,
          and lazy-loaded so mobile visitors who never scroll this far never pay
          the bandwidth cost.
        </p>
        <div className="space-y-3">
          <div>
            <Label htmlFor="lv-video-url">Video URL (mp4 / webm)</Label>
            <Input
              id="lv-video-url"
              type="url"
              inputMode="url"
              placeholder="https://your-cdn.com/studio-reel.mp4"
              value={cfg.landingVideo.videoUrl}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  landingVideo: {
                    ...c.landingVideo,
                    videoUrl: e.target.value,
                  },
                }))
              }
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Paste a public URL to a short, silent montage. mp4 (H.264) is the
              safest pick — it plays on every modern browser. Aim for under
              8&nbsp;MB so mobile visitors don't bail. Section is hidden when
              this is empty.
            </p>
          </div>
          <div>
            <Label htmlFor="lv-poster-url">
              Poster image URL{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Input
              id="lv-poster-url"
              type="url"
              inputMode="url"
              placeholder="https://your-cdn.com/studio-reel-poster.jpg"
              value={cfg.landingVideo.posterUrl}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  landingVideo: {
                    ...c.landingVideo,
                    posterUrl: e.target.value,
                  },
                }))
              }
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Shown while the video downloads, and used as the still fallback
              for visitors on prefers-reduced-motion. A frame from the reel
              works perfectly.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="lv-eyebrow">Eyebrow</Label>
              <Input
                id="lv-eyebrow"
                maxLength={80}
                placeholder={DEFAULTS.landingVideo.eyebrow}
                value={cfg.landingVideo.eyebrow}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    landingVideo: {
                      ...c.landingVideo,
                      eyebrow: e.target.value.slice(0, 80),
                    },
                  }))
                }
              />
            </div>
            <div>
              <Label htmlFor="lv-cta-label">CTA label</Label>
              <Input
                id="lv-cta-label"
                maxLength={40}
                placeholder={DEFAULTS.landingVideo.ctaLabel}
                value={cfg.landingVideo.ctaLabel}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    landingVideo: {
                      ...c.landingVideo,
                      ctaLabel: e.target.value.slice(0, 40),
                    },
                  }))
                }
              />
            </div>
          </div>
          <div>
            <Label htmlFor="lv-headline">Headline</Label>
            <Input
              id="lv-headline"
              maxLength={120}
              placeholder={DEFAULTS.landingVideo.headline}
              value={cfg.landingVideo.headline}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  landingVideo: {
                    ...c.landingVideo,
                    headline: e.target.value.slice(0, 120),
                  },
                }))
              }
            />
          </div>
          <div>
            <Label htmlFor="lv-description">
              Description{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Textarea
              id="lv-description"
              maxLength={280}
              rows={3}
              placeholder={DEFAULTS.landingVideo.description}
              value={cfg.landingVideo.description}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  landingVideo: {
                    ...c.landingVideo,
                    description: e.target.value.slice(0, 280),
                  },
                }))
              }
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {cfg.landingVideo.description.length}/280 characters.
            </p>
          </div>
          <div>
            <Label htmlFor="lv-cta-href">CTA destination</Label>
            <Input
              id="lv-cta-href"
              type="text"
              placeholder={DEFAULTS.landingVideo.ctaHref}
              value={cfg.landingVideo.ctaHref}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  landingVideo: {
                    ...c.landingVideo,
                    ctaHref: e.target.value.slice(0, 500),
                  },
                }))
              }
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Storefront path (e.g. <code>/collection</code>) or a full https://
              URL. Anything else is rejected on save.
            </p>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => void handleSaveLandingVideo()}
              disabled={saving === "landing-video"}
            >
              {saving === "landing-video" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save studio reel"
              )}
            </Button>
          </div>
        </div>
      </section>

      {/* Announcement bar */}
      <section className="bg-card/40 border border-border/60 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-1">
          <Megaphone className="w-4 h-4 text-primary" />
          <h2 className="font-display text-lg">Announcement bar</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Shown above the navigation on every page. Use it to promote sales,
          discount codes, or shipping incentives.
        </p>
        <div className="space-y-3">
          <label className="flex items-center justify-between gap-3 p-3 bg-background/30 border border-border/40 rounded-md">
            <div>
              <p className="text-sm font-medium">Show announcement</p>
              <p className="text-xs text-muted-foreground">
                Live banner across the whole site.
              </p>
            </div>
            <Switch
              checked={cfg.announcement.enabled}
              onCheckedChange={(v) =>
                setCfg((c) => ({
                  ...c,
                  announcement: { ...c.announcement, enabled: v },
                }))
              }
            />
          </label>
          <div>
            <Label htmlFor="ann-message">Message</Label>
            <Input
              id="ann-message"
              maxLength={240}
              value={cfg.announcement.message}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  announcement: { ...c.announcement, message: e.target.value },
                }))
              }
              placeholder="Use code SUMMER15 for 15% off — limited time only"
            />
          </div>
          <div>
            <Label htmlFor="ann-link">
              Link{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Input
              id="ann-link"
              type="url"
              maxLength={500}
              value={cfg.announcement.link}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  announcement: { ...c.announcement, link: e.target.value },
                }))
              }
              placeholder="https://example.com or /collection"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ann-bg">Background color</Label>
              <Input
                id="ann-bg"
                type="color"
                value={cfg.announcement.backgroundColor}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    announcement: {
                      ...c.announcement,
                      backgroundColor: e.target.value,
                    },
                  }))
                }
                className="h-10 p-1"
              />
            </div>
            <div>
              <Label htmlFor="ann-text">Text color</Label>
              <Input
                id="ann-text"
                type="color"
                value={cfg.announcement.textColor}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    announcement: {
                      ...c.announcement,
                      textColor: e.target.value,
                    },
                  }))
                }
                className="h-10 p-1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ann-size">Size</Label>
              <select
                id="ann-size"
                value={cfg.announcement.size}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    announcement: {
                      ...c.announcement,
                      size: e.target.value as "compact" | "normal" | "large",
                    },
                  }))
                }
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="compact">Compact</option>
                <option value="normal">Normal</option>
                <option value="large">Large (most readable)</option>
              </select>
            </div>
            <div>
              <Label htmlFor="ann-rotate">
                Rotate every (seconds){" "}
                <span className="text-muted-foreground font-normal">
                  (0 = no rotation)
                </span>
              </Label>
              <Input
                id="ann-rotate"
                type="number"
                min={0}
                max={60}
                value={cfg.announcement.rotateSeconds}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    announcement: {
                      ...c.announcement,
                      rotateSeconds: Math.min(
                        60,
                        Math.max(0, Number(e.target.value) || 0),
                      ),
                    },
                  }))
                }
              />
            </div>
          </div>
          <label className="flex items-center justify-between gap-3 p-3 bg-background/30 border border-border/40 rounded-md">
            <div>
              <p className="text-sm font-medium">Bold text</p>
              <p className="text-xs text-muted-foreground">
                Easier to read on a busy background.
              </p>
            </div>
            <Switch
              checked={cfg.announcement.bold}
              onCheckedChange={(v) =>
                setCfg((c) => ({
                  ...c,
                  announcement: { ...c.announcement, bold: v },
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between gap-3 p-3 bg-background/30 border border-border/40 rounded-md">
            <div>
              <p className="text-sm font-medium">Auto-include free shipping</p>
              <p className="text-xs text-muted-foreground">
                Automatically appends "Free shipping on orders ₱X+" using the
                threshold below.
              </p>
            </div>
            <Switch
              checked={cfg.announcement.showFreeShipping}
              onCheckedChange={(v) =>
                setCfg((c) => ({
                  ...c,
                  announcement: { ...c.announcement, showFreeShipping: v },
                }))
              }
            />
          </label>
          <label className="flex items-center justify-between gap-3 p-3 bg-background/30 border border-border/40 rounded-md">
            <div>
              <p className="text-sm font-medium">Auto-include promo codes</p>
              <p className="text-xs text-muted-foreground">
                Adds every active, non-expired promo to the bar so customers can
                read the code.
              </p>
            </div>
            <Switch
              checked={cfg.announcement.showPromoCodes}
              onCheckedChange={(v) =>
                setCfg((c) => ({
                  ...c,
                  announcement: { ...c.announcement, showPromoCodes: v },
                }))
              }
            />
          </label>
          {cfg.announcement.showPromoCodes && (
            <div>
              <Label htmlFor="ann-promo-template">
                Promo template{" "}
                <span className="text-muted-foreground font-normal">
                  ({"{code}"}, {"{discount}"}, {"{minSpend}"}, {"{description}"}
                  )
                </span>
              </Label>
              <Input
                id="ann-promo-template"
                maxLength={200}
                value={cfg.announcement.promoTemplate}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    announcement: {
                      ...c.announcement,
                      promoTemplate: e.target.value,
                    },
                  }))
                }
                placeholder="Use code {code} for {discount} off{minSpend}"
              />
            </div>
          )}

          {/* Dynamic animation controls */}
          <div className="pt-2 border-t border-border/40 space-y-3">
            <div>
              <Label htmlFor="ann-animation">Animation style</Label>
              <select
                id="ann-animation"
                value={cfg.announcement.animation}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    announcement: {
                      ...c.announcement,
                      animation: e.target.value as AdminAnnouncementAnimation,
                    },
                  }))
                }
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="fade">
                  Fade (rotate messages with a soft fade)
                </option>
                <option value="marquee">
                  Marquee (continuous horizontal scroll)
                </option>
                <option value="slide">
                  Slide-in (each message slides in from the side)
                </option>
                <option value="typewriter">
                  Typewriter (types each message letter-by-letter)
                </option>
                <option value="pulse">
                  Pulse (gently breathes — emphasises a single message)
                </option>
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Marquee &amp; pulse show every line at once. Fade, slide and
                typewriter rotate using the seconds above.
              </p>
            </div>

            {cfg.announcement.animation === "marquee" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="ann-marquee-speed">
                    Scroll duration (seconds per loop)
                  </Label>
                  <Input
                    id="ann-marquee-speed"
                    type="number"
                    min={3}
                    max={120}
                    value={cfg.announcement.marqueeSpeedSeconds}
                    onChange={(e) =>
                      setCfg((c) => ({
                        ...c,
                        announcement: {
                          ...c.announcement,
                          marqueeSpeedSeconds: Math.min(
                            120,
                            Math.max(3, Number(e.target.value) || 18),
                          ),
                        },
                      }))
                    }
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Lower = faster. 12–24s reads naturally.
                  </p>
                </div>
                <div>
                  <Label htmlFor="ann-marquee-dir">Scroll direction</Label>
                  <select
                    id="ann-marquee-dir"
                    value={cfg.announcement.marqueeDirection}
                    onChange={(e) =>
                      setCfg((c) => ({
                        ...c,
                        announcement: {
                          ...c.announcement,
                          marqueeDirection:
                            e.target.value === "right" ? "right" : "left",
                        },
                      }))
                    }
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="left">Right → Left (most common)</option>
                    <option value="right">Left → Right</option>
                  </select>
                </div>
              </div>
            )}

            <label className="flex items-center justify-between gap-3 p-3 bg-background/30 border border-border/40 rounded-md">
              <div>
                <p className="text-sm font-medium">Gradient background</p>
                <p className="text-xs text-muted-foreground">
                  Replaces the solid colour with a horizontal gradient.
                </p>
              </div>
              <Switch
                checked={cfg.announcement.gradientEnabled}
                onCheckedChange={(v) =>
                  setCfg((c) => ({
                    ...c,
                    announcement: { ...c.announcement, gradientEnabled: v },
                  }))
                }
              />
            </label>
            {cfg.announcement.gradientEnabled && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="ann-grad-from">Gradient · from</Label>
                  <Input
                    id="ann-grad-from"
                    type="color"
                    value={cfg.announcement.gradientFrom}
                    onChange={(e) =>
                      setCfg((c) => ({
                        ...c,
                        announcement: {
                          ...c.announcement,
                          gradientFrom: e.target.value,
                        },
                      }))
                    }
                    className="h-10 p-1"
                  />
                </div>
                <div>
                  <Label htmlFor="ann-grad-to">Gradient · to</Label>
                  <Input
                    id="ann-grad-to"
                    type="color"
                    value={cfg.announcement.gradientTo}
                    onChange={(e) =>
                      setCfg((c) => ({
                        ...c,
                        announcement: {
                          ...c.announcement,
                          gradientTo: e.target.value,
                        },
                      }))
                    }
                    className="h-10 p-1"
                  />
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="ann-icon">
                Emoji / icon prefix{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Input
                id="ann-icon"
                maxLength={8}
                value={cfg.announcement.iconPrefix}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    announcement: {
                      ...c.announcement,
                      iconPrefix: e.target.value,
                    },
                  }))
                }
                placeholder="🎨   ✨   🚚"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Prepended to each message — great for drawing attention.
              </p>
            </div>

            <label className="flex items-center justify-between gap-3 p-3 bg-background/30 border border-border/40 rounded-md">
              <div>
                <p className="text-sm font-medium">Customer-dismissable</p>
                <p className="text-xs text-muted-foreground">
                  Adds a small × — the bar reappears automatically when you edit
                  the message.
                </p>
              </div>
              <Switch
                checked={cfg.announcement.dismissable}
                onCheckedChange={(v) =>
                  setCfg((c) => ({
                    ...c,
                    announcement: { ...c.announcement, dismissable: v },
                  }))
                }
              />
            </label>
          </div>

          <AnnouncementPreview cfg={cfg} />
          <div className="flex justify-end">
            <Button
              onClick={() => void handleSaveAnnouncement()}
              disabled={saving === "announcement"}
            >
              {saving === "announcement" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…
                </>
              ) : (
                "Save announcement"
              )}
            </Button>
          </div>
        </div>
      </section>

      {/* Free shipping rule */}
      <FreeShippingRuleSection
        freeShipping={cfg.freeShipping}
        onChange={(next) =>
          setCfg((c) => ({
            ...c,
            freeShipping: { ...c.freeShipping, ...next },
          }))
        }
        onReset={() =>
          setCfg((c) => ({
            ...c,
            freeShipping: { ...DEFAULTS.freeShipping },
          }))
        }
        onSave={() => void handleSaveShipping()}
        saving={saving === "shipping"}
        previewSubtotal={previewSubtotal}
        onPreviewSubtotalChange={setPreviewSubtotal}
      />

      {/* Distance-based Lalamove fare estimate */}
      <LalamoveFareSection
        lalamoveFare={cfg.lalamoveFare}
        onChange={(next) =>
          setCfg((c) => ({
            ...c,
            lalamoveFare: { ...c.lalamoveFare, ...next },
          }))
        }
        onReset={() =>
          setCfg((c) => ({
            ...c,
            lalamoveFare: { ...DEFAULTS.lalamoveFare },
          }))
        }
        onSave={() => void handleSaveLalamoveFare()}
        saving={saving === "lalamove-fare"}
      />

      {/* Per-courier × per-zone shipping rates */}
      <section className="bg-card/40 border border-border/60 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-1">
          <PackageOpen className="w-4 h-4 text-primary" />
          <h2 className="font-display text-lg">Per-courier shipping rates</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Customers pick a courier at checkout and the fee auto-fills based on
          their region's zone. The free-shipping threshold above still applies
          on top — orders over the threshold ship free regardless of courier.
        </p>

        {cfg.shippingRates.length === 0 ? (
          <p className="text-xs text-muted-foreground p-3 bg-background/30 border border-border/40 rounded-md mb-3">
            No couriers configured. Add one below to start charging per-courier
            rates; until then checkout falls back to the flat shipping fee
            above.
          </p>
        ) : (
          <ScrollableTable edgeBleed bordered={false} className="mb-3">
            <table className="w-full text-xs border-separate border-spacing-y-1.5 min-w-[640px]">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left font-medium px-2 py-1.5">Courier</th>
                  {SHIPPING_ZONES.map((z) => (
                    <th
                      key={z.id}
                      className="text-left font-medium px-2 py-1.5"
                    >
                      {z.label} (₱)
                    </th>
                  ))}
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {cfg.shippingRates.map((row) => (
                  <tr key={row.courierId} className="bg-background/40">
                    <td className="px-2 py-1.5 align-middle">
                      <Input
                        value={row.courierLabel}
                        onChange={(e) =>
                          updateShippingRateRow(row.courierId, {
                            courierLabel: e.target.value.slice(0, 60),
                          })
                        }
                        className="h-8 text-xs"
                      />
                      <p className="text-[10px] text-muted-foreground mt-0.5 break-all">
                        id: {row.courierId}
                      </p>
                    </td>
                    {SHIPPING_ZONES.map((z) => (
                      <td key={z.id} className="px-2 py-1.5 align-middle">
                        <Input
                          type="number"
                          min={0}
                          step={10}
                          value={row.fees[z.id] ?? 0}
                          onChange={(e) =>
                            updateShippingRateRow(row.courierId, {
                              fees: {
                                [z.id]: Math.max(
                                  0,
                                  Math.floor(Number(e.target.value) || 0),
                                ),
                              },
                            })
                          }
                          className="h-8 text-xs w-24"
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1.5 align-middle text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => removeShippingRateRow(row.courierId)}
                        aria-label={`Remove ${row.courierLabel}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
        )}

        {(() => {
          const remaining = COURIERS.filter(
            (c) =>
              c.id !== "other" &&
              !cfg.shippingRates.some((r) => r.courierId === c.id),
          );
          if (remaining.length === 0) return null;
          return (
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="text-xs text-muted-foreground self-center mr-1">
                Add courier:
              </span>
              {remaining.map((c) => (
                <Button
                  key={c.id}
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() =>
                    addShippingRateRow({ id: c.id, label: c.label })
                  }
                >
                  <Plus className="w-3 h-3 mr-1" />
                  {c.label}
                </Button>
              ))}
            </div>
          );
        })()}

        <div className="flex justify-end">
          <Button
            onClick={() => void handleSaveShippingRates()}
            disabled={saving === "shipping-rates"}
          >
            {saving === "shipping-rates" ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…
              </>
            ) : (
              "Save shipping rates"
            )}
          </Button>
        </div>
      </section>

      {/* Promo codes */}
      <section className="bg-card/40 border border-border/60 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-1">
          <Tag className="w-4 h-4 text-primary" />
          <h2 className="font-display text-lg">Promo / discount codes</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Customers redeem these at checkout. Pick a discount type — percent
          off, fixed peso off, a flat order price (e.g. any cart for ₱1), or
          free shipping — set an optional minimum spend, expiry, and usage cap.
          Non-shipping codes can also grant free shipping on top.
        </p>

        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <div>
            <Label htmlFor="promo-code">Code</Label>
            <Input
              id="promo-code"
              value={promoCode}
              onChange={(e) =>
                setPromoCode(e.target.value.toUpperCase().slice(0, 30))
              }
              placeholder="SUMMER15"
            />
          </div>
          <div>
            <Label htmlFor="promo-type">Type</Label>
            <select
              id="promo-type"
              value={promoType}
              onChange={(e) => setPromoType(e.target.value as AdminPromoType)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="percent">Percent off (%)</option>
              <option value="fixed">Fixed amount off (₱)</option>
              <option value="flat">Flat order price (₱)</option>
              <option value="free_shipping">Free shipping</option>
            </select>
          </div>
          {promoType !== "free_shipping" && (
            <div>
              <Label htmlFor="promo-value">
                {promoType === "percent"
                  ? "Percent (1–100)"
                  : promoType === "flat"
                    ? "Flat order price (₱)"
                    : "Amount (₱)"}
              </Label>
              <Input
                id="promo-value"
                type="number"
                min={promoType === "flat" ? 0 : 1}
                max={promoType === "percent" ? 100 : undefined}
                value={promoValue}
                onChange={(e) => setPromoValue(e.target.value)}
                placeholder={
                  promoType === "percent"
                    ? "15"
                    : promoType === "flat"
                      ? "1"
                      : "500"
                }
              />
              {promoType === "flat" && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Customer pays this exact amount instead of the cart subtotal.
                </p>
              )}
            </div>
          )}
          <div>
            <Label htmlFor="promo-min">
              Minimum spend (₱){" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Input
              id="promo-min"
              type="number"
              min={0}
              value={promoMinSpend}
              onChange={(e) => setPromoMinSpend(e.target.value)}
              placeholder="2500"
            />
          </div>
          <div>
            <Label htmlFor="promo-cap">
              Total usage limit{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Input
              id="promo-cap"
              type="number"
              min={0}
              value={promoUsageLimit}
              onChange={(e) => setPromoUsageLimit(e.target.value)}
              placeholder="100"
            />
          </div>
          <div>
            <Label htmlFor="promo-per-customer">
              Max uses per customer{" "}
              <span className="text-muted-foreground font-normal">
                (0 = unlimited)
              </span>
            </Label>
            <Input
              id="promo-per-customer"
              type="number"
              min={0}
              value={promoMaxPerCustomer}
              onChange={(e) => setPromoMaxPerCustomer(e.target.value)}
              placeholder="1"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Enforced against the D1 redemption ledger at checkout. Requires
              the D1 binding + 0003_coupons migration to apply.
            </p>
          </div>
          <div>
            <Label htmlFor="promo-expires">
              Expires{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Input
              id="promo-expires"
              type="datetime-local"
              value={promoExpiresAt}
              onChange={(e) => setPromoExpiresAt(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="promo-desc">
              Internal description{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Input
              id="promo-desc"
              maxLength={200}
              value={promoDescription}
              onChange={(e) => setPromoDescription(e.target.value)}
              placeholder="Summer launch coupon"
            />
          </div>
          {promoType !== "free_shipping" && (
            <div className="sm:col-span-2 flex items-center justify-between gap-3 p-3 rounded-md bg-background/40 border border-border/40">
              <div>
                <Label className="text-sm">Also grants free shipping</Label>
                <p className="text-xs text-muted-foreground">
                  Stack free shipping on top of the discount above.
                </p>
              </div>
              <Switch
                checked={promoFreeShipping}
                onCheckedChange={setPromoFreeShipping}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end mb-6">
          <Button
            onClick={() => void handleAddPromo()}
            disabled={saving === "promo"}
          >
            {saving === "promo" ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" /> Add / update promo
              </>
            )}
          </Button>
        </div>

        {cfg.promoCodes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border/40 rounded-md">
            No promo codes yet. Customers won't see a coupon field at checkout.
          </p>
        ) : (
          <ul className="space-y-2">
            {cfg.promoCodes.map((p) => {
              // Read-once expiry check. Refactoring into useMemo just to
              // satisfy react-hooks/purity would add memo churn with no
              // behavioural benefit.
              const expired =
                // eslint-disable-next-line react-hooks/purity
                p.expiresAt && new Date(p.expiresAt).getTime() < Date.now();
              const used =
                p.usageLimit !== null && p.usageCount >= p.usageLimit;
              return (
                <li
                  key={p.code}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-background/30 border border-border/40 rounded-md"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-sm">
                        {p.code}
                      </span>
                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-muted rounded">
                        {formatPromoBadge(p)}
                      </span>
                      {p.type !== "free_shipping" && p.freeShipping && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-primary/15 text-primary rounded">
                          + free shipping
                        </span>
                      )}
                      {p.minSpend > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          min ₱{p.minSpend.toLocaleString()}
                        </span>
                      )}
                      {(p.maxRedemptionsPerCustomer ?? 0) > 0 && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-muted rounded">
                          {p.maxRedemptionsPerCustomer}× per customer
                        </span>
                      )}
                      {!p.enabled && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-muted-foreground/20 rounded">
                          Disabled
                        </span>
                      )}
                      {expired && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-destructive/15 text-destructive rounded">
                          Expired
                        </span>
                      )}
                      {used && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-destructive/15 text-destructive rounded">
                          Limit reached
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {p.description ||
                        (p.expiresAt
                          ? `Expires ${new Date(p.expiresAt).toLocaleString()}`
                          : "No expiry")}
                      {p.usageLimit !== null
                        ? ` · ${p.usageCount}/${p.usageLimit} used`
                        : ` · ${p.usageCount} uses`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={p.enabled}
                      onCheckedChange={() => void handleTogglePromo(p)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => void handleDeletePromo(p.code)}
                      aria-label={`Delete ${p.code}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Chat widget FAQs */}
      <section className="bg-card/40 border border-border/60 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-1">
          <MessageSquare className="w-4 h-4 text-primary" />
          <h2 className="text-base font-semibold">Chat widget & FAQs</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Customers see these quick topics the moment they open the chat bubble.
          Each topic shows an instant answer, plus an option to reach a live
          agent.
        </p>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 p-3 rounded-md bg-background/40 border border-border/40">
            <div>
              <Label className="text-sm">Chat bubble enabled</Label>
              <p className="text-xs text-muted-foreground">
                Turn the customer-facing chat widget on or off.
              </p>
            </div>
            <Switch
              checked={cfg.chat.enabled}
              onCheckedChange={(v) =>
                setCfg((c) => ({ ...c, chat: { ...c.chat, enabled: v } }))
              }
            />
          </div>

          <div className="flex items-center justify-between gap-4 p-3 rounded-md bg-background/40 border border-border/40">
            <div>
              <Label className="text-sm">Allow live-agent handoff</Label>
              <p className="text-xs text-muted-foreground">
                Shows a &ldquo;Talk to a live agent&rdquo; button below the FAQ
                list.
              </p>
            </div>
            <Switch
              checked={cfg.chat.agentHandoff}
              onCheckedChange={(v) =>
                setCfg((c) => ({
                  ...c,
                  chat: { ...c.chat, agentHandoff: v },
                }))
              }
            />
          </div>

          {/* Groq AI auto-reply.
              Off by default. When enabled, the customer's first message in
              a thread (and any follow-up where you haven't replied in the
              last 5 minutes) gets routed to Groq's free Llama 3.3 model.
              The bundled system prompt grounds replies in the FAQ list +
              live product catalogue. If the model can't answer
              confidently, or the customer asks for a human, the thread
              shows up here with a "needs you" badge instead. Requires a
              free GROQ_API_KEY in the Cloudflare Pages env vars (see
              README "Configuring environment variables"). */}
          <div className="rounded-md bg-background/40 border border-border/40 p-3 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-sm flex items-center gap-2">
                  AI auto-reply
                  <span className="text-[9px] uppercase tracking-wide rounded-sm bg-accent/40 text-foreground px-1 py-px font-medium">
                    Beta
                  </span>
                </Label>
                <p className="text-xs text-muted-foreground">
                  Free Groq Llama 3.3 70B answers customer chat messages using
                  your FAQs + product catalogue. Needs{" "}
                  <code className="text-[11px]">GROQ_API_KEY</code> in Pages
                  env.
                </p>
              </div>
              <Switch
                checked={cfg.chat.ai.enabled}
                onCheckedChange={(v) =>
                  setCfg((c) => ({
                    ...c,
                    chat: { ...c.chat, ai: { ...c.chat.ai, enabled: v } },
                  }))
                }
              />
            </div>

            {cfg.chat.ai.enabled && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    System prompt override (optional)
                  </Label>
                  <Textarea
                    value={cfg.chat.ai.systemPrompt}
                    maxLength={4000}
                    onChange={(e) =>
                      setCfg((c) => ({
                        ...c,
                        chat: {
                          ...c.chat,
                          ai: {
                            ...c.chat.ai,
                            systemPrompt: e.target.value,
                          },
                        },
                      }))
                    }
                    placeholder="Leave blank to use the default canvhub assistant prompt. Override here to change the AI's tone or persona."
                    className="min-h-[88px] text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Extra &ldquo;send to human&rdquo; keywords
                  </Label>
                  <Input
                    value={cfg.chat.ai.handoffKeywords.join(", ")}
                    onChange={(e) =>
                      setCfg((c) => ({
                        ...c,
                        chat: {
                          ...c.chat,
                          ai: {
                            ...c.chat.ai,
                            handoffKeywords: e.target.value
                              .split(",")
                              .map((s) => s.trim()),
                          },
                        },
                      }))
                    }
                    placeholder="e.g. refund, complaint, urgent"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Comma-separated. If a customer message contains any of
                    these, the AI steps aside and the thread waits for you.
                    Defaults (human, agent, manager, &ldquo;real person&rdquo;,
                    &hellip;) are always applied on top.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Model override (optional)</Label>
                  <Input
                    value={cfg.chat.ai.model}
                    maxLength={80}
                    onChange={(e) =>
                      setCfg((c) => ({
                        ...c,
                        chat: {
                          ...c.chat,
                          ai: { ...c.chat.ai, model: e.target.value },
                        },
                      }))
                    }
                    placeholder="llama-3.3-70b-versatile (default)"
                  />
                </div>
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Welcome message</Label>
            <Input
              value={cfg.chat.welcome}
              maxLength={200}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  chat: { ...c.chat, welcome: e.target.value },
                }))
              }
              placeholder={DEFAULT_CHAT_WELCOME}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">
                Quick topics ({cfg.chat.faqs.length}/{CHAT_FAQ_MAX})
              </Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={resetFaqsToDefaults}
                  className="text-xs"
                >
                  Reset to defaults
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addFaq}
                  disabled={cfg.chat.faqs.length >= CHAT_FAQ_MAX}
                  className="gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add topic
                </Button>
              </div>
            </div>

            {cfg.chat.faqs.length === 0 ? (
              <p className="text-xs text-muted-foreground italic px-1">
                No topics yet. Add a few common questions so shoppers can
                self-serve before pinging you.
              </p>
            ) : (
              <div className="space-y-3">
                {cfg.chat.faqs.map((faq, idx) => (
                  <div
                    key={`${faq.id}-${idx}`}
                    className="space-y-2 p-3 rounded-md bg-background/40 border border-border/40"
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-2">
                        <Input
                          value={faq.question}
                          onChange={(e) =>
                            updateFaq(idx, { question: e.target.value })
                          }
                          maxLength={CHAT_FAQ_QUESTION_MAX}
                          placeholder="e.g. Shipping & delivery"
                        />
                        <Textarea
                          value={faq.answer}
                          onChange={(e) =>
                            updateFaq(idx, { answer: e.target.value })
                          }
                          maxLength={CHAT_FAQ_ANSWER_MAX}
                          placeholder="The auto-reply shown when someone taps this topic."
                          className="min-h-[88px] text-sm"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                        onClick={() => removeFaq(idx)}
                        aria-label="Remove topic"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => void handleSaveChat()}
              disabled={saving === "chat"}
            >
              {saving === "chat" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save chat settings"
              )}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function AnnouncementPreview({ cfg }: { cfg: AdminConfig }) {
  const messages: string[] = [];
  const main = cfg.announcement.message.trim();
  if (main) messages.push(main);
  if (
    cfg.announcement.showFreeShipping &&
    cfg.freeShipping.enabled &&
    cfg.freeShipping.threshold > 0
  ) {
    messages.push(
      `Free shipping on orders ₱${cfg.freeShipping.threshold.toLocaleString()}+`,
    );
  }
  if (cfg.announcement.showPromoCodes) {
    const tpl =
      cfg.announcement.promoTemplate ||
      "Use code {code} for {discount} off{minSpend}";
    cfg.promoCodes
      .filter((p) => p.enabled)
      .filter((p) => p.usageLimit === null || p.usageCount < p.usageLimit)
      .filter(
        (p) =>
          !p.expiresAt ||
          // Read-once expiry check inside the announcement-bar preview path.
          // eslint-disable-next-line react-hooks/purity
          new Date(p.expiresAt).getTime() >= Date.now(),
      )
      .forEach((p) => {
        const line = formatPromoLine(tpl, p);
        if (line) messages.push(line);
      });
  }

  const animation = cfg.announcement.animation;
  const supportsRotation =
    animation === "fade" || animation === "slide" || animation === "typewriter";
  const actuallyRotating =
    supportsRotation &&
    cfg.announcement.rotateSeconds > 0 &&
    messages.length > 1;

  const [previewIdx, setPreviewIdx] = useState(0);
  useEffect(() => {
    setPreviewIdx(0);
  }, [messages.length, animation]);
  useEffect(() => {
    if (!actuallyRotating) return;
    const id = window.setInterval(() => {
      setPreviewIdx((i) => (i + 1) % messages.length);
    }, cfg.announcement.rotateSeconds * 1000);
    return () => window.clearInterval(id);
  }, [actuallyRotating, cfg.announcement.rotateSeconds, messages.length]);

  const sizeCls = sizeClassMap[cfg.announcement.size] || sizeClassMap.normal;
  const weightCls = cfg.announcement.bold ? "font-semibold" : "font-medium";
  const prefix = cfg.announcement.iconPrefix.trim();
  const decorate = (t: string) => (prefix ? `${prefix} ${t}` : t);

  const wrapperStyle: React.CSSProperties = {
    color: cfg.announcement.textColor,
    ...(cfg.announcement.gradientEnabled
      ? {
          backgroundImage: `linear-gradient(90deg, ${cfg.announcement.gradientFrom}, ${cfg.announcement.gradientTo})`,
          backgroundColor: cfg.announcement.gradientFrom,
        }
      : { backgroundColor: cfg.announcement.backgroundColor }),
  };

  let body: React.ReactNode;
  if (messages.length === 0) {
    body = (
      <span className={`${weightCls} tracking-wide`}>
        Live preview — write a message above
      </span>
    );
  } else if (animation === "marquee") {
    const joined = messages.map(decorate).join("    ·    ");
    const trackStyle: React.CSSProperties = {
      ["--ann-duration" as string]: `${cfg.announcement.marqueeSpeedSeconds}s`,
    };
    body = (
      <div className="announcement-marquee w-full">
        <div
          className={`announcement-marquee-track ${weightCls} tracking-wide`}
          data-direction={cfg.announcement.marqueeDirection}
          style={trackStyle}
        >
          <span>{joined}</span>
          <span aria-hidden="true">{joined}</span>
        </div>
      </div>
    );
  } else if (animation === "pulse") {
    body = (
      <span className={`announcement-pulse ${weightCls} tracking-wide`}>
        {messages.map(decorate).join(" · ")}
      </span>
    );
  } else if (animation === "typewriter") {
    const text = actuallyRotating
      ? decorate(messages[previewIdx] ?? "")
      : messages.map(decorate).join(" · ");
    const dur = Math.max(
      1.2,
      Math.min(8, (cfg.announcement.rotateSeconds || 4) * 0.6),
    );
    const typeStyle: React.CSSProperties = {
      ["--ann-type-duration" as string]: `${dur}s`,
    };
    body = (
      <span
        key={actuallyRotating ? `tw-${previewIdx}-${text}` : "tw-all"}
        className={`announcement-typewriter ${weightCls} tracking-wide`}
        style={typeStyle}
      >
        {text}
      </span>
    );
  } else if (animation === "slide") {
    const text = actuallyRotating
      ? decorate(messages[previewIdx] ?? "")
      : messages.map(decorate).join(" · ");
    body = (
      <span
        key={actuallyRotating ? `sl-${previewIdx}` : "sl-all"}
        className={`announcement-slide ${weightCls} tracking-wide`}
      >
        {text}
      </span>
    );
  } else {
    const text = actuallyRotating
      ? decorate(messages[previewIdx] ?? "")
      : messages.map(decorate).join(" · ");
    body = (
      <span
        key={actuallyRotating ? `fd-${previewIdx}` : "fd-all"}
        className={`announcement-fade ${weightCls} tracking-wide`}
      >
        {text}
      </span>
    );
  }

  const isMarquee = animation === "marquee";

  return (
    <div className="space-y-2">
      <div
        className={`relative rounded-md tracking-wide ${
          isMarquee ? "px-0" : "text-center px-4"
        } ${sizeCls}`}
        style={wrapperStyle}
      >
        {isMarquee ? <div className="px-4">{body}</div> : body}
      </div>
      <p className="text-xs text-muted-foreground">
        {messages.length === 0
          ? "Live preview updates as you edit."
          : isMarquee
            ? `Marquee · ${messages.length} message${messages.length === 1 ? "" : "s"} scrolling continuously (hover to pause).`
            : animation === "pulse"
              ? `Pulse · ${messages.length} message${messages.length === 1 ? "" : "s"} joined and pulsing.`
              : actuallyRotating
                ? `Rotating ${messages.length} messages every ${cfg.announcement.rotateSeconds}s.`
                : `Showing ${messages.length} message${messages.length === 1 ? "" : "s"} joined together. Set rotate seconds > 0 to cycle them.`}
      </p>
    </div>
  );
}
