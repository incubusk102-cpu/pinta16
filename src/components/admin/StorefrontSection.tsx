import { useEffect, useState } from "react";
import { Megaphone, Truck, Tag, Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useStorefrontConfig } from "@/contexts/StorefrontConfigContext";
import { toast } from "sonner";

interface AdminPromo {
  code: string;
  type: "percent" | "fixed";
  value: number;
  minSpend: number;
  usageLimit: number | null;
  usageCount: number;
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
    p.type === "percent" ? `${p.value}%` : `₱${p.value.toLocaleString()}`;
  const minSpend =
    p.minSpend > 0 ? ` orders ₱${p.minSpend.toLocaleString()}+` : "";
  return template
    .replace(/\{code\}/g, p.code)
    .replace(/\{discount\}/g, discount)
    .replace(/\{minSpend\}/g, minSpend)
    .replace(/\{description\}/g, p.description || "")
    .trim();
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
  promoCodes: AdminPromo[];
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
  promoCodes: [],
};

export function StorefrontSection() {
  const { token } = useAdminAuth();
  const { refresh } = useStorefrontConfig();
  const [cfg, setCfg] = useState<AdminConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<
    null | "announcement" | "shipping" | "promo"
  >(null);

  // Promo form state
  const [promoCode, setPromoCode] = useState("");
  const [promoType, setPromoType] = useState<"percent" | "fixed">("percent");
  const [promoValue, setPromoValue] = useState("");
  const [promoMinSpend, setPromoMinSpend] = useState("");
  const [promoUsageLimit, setPromoUsageLimit] = useState("");
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
        setCfg({
          announcement: {
            ...DEFAULTS.announcement,
            ...data.config.announcement,
          },
          freeShipping: {
            ...DEFAULTS.freeShipping,
            ...data.config.freeShipping,
          },
          promoCodes: Array.isArray(data.config.promoCodes)
            ? data.config.promoCodes
            : [],
        });
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
      setCfg(data.config as AdminConfig);
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

  const handleAddPromo = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) return toast.error("Code required");
    const value = Number(promoValue);
    if (!value || value <= 0) return toast.error("Discount value must be > 0");
    if (promoType === "percent" && value > 100)
      return toast.error("Percent must be 1–100");
    setSaving("promo");
    try {
      await post({
        action: "upsert-promo",
        promo: {
          code,
          type: promoType,
          value,
          minSpend: Number(promoMinSpend) || 0,
          usageLimit: promoUsageLimit ? Number(promoUsageLimit) : null,
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
      setPromoMinSpend("");
      setPromoUsageLimit("");
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
              placeholder="https://example.com or /#gallery"
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
      <section className="bg-card/40 border border-border/60 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-1">
          <Truck className="w-4 h-4 text-primary" />
          <h2 className="font-display text-lg">
            Shipping & free-shipping rule
          </h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Customers see "₱X away from free shipping" in the cart and the
          announcement bar reflects this threshold dynamically.
        </p>
        <div className="space-y-3">
          <label className="flex items-center justify-between gap-3 p-3 bg-background/30 border border-border/40 rounded-md">
            <div>
              <p className="text-sm font-medium">Offer free shipping</p>
              <p className="text-xs text-muted-foreground">
                Above the threshold, shipping fee is waived.
              </p>
            </div>
            <Switch
              checked={cfg.freeShipping.enabled}
              onCheckedChange={(v) =>
                setCfg((c) => ({
                  ...c,
                  freeShipping: { ...c.freeShipping, enabled: v },
                }))
              }
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="fs-threshold">
                Free-shipping minimum spend (₱)
              </Label>
              <Input
                id="fs-threshold"
                type="number"
                min={0}
                step={100}
                value={cfg.freeShipping.threshold}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    freeShipping: {
                      ...c.freeShipping,
                      threshold: Number(e.target.value) || 0,
                    },
                  }))
                }
              />
            </div>
            <div>
              <Label htmlFor="fs-fee">Shipping fee (₱)</Label>
              <Input
                id="fs-fee"
                type="number"
                min={0}
                step={50}
                value={cfg.freeShipping.shippingFee}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    freeShipping: {
                      ...c.freeShipping,
                      shippingFee: Number(e.target.value) || 0,
                    },
                  }))
                }
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => void handleSaveShipping()}
              disabled={saving === "shipping"}
            >
              {saving === "shipping" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…
                </>
              ) : (
                "Save shipping rule"
              )}
            </Button>
          </div>
        </div>
      </section>

      {/* Promo codes */}
      <section className="bg-card/40 border border-border/60 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-1">
          <Tag className="w-4 h-4 text-primary" />
          <h2 className="font-display text-lg">Promo / discount codes</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Customers redeem these at checkout. Pick a percent or fixed-peso
          discount, set a minimum spend, optional expiry, and optional usage
          cap.
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
              onChange={(e) =>
                setPromoType(e.target.value as "percent" | "fixed")
              }
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="percent">Percent off (%)</option>
              <option value="fixed">Fixed amount off (₱)</option>
            </select>
          </div>
          <div>
            <Label htmlFor="promo-value">
              {promoType === "percent" ? "Percent (1–100)" : "Amount (₱)"}
            </Label>
            <Input
              id="promo-value"
              type="number"
              min={1}
              max={promoType === "percent" ? 100 : undefined}
              value={promoValue}
              onChange={(e) => setPromoValue(e.target.value)}
              placeholder={promoType === "percent" ? "15" : "500"}
            />
          </div>
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
              const expired =
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
                        {p.type === "percent"
                          ? `${p.value}% off`
                          : `₱${p.value.toLocaleString()} off`}
                      </span>
                      {p.minSpend > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          min ₱{p.minSpend.toLocaleString()}
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
        (p) => !p.expiresAt || new Date(p.expiresAt).getTime() >= Date.now(),
      )
      .forEach((p) => {
        const line = formatPromoLine(tpl, p);
        if (line) messages.push(line);
      });
  }

  const animation = cfg.announcement.animation;
  const rotates =
    animation === "fade" || animation === "slide" || animation === "typewriter";

  const [previewIdx, setPreviewIdx] = useState(0);
  useEffect(() => {
    setPreviewIdx(0);
  }, [messages.length, animation]);
  useEffect(() => {
    if (!rotates) return;
    if (cfg.announcement.rotateSeconds <= 0) return;
    if (messages.length <= 1) return;
    const id = window.setInterval(() => {
      setPreviewIdx((i) => (i + 1) % messages.length);
    }, cfg.announcement.rotateSeconds * 1000);
    return () => window.clearInterval(id);
  }, [cfg.announcement.rotateSeconds, messages.length, rotates]);

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
    const text = decorate(messages[previewIdx] ?? "");
    const dur = Math.max(
      1.2,
      Math.min(8, (cfg.announcement.rotateSeconds || 4) * 0.6),
    );
    const typeStyle: React.CSSProperties = {
      ["--ann-type-duration" as string]: `${dur}s`,
    };
    body = (
      <span
        key={`tw-${previewIdx}-${text}`}
        className={`announcement-typewriter ${weightCls} tracking-wide`}
        style={typeStyle}
      >
        {text}
      </span>
    );
  } else if (animation === "slide") {
    body = (
      <span
        key={`sl-${previewIdx}`}
        className={`announcement-slide ${weightCls} tracking-wide`}
      >
        {decorate(messages[previewIdx] ?? "")}
      </span>
    );
  } else {
    const text = rotates
      ? decorate(messages[previewIdx] ?? "")
      : messages.map(decorate).join(" · ");
    body = (
      <span
        key={rotates ? `fd-${previewIdx}` : "all"}
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
              : rotates && messages.length > 1
                ? `Rotating ${messages.length} messages every ${cfg.announcement.rotateSeconds}s.`
                : `Showing ${messages.length} message${messages.length === 1 ? "" : "s"}.`}
      </p>
    </div>
  );
}
