import { lazy, Suspense, useMemo, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import { ArrowDown, Mail } from "lucide-react";
import AnimeHeading from "@/components/motion/AnimeHeading";
import { useProducts } from "@/contexts/ProductContext";
import { getStorefrontArtworks, type DisplayArtwork } from "@/lib/artworks";
import { variantSrc } from "@/lib/productImage";

// The new "Floema-style" editorial homepage hero.
//
//   ┌──────────────────────────────────────────────────────────────┐
//   │                                                              │
//   │            C A N V A S   H U B  ®   ← oversized wordmark     │
//   │                  ╱──╲                                        │
//   │                 │ 3D │   ← carved-stone monogram + moss      │
//   │                  ╲──╱     + kingfisher + wildflowers         │
//   │                                                              │
//   │  Hand-crafted art,                                           │
//   │  framed for living                          ┌──────────────┐ │
//   │  Here's how we make it ↓                    │ image • CTA  │ │
//   │                                             └──────────────┘ │
//   └──────────────────────────────────────────────────────────────┘
//
// The 3D scene is lazy-loaded and only rendered on desktop fine-pointer
// devices — on phones the wordmark + framed-painting backdrop carry
// the brand statement without paying the WebGL cost.

const FloemaSculpture3D = lazy(
  () => import("@/components/floema/FloemaSculpture3D"),
);

// Only skip the 3D chunk on tight viewports OR explicit touch / stylus
// pointers. On any sufficiently wide screen we let the WebGL scene
// render — `pointer: fine` was previously required but on Chromium
// CDP test runs that media query reports `false` even on desktop,
// so we trust width + lack of a `coarse` pointer instead.
const DESKTOP_QUERY = "(min-width: 768px) and (not (pointer: coarse))";

const pickFeatured = (artworks: DisplayArtwork[]): DisplayArtwork | null =>
  artworks[0] ?? null;

interface FloemaHeroProps {
  /** Anchor id to scroll to when the visitor taps the bottom-left
   *  "Here's how we do it" prompt. Defaults to the next homepage
   *  section so the page reads as a continuous narrative. */
  nextSectionId?: string;
}

/**
 * Editorial hero. Cream paper background, oversized italic wordmark,
 * sculptural 3D monogram, glass "Get in touch" card, and a "scroll
 * for more" prompt. Falls back to a polished static layout on mobile
 * / cheap devices.
 */
const FloemaHero = ({ nextSectionId = "home-marquee" }: FloemaHeroProps) => {
  const { products } = useProducts();
  const featured = useMemo(
    () => pickFeatured(getStorefrontArtworks(products)),
    [products],
  );

  // Decide once whether to pull the 3D bundle. We use a state
  // initialiser to avoid double-rendering.
  const [supports3D] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.(DESKTOP_QUERY).matches ?? false;
  });

  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const springCfg = { stiffness: 220, damping: 26, mass: 0.4 };
  const wordmarkRotateY = useSpring(
    useTransform(tiltX, [-0.5, 0.5], [-3, 3]),
    springCfg,
  );
  const wordmarkRotateX = useSpring(
    useTransform(tiltY, [-0.5, 0.5], [2, -2]),
    springCfg,
  );
  const wordmarkTranslateY = useSpring(
    useTransform(tiltY, [-0.5, 0.5], [-6, 6]),
    springCfg,
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

  // Smoothly scroll to the next section when the "Here's how we
  // make it" prompt is pressed. Honours user-agent reduced-motion
  // preference by jumping rather than animating.
  const onNextClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const el = document.getElementById(nextSectionId);
    if (!el) return;
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  };

  const featuredImage = featured?.images?.[0]
    ? variantSrc(featured.images[0], "md")
    : featured?.image;

  return (
    <section
      ref={sectionRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetTilt}
      aria-label="Canvas Hub — Filipino hand-crafted paintings"
      className="floema-hero relative isolate w-full overflow-hidden"
      style={{ minHeight: "min(100svh, 880px)", height: "min(100svh, 880px)" }}
    >
      {/* Subtle paper grain. A tiny SVG noise pattern is layered at
          very low opacity so the cream surface doesn't read as flat
          poster paper. No coloured radial blooms — those clashed
          with the WebGL canvas's transparent background. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 opacity-[0.06] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.35 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
          backgroundSize: "220px 220px",
        }}
      />

      {/* Centre stage: the oversized italic wordmark sitting *behind*
          the 3D sculpture. We use motion transforms for a subtle
          parallax tilt that picks up the cursor without disturbing
          the type baseline. */}
      <motion.div
        style={{
          rotateX: wordmarkRotateX,
          rotateY: wordmarkRotateY,
          y: wordmarkTranslateY,
          transformStyle: "preserve-3d",
        }}
        className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center [perspective:1600px] motion-reduce:!transform-none"
      >
        <AnimeHeading
          as="h1"
          by="letter"
          staggerMs={70}
          durationMs={1100}
          yFrom={28}
          delayMs={180}
          ease="outExpo"
          className="font-display select-none whitespace-nowrap text-[clamp(4rem,16vw,15rem)] font-medium leading-[0.95] tracking-[-0.04em] text-foreground"
        >
          Canvas Hub
        </AnimeHeading>
        <span
          aria-hidden="true"
          className="ml-1 mt-[-0.45em] font-display text-[clamp(0.9rem,1.4vw,1.4rem)] text-foreground"
        >
          ®
        </span>
      </motion.div>

      {/* Lazy 3D sculptural monogram. Centred and sized to sit *over*
          the wordmark's middle letters — the visual joke that the
          stone-and-moss "C" emerges from inside the word. On mobile
          / coarse-pointer devices this slot is replaced by the
          featured-painting fallback, below. */}
      {supports3D ? (
        <div className="pointer-events-auto absolute inset-x-0 top-[28%] z-20 mx-auto h-[58%] w-[min(620px,72vw)]">
          <Suspense
            fallback={
              <StaticSculptureFallback
                featured={featured}
                image={featuredImage}
              />
            }
          >
            <FloemaSculpture3D />
          </Suspense>
        </div>
      ) : (
        <div className="pointer-events-none absolute inset-x-0 top-[28%] z-20 mx-auto h-[58%] w-[min(620px,82vw)]">
          <StaticSculptureFallback featured={featured} image={featuredImage} />
        </div>
      )}

      {/* Bottom-left tagline + "here's how we do it" prompt. */}
      <div className="pointer-events-auto absolute bottom-8 left-4 z-30 max-w-[14rem] sm:bottom-10 sm:left-8 md:bottom-12 md:left-12">
        <AnimeHeading
          as="p"
          by="word"
          staggerMs={70}
          durationMs={780}
          yFrom={14}
          delayMs={780}
          ease="outQuad"
          className="font-display text-[1.05rem] leading-[1.2] text-foreground"
        >
          Hand-crafted art, framed for living
        </AnimeHeading>
        <a
          href={`#${nextSectionId}`}
          onClick={onNextClick}
          className="mt-3 inline-flex items-center gap-1.5 border-t border-foreground/25 pt-2 font-body text-[0.7rem] uppercase tracking-[0.22em] text-foreground/70 transition-colors hover:text-foreground"
        >
          Here&rsquo;s how we make it
          <ArrowDown className="h-3 w-3" strokeWidth={1.75} />
        </a>
      </div>

      {/* Bottom-right glassmorphic "Get in touch" card. Uses an anchor
          tag (not the router Link) because we always want to land
          at `/#contact`, scroll there, and the homepage's existing
          ContactSection already handles smooth-scrolling on hash
          change. */}
      <a
        href="/#contact"
        className="group pointer-events-auto absolute bottom-8 right-4 z-30 hidden w-[min(280px,32vw)] overflow-hidden rounded-3xl border border-foreground/8 bg-foreground/[0.04] shadow-[0_18px_40px_-22px_rgba(0,0,0,0.45)] backdrop-blur-md transition-all duration-500 hover:-translate-y-1 hover:bg-foreground/[0.08] motion-reduce:transition-none sm:bottom-10 sm:right-8 sm:block md:bottom-12 md:right-12"
      >
        <div className="relative aspect-[16/10] w-full">
          {/* The card's image is the same featured painting feeding
              the static-fallback below, slightly darkened so the
              white card copy reads on top. Falls back to a brand-gold
              tint if no products have loaded yet. */}
          {featuredImage ? (
            <>
              <img
                src={featuredImage}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-foreground/85 via-foreground/55 to-foreground/15"
              />
            </>
          ) : (
            <div
              aria-hidden="true"
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(135deg, color-mix(in oklab, var(--logo-color) 35%, #1c1c1c) 0%, #1c1c1c 90%)",
              }}
            />
          )}
          <div className="absolute inset-0 flex flex-col justify-between p-4 text-background">
            <p className="font-display text-[0.95rem] leading-[1.2]">
              Every painting starts with a&nbsp;conversation.
            </p>
            <span className="inline-flex items-center gap-2 self-start rounded-full bg-background/90 px-3 py-1.5 font-body text-[0.65rem] uppercase tracking-[0.22em] text-foreground transition-colors group-hover:bg-background">
              <Mail className="h-3 w-3" strokeWidth={2} />
              Get in touch
            </span>
          </div>
        </div>
      </a>
    </section>
  );
};

interface StaticSculptureFallbackProps {
  featured: DisplayArtwork | null | undefined;
  image: string | undefined;
}

/**
 * Lightweight fallback for the 3D sculpture — used on mobile and
 * while the WebGL chunk is still downloading. Renders the same
 * featured painting in a sculpted "C"-shaped mask so the layout
 * doesn't visibly jump when the canvas mounts.
 */
function StaticSculptureFallback({
  featured,
  image,
}: StaticSculptureFallbackProps) {
  if (!image || !featured) {
    return (
      <div
        aria-hidden="true"
        className="floema-fallback-mask absolute inset-0 mx-auto h-full w-full max-w-[520px]"
        style={{
          background:
            "conic-gradient(from 220deg at 50% 50%, #6d6357, #b4a48c, #6d6357)",
        }}
      />
    );
  }
  return (
    <div className="relative mx-auto h-full w-full max-w-[520px]">
      <div
        aria-hidden="true"
        className="floema-fallback-mask absolute inset-0"
        style={{
          backgroundImage: `url(${image})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 mix-blend-multiply"
        style={{
          background:
            "radial-gradient(circle at 35% 30%, transparent 40%, rgba(28,28,28,0.45) 75%)",
        }}
      />
    </div>
  );
}

export default FloemaHero;
