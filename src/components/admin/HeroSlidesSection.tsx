import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Save,
  Sparkles,
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
import { compressImage } from "@/lib/imageCompress";
import {
  HERO_TEMPLATES,
  HERO_TEMPLATE_BY_ID,
  type HeroTemplateId,
} from "./heroSlideTemplates";

const MAX_SLIDES = 8;
// Original file ceiling before compression. Server still caps the encoded
// data URL at 3.5 MB; we compress every upload to <= 1 MB so even a 30 MB
// phone photo lands well under that.
const MAX_IMAGE_RAW_BYTES = 30 * 1024 * 1024;
const MAX_IMAGE_DATA_URL_BYTES = 3_500_000;
const HERO_COMPRESS_BYTES = 1_000_000;
const HERO_COMPRESS_DIM = 2400;
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
  startsAt: "",
  endsAt: "",
});

// Convert an ISO 8601 UTC timestamp into the value <input
// type="datetime-local"> wants (`YYYY-MM-DDTHH:mm`) expressed in
// Asia/Manila wall-clock time. Empty string roundtrips to empty.
const isoToPhtInput = (iso: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  // Some engines emit hour="24" for midnight; normalise to "00".
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
};

// Inverse of isoToPhtInput. The datetime-local value is interpreted
// as Asia/Manila wall-clock time (UTC+8) and converted to an ISO 8601
// UTC string for storage. Returns "" for empty / unparseable input.
const phtInputToIso = (local: string): string => {
  if (!local) return "";
  const [date, time] = local.split("T");
  if (!date || !time) return "";
  const d = new Date(`${date}T${time}:00+08:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
};

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
    broadcastChange,
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

  // Apply a curated template to a slide. Built-in campaign templates also
  // set the background image so choosing one can fully seed the slide in a
  // single click. The custom template still only clears the text fields so
  // admins can keep a manual upload while resetting copy.
  const applyTemplate = (id: string, templateId: HeroTemplateId) => {
    const tpl = HERO_TEMPLATE_BY_ID[templateId];
    if (!tpl) return;
    updateSlide(
      id,
      tpl.id === "custom"
        ? { ...tpl.fields }
        : { image: tpl.image ?? "", ...tpl.fields },
    );
  };

  // Best-effort match: a slide is "on" template T iff every text field is
  // exactly equal to T's preset values and, when present, the built-in image
  // path also matches. Falls through to "custom" when nothing matches so the
  // dropdown stays meaningful after manual edits.
  const detectTemplate = (slide: AdminSlide): HeroTemplateId => {
    for (const tpl of HERO_TEMPLATES) {
      const f = tpl.fields;
      if (
        slide.eyebrow === f.eyebrow &&
        slide.headline === f.headline &&
        slide.subtext === f.subtext &&
        slide.ctaLabel === f.ctaLabel &&
        slide.ctaHref === f.ctaHref &&
        slide.align === f.align &&
        (!tpl.image || slide.image === tpl.image)
      ) {
        return tpl.id;
      }
    }
    return "custom";
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
    if (file.size > MAX_IMAGE_RAW_BYTES) {
      toast.error(
        `${file.name}: ${formatBytes(file.size)} — must be under 30 MB`,
      );
      return;
    }
    try {
      const compressed = await compressImage(file, {
        maxDim: HERO_COMPRESS_DIM,
        maxBytes: HERO_COMPRESS_BYTES,
      });
      // Defence in depth: data URL must also fit under the server's raw cap.
      if (compressed.url.length > MAX_IMAGE_DATA_URL_BYTES) {
        toast.error(
          `${file.name}: encoded size ${formatBytes(compressed.url.length)} too large`,
        );
        return;
      }
      updateSlide(id, { image: compressed.url });
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
      const persisted = (await res.json().catch(() => null)) as {
        slides?: AdminSlide[];
      } | null;
      // Sync the editor with whatever the server actually persisted (server
      // is authoritative on ids / sort order / dropped invalid slides).
      if (persisted?.slides) {
        setDraftSlides(
          persisted.slides.map((s) => ({
            ...blankSlide(),
            ...s,
            enabled: s.enabled !== false,
          })),
        );
      } else {
        setDraftSlides(slidesWithImage);
      }
      await refresh();
      // Tell every other tab in this browser (the public homepage,
      // a preview window, another admin view) that hero slides
      // changed so they refetch immediately without waiting for a
      // visibilitychange refocus.
      broadcastChange();
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
                {/* Curated presets — built-in campaign templates fill image,
                    eyebrow, headline, subtext, CTA, and align in one click.
                    Selecting "Custom" clears the text fields back to blank
                    while leaving a manual upload untouched. */}
                <div className="rounded-md border border-dashed border-border/60 bg-muted/30 p-3 space-y-2">
                  <Label
                    htmlFor={`template-${slide.id}`}
                    className="text-xs flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    Use template
                  </Label>
                  <select
                    id={`template-${slide.id}`}
                    value={detectTemplate(slide)}
                    onChange={(e) =>
                      applyTemplate(slide.id, e.target.value as HeroTemplateId)
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                  >
                    {HERO_TEMPLATES.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {HERO_TEMPLATE_BY_ID[detectTemplate(slide)].hint}
                  </p>
                  {HERO_TEMPLATE_BY_ID[detectTemplate(slide)].image && (
                    <p className="text-[10px] text-muted-foreground leading-snug">
                      Built-in image fills automatically when you choose this
                      template.
                    </p>
                  )}
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
                      placeholder="/collection or /policy/shipping"
                    />
                  </div>
                </div>
                {/* Optional schedule window. Leaving both blank keeps the
                    slide always-on (the existing behaviour). Filling in
                    "Goes live" makes the slide appear automatically at
                    that PHT moment; "Ends" makes it disappear. The server
                    filters at request time so the homepage starts /
                    stops showing the slide without any cron job. */}
                <div className="rounded-md border border-dashed border-border/60 bg-muted/30 p-3 space-y-2">
                  <Label className="text-xs flex items-center gap-1.5">
                    <span className="uppercase tracking-[0.2em] text-muted-foreground">
                      Schedule (PHT)
                    </span>
                  </Label>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <div>
                      <Label
                        htmlFor={`starts-${slide.id}`}
                        className="text-[11px] text-muted-foreground"
                      >
                        Goes live
                      </Label>
                      <Input
                        id={`starts-${slide.id}`}
                        type="datetime-local"
                        value={isoToPhtInput(slide.startsAt)}
                        onChange={(e) =>
                          updateSlide(slide.id, {
                            startsAt: phtInputToIso(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label
                        htmlFor={`ends-${slide.id}`}
                        className="text-[11px] text-muted-foreground"
                      >
                        Ends
                      </Label>
                      <Input
                        id={`ends-${slide.id}`}
                        type="datetime-local"
                        value={isoToPhtInput(slide.endsAt)}
                        onChange={(e) =>
                          updateSlide(slide.id, {
                            endsAt: phtInputToIso(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    Leave both blank for an always-on slide. Times are Manila
                    time (UTC+8); the homepage starts and stops showing this
                    slide automatically.
                  </p>
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
