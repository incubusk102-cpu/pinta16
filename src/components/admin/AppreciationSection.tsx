import { useEffect, useMemo, useState } from "react";
import { Heart, Loader2, Save, Sparkles } from "lucide-react";
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
import {
  DEFAULT_DAILY_FEATURE,
  DEFAULT_THANK_YOU,
  type DailyFeatureConfig,
  type ThankYouConfig,
  useStorefrontConfig,
} from "@/contexts/StorefrontConfigContext";
import { useProducts } from "@/contexts/ProductContext";
import { defaultArtworks } from "@/lib/artworks";

const NONE = "__none__";

interface AdminConfigPayload {
  config?: {
    dailyFeature?: DailyFeatureConfig;
    thankYou?: ThankYouConfig;
  };
}

export function AppreciationSection() {
  const { token } = useAdminAuth();
  const { config, refresh } = useStorefrontConfig();
  const { products } = useProducts();
  const [daily, setDaily] = useState<DailyFeatureConfig>(DEFAULT_DAILY_FEATURE);
  const [thankYou, setThankYou] = useState<ThankYouConfig>(DEFAULT_THANK_YOU);
  const [loading, setLoading] = useState(true);
  const [savingDaily, setSavingDaily] = useState(false);
  const [savingThankYou, setSavingThankYou] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/storefront-config?admin=1", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as AdminConfigPayload;
        if (cancelled) return;
        if (data.config?.dailyFeature) {
          setDaily({ ...DEFAULT_DAILY_FEATURE, ...data.config.dailyFeature });
        }
        if (data.config?.thankYou) {
          setThankYou({ ...DEFAULT_THANK_YOU, ...data.config.thankYou });
        }
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Failed to load appreciation config",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const productOptions = useMemo(() => {
    const stockOpts = defaultArtworks.map((a) => ({
      id: a.id,
      label: `${a.title} · stock`,
    }));
    const customOpts = products
      .filter((p) => !p.replacesDefaultId)
      .map((p) => ({
        id: `product-${p.id}`,
        label: `${p.title} · uploaded`,
      }));
    return [...customOpts, ...stockOpts];
  }, [products]);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/storefront-config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as AdminConfigPayload & {
      error?: string;
    };
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (data.config?.dailyFeature) {
      setDaily({ ...DEFAULT_DAILY_FEATURE, ...data.config.dailyFeature });
    }
    if (data.config?.thankYou) {
      setThankYou({ ...DEFAULT_THANK_YOU, ...data.config.thankYou });
    }
    await refresh();
    return data;
  };

  const saveDaily = async () => {
    setSavingDaily(true);
    try {
      await post({
        action: "update-daily-feature",
        dailyFeature: daily,
      });
      toast.success("Daily feature updated");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to save daily feature",
      );
    } finally {
      setSavingDaily(false);
    }
  };

  const saveThankYou = async () => {
    setSavingThankYou(true);
    try {
      await post({
        action: "update-thank-you",
        thankYou,
      });
      toast.success("Thank-you note updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save thank-you");
    } finally {
      setSavingThankYou(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }

  const today = config.dailyFeatureToday;

  return (
    <div className="space-y-10 max-w-3xl">
      {/* Daily featured artwork */}
      <section className="rounded-md border border-border bg-card/50 p-5 md:p-6 space-y-5">
        <header className="flex items-start gap-3">
          <div className="shrink-0 w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-amber-700 dark:text-amber-200" />
          </div>
          <div>
            <h3 className="font-display text-lg text-foreground">
              Piece of the day
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Pick one artwork to spotlight on the homepage. A unique{" "}
              <code className="font-mono">DAILY{"{YYYYMMDD}"}</code> code is
              generated automatically and only valid for the current UTC day.
            </p>
          </div>
        </header>

        <div className="grid gap-4">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="daily-enabled" className="text-sm">
              Show on homepage
            </Label>
            <Switch
              id="daily-enabled"
              checked={daily.enabled}
              onCheckedChange={(v) => setDaily((d) => ({ ...d, enabled: v }))}
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Featured artwork
            </Label>
            <Select
              value={daily.productId || NONE}
              onValueChange={(v) =>
                setDaily((d) => ({ ...d, productId: v === NONE ? "" : v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an artwork" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No selection</SelectItem>
                {productOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label
                htmlFor="daily-percent"
                className="text-xs uppercase tracking-[0.18em] text-muted-foreground"
              >
                Discount %
              </Label>
              <Input
                id="daily-percent"
                type="number"
                min={1}
                max={50}
                value={daily.percent}
                onChange={(e) =>
                  setDaily((d) => ({
                    ...d,
                    percent: Math.min(
                      50,
                      Math.max(1, Math.floor(Number(e.target.value) || 1)),
                    ),
                  }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label
                htmlFor="daily-headline"
                className="text-xs uppercase tracking-[0.18em] text-muted-foreground"
              >
                Section headline
              </Label>
              <Input
                id="daily-headline"
                value={daily.headline}
                maxLength={80}
                onChange={(e) =>
                  setDaily((d) => ({ ...d, headline: e.target.value }))
                }
              />
            </div>
          </div>

          {today && daily.enabled && daily.productId && (
            <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200">
              Today's auto code:{" "}
              <code className="font-mono tracking-[0.18em] font-semibold">
                {today.code}
              </code>{" "}
              · {today.percent}% off · expires{" "}
              {new Date(today.expiresAt).toLocaleString()}
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={saveDaily} disabled={savingDaily}>
              {savingDaily ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save daily feature
            </Button>
          </div>
        </div>
      </section>

      {/* Artist thank-you */}
      <section className="rounded-md border border-border bg-card/50 p-5 md:p-6 space-y-5">
        <header className="flex items-start gap-3">
          <div className="shrink-0 w-9 h-9 rounded-full bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center">
            <Heart className="w-4 h-4 text-rose-700 dark:text-rose-200" />
          </div>
          <div>
            <h3 className="font-display text-lg text-foreground">
              Artist thank-you note
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Auto-plays once in a polished modal after the visitor's first paid
              order. Paste a hosted image or video URL — keep it short (10–20s
              for video).
            </p>
          </div>
        </header>

        <div className="grid gap-4">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="thankyou-enabled" className="text-sm">
              Enable thank-you modal
            </Label>
            <Switch
              id="thankyou-enabled"
              checked={thankYou.enabled}
              onCheckedChange={(v) =>
                setThankYou((t) => ({ ...t, enabled: v }))
              }
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 grid gap-1.5">
              <Label
                htmlFor="thankyou-asset"
                className="text-xs uppercase tracking-[0.18em] text-muted-foreground"
              >
                Asset URL
              </Label>
              <Input
                id="thankyou-asset"
                placeholder="https://… (image .jpg/.png or video .mp4)"
                value={thankYou.assetUrl}
                onChange={(e) =>
                  setThankYou((t) => ({ ...t, assetUrl: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Asset type
              </Label>
              <Select
                value={thankYou.assetType}
                onValueChange={(v) =>
                  setThankYou((t) => ({
                    ...t,
                    assetType: v === "video" ? "video" : "image",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="image">Image</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label
              htmlFor="thankyou-message"
              className="text-xs uppercase tracking-[0.18em] text-muted-foreground"
            >
              Message
            </Label>
            <Textarea
              id="thankyou-message"
              rows={4}
              maxLength={600}
              value={thankYou.message}
              onChange={(e) =>
                setThankYou((t) => ({ ...t, message: e.target.value }))
              }
            />
            <p className="text-[11px] text-muted-foreground">
              {thankYou.message.length} / 600 characters
            </p>
          </div>

          {thankYou.assetUrl && (
            <div className="rounded-md border border-border bg-background p-3">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
                Preview
              </p>
              {thankYou.assetType === "video" ? (
                <video
                  src={thankYou.assetUrl}
                  controls
                  className="w-full max-h-72 rounded bg-black"
                />
              ) : (
                <img
                  src={thankYou.assetUrl}
                  alt="Thank-you preview"
                  className="w-full max-h-72 object-cover rounded bg-muted"
                />
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={saveThankYou} disabled={savingThankYou}>
              {savingThankYou ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save thank-you
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
