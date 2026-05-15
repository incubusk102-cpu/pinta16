import { useMemo, useRef } from "react";
import { Link } from "@tanstack/react-router";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { Button } from "@/components/ui/button";
import FilmGrain from "@/components/FilmGrain";
import GsapReveal from "@/components/motion/GsapReveal";
import SplitText from "@/components/motion/SplitText";
import { type Product, useProducts } from "@/contexts/ProductContext";
import { type DisplayArtwork, getStorefrontArtworks } from "@/lib/artworks";

// Cinematic full-bleed "intermission" between the dynamic shopping
// carousels (PaintingMarquee / DailyFeature / RecommendedRow /
// RecentlyViewed) and the editorial block (About / ThankYou /
// Reviews / Contact). Replaces the previous text-only CollectionCTA
// card so the homepage breathes between sections — addresses the
// "products feel boring" feedback by giving the browse-the-collection
// moment its own scene.
//
// Anchor id `gallery` is preserved so back-compat links like
// `/#gallery` (and any saved hero-slide CTAs that pre-date PR #349's
// `/collection` migration) still scroll to a sensible place.
const TILE_COUNT = 4;

// Walk the catalogue with the newest customer-posted artworks at the
// front. ProductContext already sorts `products` createdAt-desc, so a
// freshly posted painting bubbles to index 0 here — which the collage
// anchors on so the background visibly refreshes whenever a new
// product is published.
const orderForCollage = (
  products: Product[],
  all: DisplayArtwork[],
): { ordered: DisplayArtwork[]; freshCount: number } => {
  const byId = new Map(all.map((a) => [a.id, a] as const));
  const fresh: DisplayArtwork[] = [];
  for (const p of products) {
    // An override surfaces under its `default-<slug>` id (see
    // getAllArtworks); pure uploads surface as `product-<uuid>`.
    const id = p.replacesDefaultId ?? `product-${p.id}`;
    const art = byId.get(id);
    if (art) {
      fresh.push(art);
      byId.delete(id);
    }
  }
  return {
    ordered: [...fresh, ...byId.values()],
    freshCount: fresh.length,
  };
};

const pickTiles = (
  products: Product[],
  all: DisplayArtwork[],
): DisplayArtwork[] => {
  if (all.length === 0) return [];
  const { ordered, freshCount } = orderForCollage(products, all);
  // When the operator has posted at least four products, keep the
  // collage entirely on those — that way every new upload swaps a
  // tile and the scene stays tied to live inventory. With fewer
  // customer-posted pieces, spread across the merged catalogue so
  // the four tiles still feel varied.
  const span = freshCount >= TILE_COUNT ? freshCount : ordered.length;
  const seen = new Set<string>();
  const picks: DisplayArtwork[] = [];
  for (let k = 0; k < TILE_COUNT; k++) {
    const idx = Math.floor((k * span) / TILE_COUNT);
    const art = ordered[idx % ordered.length];
    if (art && !seen.has(art.id)) {
      seen.add(art.id);
      picks.push(art);
    }
  }
  // Fill any gaps (collisions on a tiny catalogue, duplicate picks)
  // so the grid is always TILE_COUNT wide.
  for (const art of ordered) {
    if (picks.length >= TILE_COUNT) break;
    if (!seen.has(art.id)) {
      seen.add(art.id);
      picks.push(art);
    }
  }
  return picks.slice(0, TILE_COUNT);
};

const CinematicCollectionCTA = () => {
  const { products } = useProducts();
  const reduce = useReducedMotion();
  const containerRef = useRef<HTMLElement>(null);

  const tiles = useMemo(
    () => pickTiles(products, getStorefrontArtworks(products)),
    [products],
  );

  // Slow drift of the collage as the user scrolls past the section.
  // Range is intentionally subtle (-8% .. +8%) so motion feels
  // cinematic, not arcade-y.
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });
  const collageY = useTransform(scrollYProgress, [0, 1], ["-8%", "8%"]);

  return (
    <section
      ref={containerRef}
      id="gallery"
      aria-label="Browse the collection"
      className="relative min-h-[60vh] sm:min-h-[70vh] md:min-h-[78vh] overflow-hidden bg-background"
    >
      {/* Background collage. Each tile is a real artwork, dimmed so
          the foreground headline stays readable while the colours
          and brushwork still register. The collage drifts vertically
          via framer-motion's scroll parallax; the tiles themselves
          stage in via a GSAP ScrollTrigger reveal (rise + scale +
          fade) the first time the section enters the viewport. */}
      {tiles.length > 0 && (
        <motion.div
          aria-hidden
          className="absolute inset-0"
          style={reduce ? undefined : { y: collageY }}
        >
          <GsapReveal
            className="absolute inset-0 grid grid-cols-2 md:grid-cols-4"
            stagger={0.12}
            duration={0.95}
            yFrom={36}
            scaleFrom={0.9}
            start="top 85%"
          >
            {tiles.map((art, i) => (
              <div
                key={art.id}
                data-gsap-reveal-item
                className="relative overflow-hidden"
              >
                <img
                  src={art.image}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                  style={{
                    // Saturation pulled down + brightness floor so the
                    // foreground copy stays legible without losing the
                    // sense that you're looking at actual paintings.
                    filter: "saturate(0.85) brightness(0.6)",
                    transform: i % 2 === 0 ? "scale(1.06)" : "scale(1.1)",
                  }}
                />
              </div>
            ))}
          </GsapReveal>
        </motion.div>
      )}

      {/* Top + bottom soft fades so the section blends into the
          adjacent sections rather than looking like a hard slab. */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/85 via-background/55 to-background/90" />

      {/* Centre vignette to push attention onto the headline. */}
      <div
        className="absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.35) 80%)",
        }}
      />

      {/* Subtle film grain — keeps the look cinematic and hides the
          banding we'd otherwise see on the dark wash gradient. */}
      <FilmGrain opacity={0.07} />

      {/* Foreground content */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center min-h-[60vh] sm:min-h-[70vh] md:min-h-[78vh] px-4 sm:px-6 md:px-12 max-w-3xl mx-auto">
        <motion.p
          initial={reduce ? false : { opacity: 0, y: 16 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15% 0px" }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="font-body text-[10px] sm:text-xs tracking-[0.45em] uppercase text-foreground/70 mb-5"
        >
          The collection
        </motion.p>
        <SplitText
          as="h2"
          by="word"
          stagger={0.08}
          duration={0.95}
          yFrom={36}
          className="font-display text-3xl sm:text-5xl md:text-6xl lg:text-7xl text-foreground leading-[1.05] mb-6 drop-shadow-md"
        >
          Every painting, in one place.
        </SplitText>
        <motion.p
          initial={reduce ? false : { opacity: 0, y: 18 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15% 0px" }}
          transition={{ duration: 0.85, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="font-body text-sm sm:text-base text-foreground/80 leading-relaxed max-w-xl mb-9"
        >
          Browse the full catalogue — search by mood, filter by category or
          price, and find the piece that fits your wall.
        </motion.p>
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 18 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15% 0px" }}
          transition={{ duration: 0.85, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
        >
          <Button
            asChild
            size="lg"
            className="rounded-none px-8 font-body text-xs uppercase tracking-[0.3em] sm:px-10"
          >
            <Link to="/collection">Browse the collection</Link>
          </Button>
        </motion.div>
      </div>
    </section>
  );
};

export default CinematicCollectionCTA;
