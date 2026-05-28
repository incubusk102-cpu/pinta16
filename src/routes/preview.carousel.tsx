import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  type PanInfo,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";

// Standalone design mock-up for a "swipe through paintings one at a
// time" hero, inspired by the cinematic single-product carousels
// circulating on Figma TikTok — but rendered in canvhub's own
// editorial cream + gold + Playfair vocabulary, not the reference's
// red/orange product-shot look.
//
// Nothing on this page is wired to the storefront. It's intentionally
// isolated at /preview/carousel so the team can evaluate the concept
// (transition feel, typography balance, control affordances) before
// committing to replacing the existing HomeHero or Browse-Collection
// grid. Once approved the same primitives drop into HomeHero with the
// real ProductContext feed.

export const Route = createFileRoute("/preview/carousel")({
  component: CarouselMockupPage,
  head: () => ({
    meta: [
      { title: "Painting carousel — mock-up — Canvas Hub" },
      {
        name: "description",
        content:
          "Design preview of a single-painting cinematic carousel concept for Canvas Hub.",
      },
      // Pure design mock — keep search engines out of it.
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

interface MockArtwork {
  id: string;
  image: string;
  title: string;
  medium: string;
  year: string;
  price: number;
  description: string;
  // Editorial chapter label — surfaces above the title like a magazine
  // section ("CHAPTER 02 — Folk modernism"). Not used on production
  // product data; just a mock-up flourish.
  chapter: string;
}

// Hand-picked five paintings that span canvhub's catalogue tones —
// folk modernism, rural scenes, abstract florals, geometric figures —
// so the carousel reads as a curated walk-through rather than a flat
// product feed. Images pulled from the existing /public/images/ set
// so this mock-up works offline.
const MOCK_ARTWORKS: MockArtwork[] = [
  {
    id: "rice-field-guardians",
    image: "/images/1.png",
    title: "Rice Field Guardians",
    medium: "Acrylic on Canvas",
    year: "2025",
    price: 3599,
    description:
      "Women bent in vibrant conical hats tend flooded rice fields at sunset — a mosaic of pinks, blues and yellows under a green-gold sky.",
    chapter: "Folk modernism",
  },
  {
    id: "cubist-family-of-four",
    image: "/images/5.png",
    title: "Cubist Family of Four",
    medium: "Acrylic on Canvas",
    year: "2025",
    price: 3799,
    description:
      "A father, mother and their two children share a warm embrace, rendered as geometric planes — a celebration of family ties and the abundance of the land.",
    chapter: "Family portraits",
  },
  {
    id: "mayon-village-path",
    image: "/images/33.png",
    title: "Mayon Village Path",
    medium: "Acrylic on Canvas",
    year: "2025",
    price: 3699,
    description:
      "The majestic Mayon volcano frames a swaying palm, a nipa hut and a Filipina walking past golden haystacks and ancient bell-tower ruins.",
    chapter: "Landscapes",
  },
  {
    id: "cosmic-iris-dance",
    image: "/images/13.png",
    title: "Cosmic Iris Dance",
    medium: "Acrylic on Canvas",
    year: "2025",
    price: 3699,
    description:
      "Stylised iris flowers twist in a rainbow spectrum across a deep cosmic background — a botanical study lit by gallery spotlights.",
    chapter: "Florals",
  },
  {
    id: "peacock-mandala",
    image: "/images/23.png",
    title: "Peacock Mandala",
    medium: "Acrylic on Canvas",
    year: "2025",
    price: 3899,
    description:
      "A radiant stylised peacock blooms outward in symmetrical petals of yarn-like strokes — a meditative mandala bursting with colour and craft.",
    chapter: "Mandalas",
  },
];

const formatPHP = (n: number): string =>
  `₱${Number(n || 0).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;

// Slide-in/out variants for the painting frame. Mirrors the
// reference's "current piece slides left, next piece arrives from the
// right" motion but uses a softer cubic-bezier and a small scale dip
// so the painting feels physically lifted off the wall rather than
// scraped across it.
const FRAME_TRANSITION = {
  duration: 0.7,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
};

const frameVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
    scale: 0.96,
  }),
  center: { x: 0, opacity: 1, scale: 1 },
  exit: (direction: number) => ({
    x: direction > 0 ? -80 : 80,
    opacity: 0,
    scale: 0.96,
  }),
};

// Copy block uses the same direction-aware enter/exit but with a
// shallower x offset so the title doesn't feel like it travels as
// far as the painting. The chapter / title / description stagger
// inside this block (see `staggerVariants`).
const copyVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 24 : -24, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -24 : 24, opacity: 0 }),
};

const staggerVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

function CarouselMockupPage() {
  const reduceMotion = useReducedMotion();
  // `[index, direction]` lets AnimatePresence pick the right enter/exit
  // animation when the user swipes back vs. forward. Direction is +1
  // for "next" and -1 for "previous"; we never read it directly, it's
  // only passed as the `custom` prop into variants.
  const [[index, direction], setIndex] = useState<[number, number]>([0, 1]);
  const total = MOCK_ARTWORKS.length;
  const current = MOCK_ARTWORKS[index];

  const advance = useCallback(
    (delta: number) => {
      setIndex(([i]) => {
        const next = (i + delta + total) % total;
        return [next, delta > 0 ? 1 : -1];
      });
    },
    [total],
  );

  const goTo = useCallback((target: number) => {
    setIndex(([i]) => {
      if (target === i) return [i, 0];
      return [target, target > i ? 1 : -1];
    });
  }, []);

  // Keyboard nav — arrow keys advance, Home/End jump to ends. Wrapped
  // in a single document listener so the page doesn't need focus for
  // the shortcuts to fire.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        advance(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        advance(-1);
      } else if (e.key === "Home") {
        e.preventDefault();
        goTo(0);
      } else if (e.key === "End") {
        e.preventDefault();
        goTo(total - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, goTo, total]);

  // Subtle pointer-tracked tilt on the painting frame so it reads as a
  // physical object lit from above, not a flat product photo. Cheap:
  // only motion values + a CSS transform, no re-renders.
  const sectionRef = useRef<HTMLElement>(null);
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const springConfig = { stiffness: 240, damping: 26, mass: 0.4 };
  const rotateX = useSpring(
    useTransform(tiltY, [-0.5, 0.5], [4, -4]),
    springConfig,
  );
  const rotateY = useSpring(
    useTransform(tiltX, [-0.5, 0.5], [-4, 4]),
    springConfig,
  );

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (reduceMotion || e.pointerType !== "mouse") return;
    const rect = sectionRef.current?.getBoundingClientRect();
    if (!rect) return;
    tiltX.set((e.clientX - rect.left) / rect.width - 0.5);
    tiltY.set((e.clientY - rect.top) / rect.height - 0.5);
  };
  const resetTilt = () => {
    tiltX.set(0);
    tiltY.set(0);
  };

  // Drag-to-swipe on mobile / trackpad. We use a 60-pixel threshold
  // so a casual fingertip nudge doesn't accidentally advance a piece;
  // a deliberate swipe still feels responsive. `velocity.x` is the
  // secondary signal — a fast flick advances even if the drag distance
  // is short.
  const handleDragEnd = (
    _: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    const dx = info.offset.x;
    const vx = info.velocity.x;
    if (dx < -60 || vx < -500) advance(1);
    else if (dx > 60 || vx > 500) advance(-1);
  };

  // Pad the displayed index so it reads as "01 / 05" rather than
  // "1 / 5" — feels more like an art-book plate caption.
  const positionLabel = useMemo(
    () =>
      `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`,
    [index, total],
  );

  // The storefront ships in dark mode by default (see styles.css —
  // `--foreground` resolves to near-white), so the route can't reuse
  // the global `text-foreground` token without disappearing into the
  // cream paper background. The mock-up declares its own light-on-
  // dark palette as inline CSS variables and the rest of the tree
  // reads them via `var(--ink)` / `var(--ink-mute)` arbitrary classes.
  // This keeps the mock-up legible regardless of the user's theme.
  const inkPalette: React.CSSProperties = {
    // ~ oklch(0.18 0 0): the same value light mode uses for
    // `--foreground`. Strong dark for headlines / primary copy.
    "--ink": "oklch(0.18 0 0)",
    "--ink-mute": "oklch(0.18 0 0 / 0.72)",
    "--ink-soft": "oklch(0.18 0 0 / 0.5)",
    "--ink-faint": "oklch(0.18 0 0 / 0.25)",
    "--ink-hairline": "oklch(0.18 0 0 / 0.1)",
    // Warm bronze used for the chapter / medium label + the accent
    // rule under the title. Sits between the cream paper and the
    // brand gold without competing with the painting.
    "--bronze": "oklch(0.55 0.08 70)",
  } as React.CSSProperties;

  return (
    <div
      className="min-h-screen bg-[oklch(0.97_0.012_85)] antialiased"
      style={{ ...inkPalette, color: "var(--ink)" }}
    >
      {/* Discreet "this is a mock-up" ribbon so anyone landing here
          directly knows the page isn't live storefront chrome. */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-3 px-4 py-2 text-[11px] uppercase tracking-[0.2em] bg-[oklch(0.97_0.012_85)]/85 backdrop-blur-sm border-b border-[var(--ink-hairline)] text-[color:var(--ink-soft)]">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 hover:text-[color:var(--ink)] transition-colors"
        >
          <ArrowLeft className="w-3 h-3" /> Canvas Hub
        </Link>
        <span className="font-display italic normal-case tracking-normal text-[12px]">
          Carousel mock-up · /preview/carousel
        </span>
        <span className="hidden sm:inline">use ← → to navigate</span>
      </div>

      <section
        ref={sectionRef}
        aria-roledescription="carousel"
        aria-label="Painting carousel preview"
        className="relative min-h-screen w-full overflow-hidden pt-10"
        onPointerMove={handlePointerMove}
        onPointerLeave={resetTilt}
        style={{
          // Two-stop warm cream gradient so the page background reads
          // as gallery paper instead of flat white. Kept entirely in
          // oklch so it sits in the same colour space as the
          // Tailwind tokens defined in styles.css.
          background:
            "radial-gradient(120% 90% at 20% 10%, oklch(0.985 0.008 85) 0%, oklch(0.95 0.018 80) 60%, oklch(0.92 0.024 70) 100%)",
        }}
      >
        {/* Faint paper grain so the cream background reads as canvas
            paper, not a flat fill. Pure CSS, no asset load. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06] mix-blend-multiply"
          style={{
            backgroundImage:
              "radial-gradient(rgba(80, 60, 30, 0.7) 1px, transparent 1px)",
            backgroundSize: "3px 3px",
          }}
        />

        <div className="relative mx-auto grid min-h-[calc(100vh-2.5rem)] w-full max-w-[1400px] grid-cols-1 items-center gap-8 px-6 py-10 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:px-12">
          {/* Painting column. Square frame so the whole painting
              is always visible regardless of orientation — portrait
              pieces sit centred with a small cream margin, landscape
              pieces sit centred with a top/bottom margin (gallery
              mat). Never cropped. */}
          <motion.div
            className="relative mx-auto w-full max-w-[640px] aspect-square"
            style={{
              perspective: 1400,
            }}
            drag={reduceMotion ? false : "x"}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            onDragEnd={handleDragEnd}
          >
            <AnimatePresence
              initial={false}
              mode="popLayout"
              custom={direction}
            >
              <motion.div
                key={current.id}
                custom={direction}
                variants={reduceMotion ? undefined : frameVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={FRAME_TRANSITION}
                className="absolute inset-0"
                style={{
                  rotateX: reduceMotion ? 0 : rotateX,
                  rotateY: reduceMotion ? 0 : rotateY,
                  transformStyle: "preserve-3d",
                }}
              >
                {/* Painting framed in a thin cream mount + dark
                    walnut border to evoke a real gallery hang. The
                    drop shadow is the lighting cue. */}
                <div
                  className="relative h-full w-full rounded-[3px] p-[clamp(10px,1.4vw,18px)]"
                  style={{
                    background:
                      "linear-gradient(135deg, oklch(0.22 0.018 60) 0%, oklch(0.16 0.02 50) 100%)",
                    boxShadow:
                      "0 30px 60px -20px rgba(40, 26, 10, 0.45), 0 12px 24px -10px rgba(40, 26, 10, 0.35), inset 0 0 0 1px rgba(255, 230, 180, 0.05)",
                  }}
                >
                  <div className="relative h-full w-full overflow-hidden rounded-[1px] bg-[oklch(0.97_0.012_85)]">
                    <img
                      src={current.image}
                      alt={current.title}
                      draggable={false}
                      className="block h-full w-full object-contain select-none"
                    />
                    {/* A very soft gallery-spot vignette so the
                        painting reads as lit-from-above rather than
                        photographed flat. */}
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background:
                          "radial-gradient(120% 80% at 50% 0%, rgba(255,240,200,0.15) 0%, transparent 55%), linear-gradient(180deg, transparent 70%, rgba(20,12,4,0.18) 100%)",
                      }}
                    />
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Plate caption ("01 / 05 — Folk modernism") floats
                under the painting like the index card next to a hung
                piece. Updates with each slide via the same AnimatePresence
                key so it crossfades, not jumps. */}
            <div className="pointer-events-none absolute -bottom-8 left-0 right-0 flex items-center justify-between text-[11px] uppercase tracking-[0.28em] text-[color:var(--ink-soft)]">
              <span className="font-mono">{positionLabel}</span>
              <AnimatePresence mode="wait">
                <motion.span
                  key={`${current.id}-chapter`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                  className="italic normal-case tracking-[0.05em] font-display text-[13px]"
                >
                  — {current.chapter}
                </motion.span>
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Copy column */}
          <div className="relative flex flex-col gap-6 lg:gap-7">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={current.id}
                custom={direction}
                variants={reduceMotion ? undefined : copyVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  duration: 0.5,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="flex flex-col gap-5"
              >
                <motion.span
                  variants={staggerVariants}
                  initial="hidden"
                  animate="visible"
                  transition={{ delay: 0.1, duration: 0.5 }}
                  className="text-[11px] uppercase tracking-[0.32em] text-[color:var(--bronze)]"
                >
                  {current.medium} · {current.year}
                </motion.span>

                <motion.h1
                  variants={staggerVariants}
                  initial="hidden"
                  animate="visible"
                  transition={{ delay: 0.18, duration: 0.55 }}
                  className="font-display text-4xl leading-[1.05] sm:text-5xl lg:text-6xl text-[color:var(--ink)]"
                  style={{ fontWeight: 500 }}
                >
                  {current.title}
                </motion.h1>

                {/* Gold accent rule. Width animates from 0 to its
                    natural width on each slide so it reads as drawn
                    in rather than popped. */}
                <motion.span
                  initial={{ scaleX: 0, opacity: 0 }}
                  animate={{ scaleX: 1, opacity: 1 }}
                  transition={{ delay: 0.28, duration: 0.55 }}
                  className="block h-[1.5px] w-16 origin-left"
                  style={{
                    background:
                      "linear-gradient(90deg, oklch(0.78 0.12 75) 0%, oklch(0.62 0.16 60) 100%)",
                  }}
                />

                <motion.p
                  variants={staggerVariants}
                  initial="hidden"
                  animate="visible"
                  transition={{ delay: 0.32, duration: 0.5 }}
                  className="max-w-[44ch] text-[15px] leading-[1.7] text-[color:var(--ink-mute)]"
                >
                  {current.description}
                </motion.p>

                <motion.div
                  variants={staggerVariants}
                  initial="hidden"
                  animate="visible"
                  transition={{ delay: 0.42, duration: 0.5 }}
                  className="flex flex-wrap items-baseline gap-x-6 gap-y-2 pt-1"
                >
                  <span className="font-display italic text-2xl text-[color:var(--ink)]">
                    {formatPHP(current.price)}
                  </span>
                  <span className="text-[12px] uppercase tracking-[0.22em] text-[color:var(--ink-soft)]">
                    Made to order · ships in 2 weeks
                  </span>
                </motion.div>

                <motion.div
                  variants={staggerVariants}
                  initial="hidden"
                  animate="visible"
                  transition={{ delay: 0.5, duration: 0.5 }}
                  className="pt-3"
                >
                  <button
                    type="button"
                    className="group inline-flex items-center gap-3 rounded-full border border-[var(--ink-faint)] px-6 py-3 text-[12px] uppercase tracking-[0.28em] text-[color:var(--ink-mute)] transition-colors hover:border-[var(--ink)] hover:bg-[oklch(0.18_0_0_/_0.04)]"
                  >
                    View this piece
                    <span
                      aria-hidden
                      className="inline-block h-px w-6 translate-x-0 bg-[color:var(--ink-soft)] transition-transform duration-300 group-hover:translate-x-1 group-hover:bg-[color:var(--ink)]"
                    />
                  </button>
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Bottom control bar — dot indicators on the left, prev/next
            outline-circle buttons on the right. Sticks to the bottom
            edge of the hero so the painting stays the visual anchor. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex items-center justify-between px-6 lg:px-12">
          <div className="pointer-events-auto flex items-center gap-3">
            {MOCK_ARTWORKS.map((art, i) => (
              <button
                key={art.id}
                type="button"
                aria-label={`Go to ${art.title}`}
                aria-current={i === index ? "true" : undefined}
                onClick={() => goTo(i)}
                className="group relative h-6 w-6 flex items-center justify-center"
              >
                <span
                  className={`block h-[2px] rounded-full transition-all duration-500 ${
                    i === index
                      ? "w-6 bg-[color:var(--ink)]"
                      : "w-3 bg-[color:var(--ink-faint)] group-hover:bg-[color:var(--ink-soft)]"
                  }`}
                />
              </button>
            ))}
          </div>

          <div className="pointer-events-auto flex items-center gap-3">
            <button
              type="button"
              onClick={() => advance(-1)}
              aria-label="Previous painting"
              className="grid h-12 w-12 place-items-center rounded-full border border-[var(--ink-faint)] text-[color:var(--ink-mute)] transition-colors hover:border-[var(--ink)] hover:bg-[oklch(0.18_0_0_/_0.04)] hover:text-[color:var(--ink)]"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => advance(1)}
              aria-label="Next painting"
              className="group relative grid h-16 w-16 place-items-center rounded-full border border-[var(--ink-faint)] text-[color:var(--ink)] transition-all hover:border-[var(--ink)]"
              style={{
                background:
                  "radial-gradient(60% 60% at 50% 40%, oklch(0.93 0.04 75 / 0.6) 0%, transparent 70%)",
              }}
            >
              <span className="absolute inset-0 rounded-full border border-[var(--ink-hairline)] transition-transform duration-700 group-hover:scale-105" />
              <span className="text-[10px] uppercase tracking-[0.28em] absolute -bottom-6 left-1/2 -translate-x-1/2 text-[color:var(--ink-soft)]">
                Next
              </span>
              <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </section>

      {/* Designer's notes block under the hero. Lives only on the
          mock-up route — strip before promoting to production. */}
      <section className="mx-auto max-w-3xl px-6 py-16 lg:py-24">
        <h2 className="font-display text-2xl text-[color:var(--ink)] mb-4">
          Designer's notes
        </h2>
        <ul className="space-y-3 text-[14px] leading-[1.7] text-[color:var(--ink-mute)] list-none">
          <li>
            <strong className="text-[color:var(--ink)]">Aesthetic:</strong>{" "}
            cream-paper gallery wall, not a product page. Walnut frame + soft
            drop shadow stand in for a real hang. Gold accents are limited to
            the small rule under the title and the halo around the Next button.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">Motion:</strong>{" "}
            painting slides out left + fades; next painting arrives from the
            right with a tiny scale dip so it reads as physically lifted off the
            wall. Title + description stagger in after the frame settles.
            Honours <code>prefers-reduced-motion</code>.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">Controls:</strong> big
            Next circle on desktop, dot indicators for direct jump, arrow keys,
            swipe / drag on mobile, Home + End jump to ends.
          </li>
          <li>
            <strong className="text-[color:var(--ink)]">
              Not in this mock-up:
            </strong>{" "}
            real ProductContext feed (currently hard-coded to five paintings),
            add-to-cart wiring, currency / locale switch, wishlist heart,
            view-piece deep link. Wire those in once the look is approved.
          </li>
        </ul>
      </section>
    </div>
  );
}
