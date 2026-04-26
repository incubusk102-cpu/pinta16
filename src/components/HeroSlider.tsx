import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  type HeroSlide,
  type HeroTransition,
  useHeroSlides,
} from "@/contexts/HeroSlidesContext";

const SWIPE_PX = 50;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const transitionVariants = (mode: HeroTransition, reduced: boolean) => {
  if (reduced) {
    return {
      enter: { opacity: 0 },
      center: { opacity: 1 },
      exit: { opacity: 0 },
    };
  }
  if (mode === "slide") {
    return {
      enter: (d: number) => ({ x: d > 0 ? 80 : -80, opacity: 0 }),
      center: { x: 0, opacity: 1 },
      exit: (d: number) => ({ x: d > 0 ? -80 : 80, opacity: 0 }),
    };
  }
  // kenburns + fade share the same enter/exit (zoom is on the image itself)
  return {
    enter: { opacity: 0 },
    center: { opacity: 1 },
    exit: { opacity: 0 },
  };
};

interface SlideContentProps {
  slide: HeroSlide;
  active: boolean;
}

const ALIGN_CLASSES: Record<HeroSlide["align"], string> = {
  left: "items-start text-left",
  center: "items-center text-center",
  right: "items-end text-right",
};

const isExternalHref = (href: string) => /^(https?:|mailto:|tel:)/i.test(href);

const CtaLink = ({ label, href }: { label: string; href: string }) => {
  const cls =
    "inline-flex items-center font-body text-xs tracking-[0.3em] uppercase px-10 py-4 bg-foreground text-background hover:bg-foreground/90 transition-colors duration-300 rounded-none";
  const external = isExternalHref(href);
  const target = external ? "_blank" : undefined;
  const rel = external ? "noreferrer" : undefined;
  // Defence in depth: the server already blocks protocol-relative URLs
  // ("//evil.com"), but the client also rejects them in case stored data
  // predates that fix. Tanstack typed Link is overkill for hero CTAs.
  const isSafeInternal = href.startsWith("/") && !href.startsWith("//");
  const finalHref =
    isSafeInternal || external ? href : `#${href.replace(/^#/, "")}`;
  return (
    <a href={finalHref} target={target} rel={rel} className={cls}>
      {label}
    </a>
  );
};

const SlideContent = ({ slide, active }: SlideContentProps) => (
  <div
    className={`absolute inset-0 z-10 flex flex-col justify-center px-6 md:px-12 ${ALIGN_CLASSES[slide.align]}`}
  >
    <div className="max-w-3xl flex flex-col gap-5">
      {slide.eyebrow && (
        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="font-body text-xs tracking-[0.4em] uppercase text-muted-foreground/90"
        >
          {slide.eyebrow}
        </motion.p>
      )}
      {slide.headline && (
        <motion.h2
          initial={{ opacity: 0, y: 28 }}
          animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 28 }}
          transition={{ duration: 0.9, delay: 0.25 }}
          className="font-display text-4xl md:text-6xl lg:text-7xl text-foreground leading-[1.05]"
        >
          {slide.headline}
        </motion.h2>
      )}
      {slide.subtext && (
        <motion.p
          initial={{ opacity: 0, y: 22 }}
          animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 22 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="font-body text-sm md:text-base text-muted-foreground max-w-xl leading-relaxed"
        >
          {slide.subtext}
        </motion.p>
      )}
      {slide.ctaLabel && slide.ctaHref && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={active ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.8, delay: 0.55 }}
          className="mt-2"
        >
          <CtaLink label={slide.ctaLabel} href={slide.ctaHref} />
        </motion.div>
      )}
    </div>
  </div>
);

const HeroSlider = () => {
  const { slides, settings } = useHeroSlides();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [paused, setPaused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const reduced = prefersReducedMotion();

  const count = slides.length;

  const next = useCallback(() => {
    setDirection(1);
    setIndex((i) => (i + 1) % Math.max(1, count));
  }, [count]);

  const prev = useCallback(() => {
    setDirection(-1);
    setIndex((i) => (i - 1 + Math.max(1, count)) % Math.max(1, count));
  }, [count]);

  const goTo = useCallback(
    (i: number) => {
      setDirection(i > index ? 1 : -1);
      setIndex(((i % count) + count) % count);
    },
    [count, index],
  );

  // Clamp index when slides change underneath us (admin add/remove during view).
  useEffect(() => {
    if (count > 0 && index >= count) setIndex(0);
  }, [count, index]);

  // Autoplay. Including `index` in deps re-arms the timer on manual
  // navigation, so clicking next/prev/dot doesn't fire an immediate auto-advance.
  useEffect(() => {
    if (!settings.autoplay || paused || reduced || count <= 1) return;
    const id = window.setTimeout(next, settings.intervalMs);
    return () => window.clearTimeout(id);
  }, [
    settings.autoplay,
    settings.intervalMs,
    paused,
    reduced,
    count,
    next,
    index,
  ]);

  // Keyboard nav (when slider is focused)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [next, prev]);

  // Swipe
  const touchStartX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > SWIPE_PX) {
      if (dx < 0) next();
      else prev();
    }
    touchStartX.current = null;
  };

  if (count === 0) return null;

  const variants = transitionVariants(settings.transition, reduced);
  const slide = slides[index];
  const showKenBurns = settings.transition === "kenburns" && !reduced;

  return (
    <section
      id="hero"
      ref={containerRef}
      tabIndex={0}
      role="region"
      aria-label="Featured paintings carousel"
      aria-roledescription="carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="relative h-screen overflow-hidden bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <AnimatePresence initial={false} custom={direction} mode="sync">
        <motion.div
          key={slide.id}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: reduced ? 0.1 : 0.9, ease: "easeOut" }}
          className="absolute inset-0"
          aria-hidden={false}
          aria-roledescription="slide"
          aria-label={`Slide ${index + 1} of ${count}`}
        >
          {slide.image && (
            <motion.img
              src={slide.image}
              alt={slide.headline || slide.eyebrow || `Slide ${index + 1}`}
              className="absolute inset-0 w-full h-full object-cover"
              initial={showKenBurns ? { scale: 1.05 } : false}
              animate={showKenBurns ? { scale: 1.18 } : { scale: 1 }}
              transition={{
                duration: showKenBurns ? settings.intervalMs / 1000 + 1 : 0,
                ease: "linear",
              }}
              draggable={false}
            />
          )}
          {/* readability overlay — gradient bottom-up */}
          <div className="absolute inset-0 bg-gradient-to-t from-background/85 via-background/45 to-background/15" />
          <SlideContent slide={slide} active />
        </motion.div>
      </AnimatePresence>

      {/* aria-live announcement of current slide for screen readers */}
      <div className="sr-only" aria-live="polite">
        Slide {index + 1} of {count}
        {slide.headline ? `: ${slide.headline}` : ""}
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label="Previous slide"
            className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-background/40 hover:bg-background/70 backdrop-blur text-foreground transition-all"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Next slide"
            className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-background/40 hover:bg-background/70 backdrop-blur text-foreground transition-all"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <div
            className="absolute bottom-7 left-1/2 -translate-x-1/2 z-20 flex gap-2"
            role="tablist"
            aria-label="Choose slide"
          >
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => goTo(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === index
                    ? "w-10 bg-foreground"
                    : "w-4 bg-foreground/40 hover:bg-foreground/60"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
};

export default HeroSlider;
