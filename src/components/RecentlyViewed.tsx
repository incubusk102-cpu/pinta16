import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import GsapStaggerRail from "@/components/motion/GsapStaggerRail";
import SectionReveal from "@/components/motion/SectionReveal";
import SplitText from "@/components/motion/SplitText";
import { useProducts, type ProductImage } from "@/contexts/ProductContext";
import { getStorefrontArtworks } from "@/lib/artworks";
import { imgAttrsFromProduct } from "@/lib/productImage";
import {
  clearRecentlyViewed,
  getRecentlyViewed,
  subscribeRecentlyViewed,
} from "@/lib/recentlyViewed";

// Rail thumbnails are 180 px on desktop / 160 px on phone — pick the
// `sm` (400 w) variant on 2x DPR, `md` (800 w) on 3x. Either is far
// smaller than the legacy full-resolution download.
const railAttrs = (art: { image: string; images?: ProductImage[] }) =>
  imgAttrsFromProduct(art, "180px", "sm");

interface Props {
  excludeId?: string;
  limit?: number;
}

export default function RecentlyViewed({ excludeId, limit = 8 }: Props) {
  const { products } = useProducts();
  const [ids, setIds] = useState<string[]>(() => getRecentlyViewed());

  useEffect(() => {
    setIds(getRecentlyViewed());
    const unsub = subscribeRecentlyViewed(() => setIds(getRecentlyViewed()));
    return () => {
      unsub();
    };
  }, []);

  // Resolve recent ids against the merged display catalogue (defaults +
  // uploads). Recent ids are display ids (e.g. `product-<uuid>` or
  // `default-<slug>`), and `getStorefrontArtworks` returns artworks keyed
  // by the same display id, so this lookup works for both kinds.
  const artworks = useMemo(() => getStorefrontArtworks(products), [products]);
  const visible = ids
    .filter((id) => id !== excludeId)
    .map((id) => artworks.find((art) => art.id === id))
    .filter((art): art is NonNullable<typeof art> => Boolean(art))
    .slice(0, limit);

  if (visible.length === 0) return null;

  return (
    <SectionReveal
      as="section"
      from="bottom"
      distance={48}
      duration={0.85}
      staggerChildren={0.08}
      className="mt-16 border-t border-border/40 pt-10"
    >
      <motion.div
        variants={{
          hidden: { opacity: 0, y: 18 },
          visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
          },
        }}
        className="flex items-baseline justify-between gap-4 mb-6"
      >
        <div className="min-w-0">
          <p className="font-body text-[10px] sm:text-xs tracking-[0.4em] uppercase text-muted-foreground mb-1.5">
            Saved by you
          </p>
          <SplitText
            as="h2"
            by="word"
            stagger={0.06}
            duration={0.8}
            yFrom={22}
            className="font-display text-2xl sm:text-3xl text-foreground leading-tight"
          >
            Recently viewed
          </SplitText>
        </div>
        <button
          type="button"
          onClick={clearRecentlyViewed}
          className="shrink-0 font-body text-[10px] tracking-[0.3em] uppercase text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
        >
          <X className="w-3 h-3" />
          Clear
        </button>
      </motion.div>
      {/* Card stagger driven by GSAP ScrollTrigger — mirrors
          RecommendedRow so both rails share the same entry motion. */}
      <GsapStaggerRail
        className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory"
        stagger={0.07}
        duration={0.7}
        xFrom={-28}
        yFrom={12}
        scaleFrom={0.94}
        start="top 88%"
      >
        {visible.map((art) => {
          const effective =
            typeof art.salePrice === "number" && art.salePrice < art.price
              ? art.salePrice
              : art.price;
          const discount =
            effective < art.price
              ? Math.round(((art.price - effective) / art.price) * 100)
              : 0;
          return (
            <Link
              key={art.id}
              to="/product/$id"
              params={{ id: art.id }}
              data-rail-item
              className="group flex-none w-[160px] md:w-[180px] snap-start"
            >
              <div className="relative aspect-[4/5] overflow-hidden bg-muted/30 rounded-sm shadow-[0_2px_18px_rgba(0,0,0,0.08)] transition-shadow duration-500 group-hover:shadow-[0_18px_44px_rgba(0,0,0,0.28)]">
                <img
                  {...railAttrs(art)}
                  alt={art.title}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.09] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                />
                {/* Hover gradient sweep — matches RecommendedRow + the
                    main ArtworkCard so all rails read as one family. */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                {discount > 0 && art.availability === "available" && (
                  <span className="absolute top-2 left-2 px-1.5 py-0.5 bg-red-600 text-white font-body text-[10px] tracking-wider uppercase rounded-sm">
                    {discount}% OFF
                  </span>
                )}
              </div>
              <p className="mt-2 font-display text-sm text-foreground line-clamp-1">
                {art.title}
              </p>
              <p className="font-body text-xs tracking-[0.15em] uppercase text-muted-foreground">
                {discount > 0 ? (
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
      </GsapStaggerRail>
    </SectionReveal>
  );
}
