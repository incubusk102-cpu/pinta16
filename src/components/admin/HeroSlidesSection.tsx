import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  type HeroAlign,
  type HeroSettings,
  type HeroSlide,
  type HeroTransition,
  useHeroSlides,
} from "@/contexts/HeroSlidesContext";
import { getAdminToken } from "@/contexts/AdminAuthContext";

const MAX_SLIDES = 8;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3 MB raw
const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
];

interface AdminSlide extends HeroSlide {
  enabled: boolean;
}

const newId = () =>
  `s_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

const blankSlide = (): AdminSlide => ({
  id: newId(),
  image: "",
  eyebrow: "",
  headline: "",
  subtext: "",
  ctaLabel: "",
  ctaHref: "",
  align: "center",
  enabled: true,
});

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export function HeroSlidesSection() {
  const {
    slides: liveSlides,
    settings: liveSettings,
    refresh,
  } = useHeroSlides();

  const [loading, setLoading] = useState(true);
  const [draftSlides, setDraftSlides] = useState<AdminSlide[]>([]);
  const [draftSettings, setDraftSettings] =
    useState<HeroSettings>(liveSettings);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  // Load admin view (includes disabled slides)
  useEffect(() => {
    const load = async () => {
      try {
        const token = getAdminToken();
        const res = await fetch("/api/hero-slides?admin=1", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as {
          slides?: AdminSlide[];
          settings?: HeroSettings;
        };
        if (Array.isArray(data.slides)) {
          setDraftSlides(
            data.slides.map((s) => ({
              ...blankSlide(),
              ...s,
              enabled: s.enabled !== false,
            })),
          );
        }
        if (data.settings) setDraftSettings(data.settings);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not load slides",
        );
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const updateSlide = (id: string, patch: Partial<AdminSlide>) => {
    setDraftSlides((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  };

  const addSlide = () => {
    if (draftSlides.length >= MAX_SLIDES) {
      toast.warning(`Max ${MAX_SLIDES} slides`);
      return;
    }
    setDraftSlides((prev) => [...prev, blankSlide()]);
  };

  const removeSlide = (id: string) => {
    setDraftSlides((prev) => prev.filter((s) => s.id !== id));
  };

  const moveSlide = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= draftSlides.length) return;
    setDraftSlides((prev) => {
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const onFile = async (id: string, file: File | undefined) => {
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error("Use JPG, PNG, WEBP, AVIF, or GIF");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(
        `${file.name}: ${formatBytes(file.size)} — must be under 3 MB`,
      );
      return;
    }
    try {
      const url = await fileToDataUrl(file);
      updateSlide(id, { image: url });
    } catch {
      toast.error("Could not read image");
    }
  };

  const save = async () => {
    const token = getAdminToken();
    if (!token) return toast.error("Sign in again");
    const slidesWithImage = draftSlides.filter((s) => s.image);
    if (slidesWithImage.length !== draftSlides.length) {
      toast.warning(
        "Slides without an image will be skipped on save. Add an image or remove them.",
      );
    }
    setSaving(true);
    try {
      const res = await fetch("/api/hero-slides", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "save",
          settings: draftSettings,
          slides: slidesWithImage,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Save failed (${res.status})`);
      }
      await refresh();
      setSavedAt(new Date().toLocaleTimeString());
      toast.success("Hero slider saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const totalKb =
    draftSlides.reduce((sum, s) => sum + (s.image?.length || 0), 0) / 1024;

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl">Hero slider</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Upload up to {MAX_SLIDES} slides. Each slide shows a full-bleed
            image with optional eyebrow, headline, subtext and CTA. The homepage
            falls back to the default hero if no slides are saved.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savedAt && (
            <span className="text-xs text-muted-foreground">
              Saved at {savedAt}
            </span>
          )}
          <Button onClick={save} disabled={saving || loading}>
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save changes
          </Button>
        </div>
      </header>

      {/* Settings */}
      <div className="border border-border/60 rounded-xl p-5 grid gap-4 sm:grid-cols-3">
        <div className="flex items-center justify-between gap-3">
          <Label className="text-sm">Autoplay</Label>
          <Switch
            checked={draftSettings.autoplay}
            onCheckedChange={(autoplay) =>
              setDraftSettings((s) => ({ ...s, autoplay }))
            }
          />
        </div>
        <div>
          <Label htmlFor="hero-interval" className="text-xs">
            Interval (seconds)
          </Label>
          <Input
            id="hero-interval"
            type="number"
            min={3}
            max={20}
            value={Math.round(draftSettings.intervalMs / 1000)}
            onChange={(e) => {
              const n = Math.max(3, Math.min(20, Number(e.target.value) || 6));
              setDraftSettings((s) => ({ ...s, intervalMs: n * 1000 }));
            }}
          />
        </div>
        <div>
          <Label htmlFor="hero-transition" className="text-xs">
            Transition
          </Label>
          <select
            id="hero-transition"
            value={draftSettings.transition}
            onChange={(e) =>
              setDraftSettings((s) => ({
                ...s,
                transition: e.target.value as HeroTransition,
              }))
            }
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="kenburns">Ken Burns (zoom + fade)</option>
            <option value="fade">Cross-fade</option>
            <option value="slide">Slide</option>
          </select>
        </div>
      </div>

      {/* Slide list */}
      <div className="space-y-4">
        {draftSlides.map((slide, idx) => (
          <article
            key={slide.id}
            className="border border-border/60 rounded-xl overflow-hidden bg-background/40"
          >
            <div className="grid md:grid-cols-[280px_1fr] gap-4 p-4">
              {/* Image cell */}
              <div className="space-y-2">
                <div className="relative aspect-[16/10] rounded-md overflow-hidden border border-border/60 bg-muted/40">
                  {slide.image ? (
                    <img
                      src={slide.image}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                      No image
                    </div>
                  )}
                </div>
                <input
                  ref={(el) => {
                    fileInputs.current[slide.id] = el;
                  }}
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES.join(",")}
                  className="hidden"
                  onChange={(e) =>
                    void onFile(slide.id, e.target.files?.[0] || undefined)
                  }
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputs.current[slide.id]?.click()}
                    className="flex-1"
                  >
                    <Upload className="w-3.5 h-3.5 mr-2" />
                    {slide.image ? "Replace image" : "Upload image"}
                  </Button>
                  {slide.image && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => updateSlide(slide.id, { image: "" })}
                      title="Clear image"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
                {slide.image && (
                  <p className="text-[10px] text-muted-foreground">
                    {formatBytes(slide.image.length)} · base64
                  </p>
                )}
              </div>

              {/* Fields cell */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                    Slide {idx + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => moveSlide(idx, -1)}
                      disabled={idx === 0}
                      title="Move up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => moveSlide(idx, 1)}
                      disabled={idx === draftSlides.length - 1}
                      title="Move down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        updateSlide(slide.id, { enabled: !slide.enabled })
                      }
                      title={slide.enabled ? "Hide" : "Show"}
                    >
                      {slide.enabled ? (
                        <Eye className="w-3.5 h-3.5" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSlide(slide.id)}
                      title="Delete slide"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor={`eyebrow-${slide.id}`} className="text-xs">
                      Eyebrow (small text above headline)
                    </Label>
                    <Input
                      id={`eyebrow-${slide.id}`}
                      value={slide.eyebrow}
                      maxLength={60}
                      onChange={(e) =>
                        updateSlide(slide.id, { eyebrow: e.target.value })
                      }
                      placeholder="New collection"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`align-${slide.id}`} className="text-xs">
                      Text alignment
                    </Label>
                    <select
                      id={`align-${slide.id}`}
                      value={slide.align}
                      onChange={(e) =>
                        updateSlide(slide.id, {
                          align: e.target.value as HeroAlign,
                        })
                      }
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                </div>
                <div>
                  <Label htmlFor={`headline-${slide.id}`} className="text-xs">
                    Headline
                  </Label>
                  <Input
                    id={`headline-${slide.id}`}
                    value={slide.headline}
                    maxLength={200}
                    onChange={(e) =>
                      updateSlide(slide.id, { headline: e.target.value })
                    }
                    placeholder="The Light series"
                  />
                </div>
                <div>
                  <Label htmlFor={`subtext-${slide.id}`} className="text-xs">
                    Subtext
                  </Label>
                  <textarea
                    id={`subtext-${slide.id}`}
                    value={slide.subtext}
                    maxLength={200}
                    onChange={(e) =>
                      updateSlide(slide.id, { subtext: e.target.value })
                    }
                    rows={2}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Hand-painted on linen, ready to ship."
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  <div>
                    <Label
                      htmlFor={`cta-label-${slide.id}`}
                      className="text-xs"
                    >
                      CTA label
                    </Label>
                    <Input
                      id={`cta-label-${slide.id}`}
                      value={slide.ctaLabel}
                      maxLength={60}
                      onChange={(e) =>
                        updateSlide(slide.id, { ctaLabel: e.target.value })
                      }
                      placeholder="Shop the series"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`cta-href-${slide.id}`} className="text-xs">
                      CTA link (URL or #anchor)
                    </Label>
                    <Input
                      id={`cta-href-${slide.id}`}
                      value={slide.ctaHref}
                      maxLength={500}
                      onChange={(e) =>
                        updateSlide(slide.id, { ctaHref: e.target.value })
                      }
                      placeholder="#gallery or /policy/shipping"
                    />
                  </div>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={addSlide}
          disabled={draftSlides.length >= MAX_SLIDES}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add slide ({draftSlides.length}/{MAX_SLIDES})
        </Button>
        <span className="text-xs text-muted-foreground">
          {liveSlides.length} live · {totalKb.toFixed(0)} KB total
        </span>
      </div>
    </section>
  );
}
