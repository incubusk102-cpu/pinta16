import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
  useStorefrontConfig,
  type HeroConfig,
} from "@/contexts/StorefrontConfigContext";
import { toast } from "sonner";

const HERO_BG_LIMIT = 3;

const DEFAULT_HERO: HeroConfig = {
  enabled: true,
  eyebrow: "Affordable Art, Authentic Stories",
  headline: "Pintaterra",
  subhead:
    "Discover hand-crafted paintings that transform spaces. Each piece tells a story, crafted with passion and precision.",
  ctaLabel: "View Collection",
  ctaHref: "#gallery",
  backgroundImages: [],
};

export function HeroPanel() {
  const { token } = useAdminAuth();
  const { config, refresh } = useStorefrontConfig();
  const [hero, setHero] = useState<HeroConfig>(DEFAULT_HERO);
  const [saving, setSaving] = useState(false);
  const [newImage, setNewImage] = useState("");

  useEffect(() => {
    setHero({ ...DEFAULT_HERO, ...config.hero });
  }, [config.hero]);

  const update = <K extends keyof HeroConfig>(key: K, value: HeroConfig[K]) =>
    setHero((prev) => ({ ...prev, [key]: value }));

  const addImage = () => {
    const url = newImage.trim();
    if (!url) return;
    if (hero.backgroundImages.length >= HERO_BG_LIMIT) {
      return toast.error(`At most ${HERO_BG_LIMIT} background images.`);
    }
    update("backgroundImages", [...hero.backgroundImages, url]);
    setNewImage("");
  };

  const removeImage = (idx: number) =>
    update(
      "backgroundImages",
      hero.backgroundImages.filter((_, i) => i !== idx),
    );

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/storefront-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: "update-hero", hero }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      await refresh();
      toast.success("Hero saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save hero");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4 border border-border/50 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-base">Homepage hero</h3>
          <p className="text-xs text-muted-foreground">
            Headline, copy, CTA, and parallax background for the landing
            section.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="hero-enabled" className="text-xs">
            Show
          </Label>
          <Switch
            id="hero-enabled"
            checked={hero.enabled}
            onCheckedChange={(v) => update("enabled", Boolean(v))}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="hero-eyebrow">Eyebrow</Label>
          <Input
            id="hero-eyebrow"
            value={hero.eyebrow}
            onChange={(e) => update("eyebrow", e.target.value)}
            maxLength={120}
            placeholder="Affordable Art, Authentic Stories"
          />
        </div>
        <div>
          <Label htmlFor="hero-headline">Headline</Label>
          <Input
            id="hero-headline"
            value={hero.headline}
            onChange={(e) => update("headline", e.target.value)}
            maxLength={80}
            placeholder="Pintaterra"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="hero-subhead">Subheadline</Label>
        <Textarea
          id="hero-subhead"
          value={hero.subhead}
          onChange={(e) => update("subhead", e.target.value)}
          maxLength={320}
          rows={3}
          placeholder="One or two short sentences."
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="hero-cta-label">Call-to-action label</Label>
          <Input
            id="hero-cta-label"
            value={hero.ctaLabel}
            onChange={(e) => update("ctaLabel", e.target.value)}
            maxLength={40}
            placeholder="View Collection"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Leave blank to hide the button.
          </p>
        </div>
        <div>
          <Label htmlFor="hero-cta-href">Call-to-action link</Label>
          <Input
            id="hero-cta-href"
            value={hero.ctaHref}
            onChange={(e) => update("ctaHref", e.target.value)}
            maxLength={500}
            placeholder="#gallery or https://…"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Anchors (#id) smooth-scroll on the same page.
          </p>
        </div>
      </div>

      <div>
        <Label>
          Background images ({hero.backgroundImages.length}/{HERO_BG_LIMIT})
        </Label>
        <div className="flex gap-2 mt-1">
          <Input
            value={newImage}
            onChange={(e) => setNewImage(e.target.value)}
            placeholder="https://…/photo.jpg"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addImage();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={addImage}
            disabled={hero.backgroundImages.length >= HERO_BG_LIMIT}
          >
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </div>
        {hero.backgroundImages.length === 0 ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            No background images yet. The hero will render with a plain
            background tint.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {hero.backgroundImages.map((url, i) => (
              <li
                key={`${url}-${i}`}
                className="flex items-center gap-2 bg-muted/40 rounded px-2 py-1.5"
              >
                <img
                  src={url}
                  alt=""
                  className="w-10 h-10 object-cover rounded"
                  loading="lazy"
                />
                <span className="flex-1 text-xs truncate">{url}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeImage(i)}
                  aria-label={`Remove image ${i + 1}`}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Save hero
        </Button>
      </div>
    </section>
  );
}
