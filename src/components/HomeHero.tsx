import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import { useProducts } from "@/contexts/ProductContext";
import { getStorefrontArtworks, type DisplayArtwork } from "@/lib/artworks";
import { variantSrc } from "@/lib/productImage";

// Orchestrates the homepage hero: a lazy-loaded 3D scene on desktop,
// a lighter static fallback on mobile / cheap devices. The desktop
// path drags in three.js + r3f + drei + postprocessing (~270 KB gz)
// — fine on a wired connection but wasteful on the average Philippine
// mobile customer's data plan, which is the bulk of canvhub's
// traffic. Picking the cheaper variant up front keeps mobile fast
// and the desktop hero immersive.

const Hero3D = lazy(() => import("@/components/Hero3D"));

const DESKTOP_QUERY = "(min-width: 768px) and (pointer: fine)";

const pickFeatured = (artworks: DisplayArtwork[]): DisplayArtwork | null => {
  // ProductContext orders products createdAt-desc, so the freshest
  // customer-posted painting is first; fall through to the seeded
  // catalogue when nothing has been uploaded yet.
  return artworks[0] ?? null;
};

function StaticHero({ featured }: { featured: DisplayArtwork }) {
  // 2D fallback: a single full-bleed framed painting with the wordmark
  // floated underneath. No canvas, no postprocessing — works on a
  // cold mobile connection, holds layout while CSS paints.
  //
  // Layered on top of the plain background we now paint a slowly
  // drifting gradient mesh and a cursor-tracked perspective tilt on
  // the framed painting itself. Both layers are pure CSS / Framer
  // Motion — no extra runtime cost — and degrade to a still image
  // for `prefers-reduced-motion`.
  const featuredImage = featured.images?.[0]
    ? variantSrc(featured.images[0], "md")
    : featured.image;

  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const springConfig = { stiffness: 260, damping: 28, mass: 0.4 };
  const rotateX = useSpring(
    useTransform(tiltY, [-0.5, 0.5], [5, -5]),
    springConfig,
  );
  const rotateY = useSpring(
    useTransform(tiltX, [-0.5, 0.5], [-5, 5]),
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

  return (
    <section
      ref={sectionRef}
      aria-label="Canvas Hub — featured painting"
      className="relative w-full h-[80vh] min-h-[520px] overflow-hidden bg-background [perspective:1400px]"
      onPointerMove={handlePointerMove}
      onPointerLeave={resetTilt}
    >
      {/* Animated gradient mesh — three slow-drifting radial blooms
          on top of the brand-warm vignette. CSS-only, paused under
          `prefers-reduced-motion`. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(58,38,24,0.18),transparent_65%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 home-hero-mesh motion-reduce:animate-none"
      />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <motion.div
          style={{
            rotateX,
            rotateY,
            transformStyle: "preserve-3d",
          }}
          className="relative w-[78vw] max-w-[420px] aspect-[4/5] shadow-[0_18px_60px_-12px_rgba(0,0,0,0.45)] motion-reduce:!transform-none"
        >
          {/* Wood frame: a thick brown ring around the image. */}
          <div className="absolute inset-0 bg-[#3a2618]" />
          <img
            src={featuredImage}
            alt={featured.title}
            loading="eager"
            decoding="async"
            className="absolute inset-[6%] object-cover w-[88%] h-[88%]"
          />
          {/* Brand-gold rim glow behind the frame. Hidden under
              `prefers-reduced-motion` so the hero reads as a still
              photo. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-3 -z-[1] rounded-sm opacity-50 blur-2xl motion-reduce:hidden"
            style={{
              background:
                "radial-gradient(closest-side, color-mix(in oklab, var(--logo-color) 65%, transparent), transparent 75%)",
            }}
          />
        </motion.div>
      </div>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end pb-10 px-6 text-center">
        <h1 className="font-display text-4xl tracking-[0.04em] text-foreground drop-shadow-[0_2px_24px_rgba(0,0,0,0.18)]">
          Canvas Hub
        </h1>
        <p className="mt-3 max-w-xl font-body text-[11px] tracking-[0.3em] uppercase text-muted-foreground">
          Hand-crafted paintings, framed and ready to hang
        </p>
        <Link
          to="/collection"
          className="pointer-events-auto mt-6 inline-flex items-center justify-center font-body text-[11px] tracking-[0.3em] uppercase px-6 py-3 bg-foreground/95 text-background hover:bg-foreground transition-colors duration-300 hover-glow-cta"
        >
          Browse the collection
        </Link>
      </div>
      <Link
        to="/product/$id"
        params={{ id: featured.id }}
        className="absolute top-4 right-4 max-w-[60%] text-right font-body text-[10px] tracking-[0.3em] uppercase text-muted-foreground hover:text-foreground transition-colors"
      >
        Now showing · {featured.title}
      </Link>
    </section>
  );
}

export default function HomeHero() {
  const { products } = useProducts();
  const featured = useMemo(
    () => pickFeatured(getStorefrontArtworks(products)),
    [products],
  );

  // Decide once at first render whether the device should pull the
  // 3D bundle. Mobile / coarse-pointer devices stay on the static
  // hero — they get the same brand statement without the chunk
  // download. Use a useState initializer so we don't trigger a
  // second render after deciding.
  const [supports3D] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.(DESKTOP_QUERY).matches ?? false;
  });

  // If the viewport flips to desktop after first paint (orientation
  // change, dock-mode), upgrade to the 3D hero on the fly. We don't
  // downgrade in the other direction — once the chunk's loaded, the
  // 3D hero handles its own reduced-motion fallback gracefully.
  const [upgradedTo3D, setUpgradedTo3D] = useState(false);
  useEffect(() => {
    if (supports3D || typeof window === "undefined") return;
    const mq = window.matchMedia?.(DESKTOP_QUERY);
    if (!mq) return;
    const onChange = () => {
      if (mq.matches) setUpgradedTo3D(true);
    };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [supports3D]);

  if (!featured) {
    return <h1 className="sr-only">Canvas Hub</h1>;
  }

  if (!supports3D && !upgradedTo3D) {
    return <StaticHero featured={featured} />;
  }

  return (
    <Suspense fallback={<StaticHero featured={featured} />}>
      <Hero3D />
    </Suspense>
  );
}
