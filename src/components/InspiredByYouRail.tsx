import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import SectionReveal from "@/components/motion/SectionReveal";
import { useProducts, getEffectivePrice } from "@/contexts/ProductContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { getStorefrontArtworks, type DisplayArtwork } from "@/lib/artworks";
import { imgAttrsFromProduct } from "@/lib/productImage";

/**
 * Rail that suggests paintings inspired by what the visitor has saved
 * to their wishlist. The heuristic is intentionally simple — strong
 * enough to feel personal without inviting the maintenance burden of
 * a real recommendation system:
 *
 * 1. Resolve every wishlist id against the live `getStorefrontArtworks`
 *    list so the seeds carry medium / year / category metadata.
 * 2. Score every other available painting by overlap on category /
 *    medium / year (closer year = higher score, same medium = strong
 *    signal, same category = decisive).
 * 3. Drop the seeds themselves, sort by score, take the top 8.
 *
 * When the wishlist is empty (or no seeds resolve), the rail falls
 * back to the most recent 8 available paintings under a "Featured"
 * heading so the slot still feels populated for new visitors.
 *
 * Renders nothing if no candidates remain (e.g. only 1 painting on
 * the storefront). The caller (`/`, `/collection`) is responsible
 * for placement.
 */

const LIMIT = 8;

interface Candidate extends DisplayArtwork {
  score: number;
}

function yearProximity(seedYear: string, candYear: string): number {
  const a = Number(seedYear);
  const b = Number(candYear);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  const diff = Math.abs(a - b);
  if (diff === 0) return 3;
  if (diff <= 1) return 2;
  if (diff <= 3) return 1;
  return 0;
}

function scoreAgainstSeeds(
  candidate: DisplayArtwork,
  seeds: DisplayArtwork[],
): number {
  let score = 0;
  for (const seed of seeds) {
    if (
      seed.category &&
      candidate.category &&
      seed.category.toLowerCase() === candidate.category.toLowerCase()
    ) {
      score += 6;
    }
    if (
      seed.medium &&
      candidate.medium &&
      seed.medium.toLowerCase() === candidate.medium.toLowerCase()
    ) {
      score += 4;
    }
    score += yearProximity(seed.year, candidate.year);
  }
  return score;
}

const InspiredByYouRail = () => {
  const { products } = useProducts();
  const { items: wishlistItems } = useWishlist();

  const { heading, picks } = useMemo(() => {
    const allArtworks = getStorefrontArtworks(products);
    const purchasable = allArtworks.filter(
      (a) => a.availability === "available",
    );
    if (purchasable.length === 0) {
      return { heading: "", picks: [] as DisplayArtwork[] };
    }
    const wishlistIds = new Set(wishlistItems.map((w) => w.id));
    const seeds = purchasable.filter((a) => wishlistIds.has(a.id));
    if (seeds.length === 0) {
      // Cold-start fallback — pick the freshest available paintings so
      // the slot still gives the visitor a starting point.
      return {
        heading: "Featured paintings",
        picks: purchasable.slice(0, LIMIT),
      };
    }
    const seedIds = new Set(seeds.map((s) => s.id));
    const scored: Candidate[] = purchasable
      .filter((a) => !seedIds.has(a.id))
      .map((a) => ({ ...a, score: scoreAgainstSeeds(a, seeds) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, LIMIT);
    if (scored.length === 0) {
      return {
        heading: "Featured paintings",
        picks: purchasable.filter((a) => !seedIds.has(a.id)).slice(0, LIMIT),
      };
    }
    return { heading: "Inspired by your saves", picks: scored };
  }, [products, wishlistItems]);

  if (picks.length === 0) return null;

  return (
    <SectionReveal
      as="section"
      from="bottom"
      distance={40}
      duration={0.8}
      staggerChildren={0.07}
      className="mt-12 border-t border-border/40 pt-10"
      aria-label={heading}
    >
      <motion.div
        variants={{
          hidden: { opacity: 0, y: 14 },
          visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
          },
        }}
        className="flex items-baseline justify-between gap-4 mb-6"
      >
        <div className="min-w-0">
          <p className="font-body text-[10px] sm:text-xs tracking-[0.4em] uppercase text-muted-foreground mb-1.5 inline-flex items-center gap-1.5">
            <Sparkles aria-hidden className="w-3 h-3" /> For you
          </p>
          <h2 className="font-display text-2xl sm:text-3xl text-foreground leading-tight">
            {heading}
          </h2>
        </div>
        <span className="hidden sm:inline shrink-0 font-body text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
          Hand-picked
        </span>
      </motion.div>
      <motion.div
        variants={{
          hidden: { opacity: 0, y: 22 },
          visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] },
          },
        }}
        className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory"
      >
        {picks.map((art) => {
          const attrs = imgAttrsFromProduct(art, "180px", "sm");
          const effective = getEffectivePrice(art);
          const hasDiscount = effective < art.price;
          return (
            <Link
              key={art.id}
              to="/product/$id"
              params={{ id: art.id }}
              className="group flex-none w-[160px] md:w-[180px] snap-start"
            >
              <div className="relative aspect-[4/5] overflow-hidden bg-muted/30 rounded-sm shadow-[0_2px_18px_rgba(0,0,0,0.08)] transition-shadow duration-500 group-hover:shadow-[0_18px_44px_rgba(0,0,0,0.28)]">
                <img
                  src={attrs.src}
                  srcSet={attrs.srcSet}
                  sizes={attrs.sizes}
                  width={attrs.width}
                  height={attrs.height}
                  alt={art.title}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.09] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              </div>
              <p className="mt-2 font-display text-sm text-foreground line-clamp-1">
                {art.title}
              </p>
              <p className="font-body text-xs tracking-[0.15em] uppercase text-muted-foreground">
                {hasDiscount ? (
                  <>
                    <span className="line-through mr-1 opacity-60">
                      ₱{art.price.toLocaleString()}
                    </span>
                    <span className="text-foreground">
                      ₱{effective.toLocaleString()}
                    </span>
                  </>
                ) : (
                  <>₱{effective.toLocaleString()}</>
                )}
              </p>
            </Link>
          );
        })}
      </motion.div>
    </SectionReveal>
  );
};

export default InspiredByYouRail;
