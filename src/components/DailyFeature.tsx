import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles, Clock, Check, Copy } from "lucide-react";
import { animate } from "animejs";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { toast } from "sonner";
import { useStorefrontConfig } from "@/contexts/StorefrontConfigContext";
import { useProducts } from "@/contexts/ProductContext";
import { findArtworkById } from "@/lib/artworks";

gsap.registerPlugin(ScrollTrigger);

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const padDuration = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

const DailyFeature = () => {
  const { config, loading } = useStorefrontConfig();
  const { products } = useProducts();
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const cardRef = useRef<HTMLDivElement | null>(null);
  const sparkleRef = useRef<HTMLSpanElement | null>(null);

  const today = config.dailyFeatureToday;

  useEffect(() => {
    if (!today) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [today?.code, today?.expiresAt]);

  const artwork = useMemo(() => {
    if (!today?.productId) return undefined;
    return findArtworkById(today.productId, products);
  }, [today?.productId, products]);

  // GSAP timeline entrance + anime.js sparkle pulse loop. Both kick
  // in only after the card is rendered (which requires `today` and
  // `artwork`), so wiring lives in an effect that depends on the
  // artwork id rather than at mount.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    if (!today || !artwork) return;
    const card = cardRef.current;
    if (!card) return;

    const image = card.querySelector<HTMLElement>("[data-daily-image]");
    const copy = card.querySelector<HTMLElement>("[data-daily-copy]");

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: card,
          start: "top 80%",
          toggleActions: "play none none none",
        },
      });
      if (image) {
        tl.fromTo(
          image,
          { autoAlpha: 0, scale: 0.92, x: -32 },
          { autoAlpha: 1, scale: 1, x: 0, duration: 0.95, ease: "power3.out" },
          0,
        );
      }
      if (copy) {
        tl.fromTo(
          copy,
          { autoAlpha: 0, x: 36 },
          { autoAlpha: 1, x: 0, duration: 0.95, ease: "power3.out" },
          0.12,
        );
      }
    }, card);

    // anime.js sparkle pulse — a soft scale + opacity oscillation
    // that draws the eye to the "Piece of the day" eyebrow without
    // being distracting. Looped via alternate so it ping-pongs.
    let sparkleControls: ReturnType<typeof animate> | null = null;
    const sparkle = sparkleRef.current;
    if (sparkle) {
      sparkleControls = animate(sparkle, {
        scale: [1, 1.18, 1],
        opacity: [0.85, 1, 0.85],
        rotate: [0, 8, 0],
        duration: 2400,
        loop: true,
        ease: "inOutQuad",
      });
    }

    return () => {
      ctx.revert();
      sparkleControls?.pause();
    };
  }, [today, artwork]);

  if (loading) return null;
  if (!today || !artwork) return null;

  const expiresAtMs = new Date(today.expiresAt).getTime();
  const remaining = expiresAtMs - now;
  if (remaining <= 0) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(today.code);
      setCopied(true);
      toast.success(`Copied ${today.code}`);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy code");
    }
  };

  const headline = config.dailyFeature.headline || "Piece of the day";
  const image = artwork.images?.[0]?.url || artwork.image;

  return (
    <section
      className="py-10 md:py-14 bg-gradient-to-br from-amber-50/60 via-background to-rose-50/40 dark:from-amber-950/20 dark:to-rose-950/10"
      aria-label="Daily featured artwork"
    >
      <div className="container mx-auto px-4">
        <div
          ref={cardRef}
          className="grid md:grid-cols-2 gap-6 md:gap-10 items-center max-w-5xl mx-auto rounded-lg border border-border/60 bg-card/70 backdrop-blur p-5 md:p-8 shadow-sm"
        >
          <div data-daily-image>
            <Link
              to="/product/$id"
              params={{ id: artwork.id }}
              className="block aspect-square overflow-hidden rounded-md bg-muted"
            >
              <img
                src={image}
                alt={artwork.title}
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-500 hover:scale-[1.03]"
              />
            </Link>
          </div>
          <div data-daily-copy className="flex flex-col gap-4">
            <div className="inline-flex items-center gap-2 self-start text-[10px] uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">
              <span
                ref={sparkleRef}
                className="inline-flex items-center justify-center"
                style={{ transformOrigin: "50% 50%" }}
                aria-hidden="true"
              >
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
              {headline}
            </div>
            <h2 className="font-display text-2xl md:text-3xl text-foreground leading-tight">
              {artwork.title}
            </h2>
            {artwork.medium && (
              <p className="text-sm text-muted-foreground">
                {artwork.medium}
                {artwork.dimensions ? ` · ${artwork.dimensions}` : ""}
              </p>
            )}
            <p className="text-sm text-muted-foreground line-clamp-3">
              {artwork.description}
            </p>
            <div className="rounded-md border border-amber-300/60 bg-amber-50/70 dark:border-amber-700/60 dark:bg-amber-950/40 p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-[0.2em] text-amber-800/80 dark:text-amber-200/80">
                  Today only · {today.percent}% off
                </p>
                <code className="mt-1 block font-mono text-base md:text-lg tracking-[0.18em] text-amber-950 dark:text-amber-50">
                  {today.code}
                </code>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs uppercase tracking-[0.15em] rounded border border-amber-300 bg-background hover:bg-amber-100/60 dark:border-amber-700 dark:hover:bg-amber-900/40"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </>
                )}
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                Expires in{" "}
                <span className="font-mono text-foreground" aria-live="polite">
                  {padDuration(remaining)}
                </span>
              </span>
            </div>
            <Link
              to="/product/$id"
              params={{ id: artwork.id }}
              className="inline-flex items-center justify-center self-start px-5 py-2.5 rounded-sm bg-foreground text-background text-xs uppercase tracking-[0.18em] hover:bg-foreground/90"
            >
              View this piece
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DailyFeature;
