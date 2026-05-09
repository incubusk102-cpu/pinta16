import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import SectionReveal from "@/components/motion/SectionReveal";
import SplitText from "@/components/motion/SplitText";
import { imgAttrsFromProduct } from "@/lib/productImage";
import {
  getDiscountPercent,
  getEffectivePrice,
  useProducts,
} from "@/contexts/ProductContext";
import {
  getRecentlyViewed,
  subscribeRecentlyViewed,
} from "@/lib/recentlyViewed";

const LIMIT = 8;

const RecommendedRow = () => {
  const { products } = useProducts();
  const [recentIds, setRecentIds] = useState<string[]>(() =>
    getRecentlyViewed(),
  );

  useEffect(() => {
    setRecentIds(getRecentlyViewed());
    const unsub = subscribeRecentlyViewed(() =>
      setRecentIds(getRecentlyViewed()),
    );
    return () => unsub();
  }, []);

  const { topCategory, picks } = useMemo(() => {
    if (recentIds.length === 0) return { topCategory: "", picks: [] };
    // `recentIds` are artwork display ids (`product-<uuid>` for uploads,
    // `default-<slug>` for stock pieces). For matching against `products`
    // (raw uuids only), strip the `product-` prefix; default-* entries
    // simply won't match and contribute no category signal.
    const recent = recentIds
      .map((id) =>
        id.startsWith("product-") ? id.slice("product-".length) : id,
      )
      .map((id) => products.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p));
    const counts = new Map<string, number>();
    for (const r of recent) {
      const cat = (r.category || "").trim();
      if (!cat) continue;
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }
    let topCategory = "";
    let topCount = 0;
    for (const [cat, count] of counts) {
      if (count > topCount) {
        topCount = count;
        topCategory = cat;
      }
    }
    if (!topCategory) return { topCategory: "", picks: [] };
    const recentRawIds = new Set(
      recentIds.map((id) =>
        id.startsWith("product-") ? id.slice("product-".length) : id,
      ),
    );
    const picks = products
      .filter(
        (p) =>
          (p.category || "").trim() === topCategory &&
          !recentRawIds.has(p.id) &&
          !p.replacesDefaultId &&
          (p.availability ?? "available") === "available",
      )
      .slice(0, LIMIT);
    return { topCategory, picks };
  }, [products, recentIds]);

  if (picks.length === 0) return null;

  return (
    <SectionReveal
      as="section"
      from="bottom"
      distance={48}
      duration={0.85}
      staggerChildren={0.08}
      className="mt-12 border-t border-border/40 pt-10"
    >
      {/* Editorial-style heading block. Eyebrow + display headline +
          right-aligned tagline gives the rail more rhythm than a
          single h2 — paired with SectionReveal so it animates in as
          the rail enters the viewport. */}
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
            For you
          </p>
          <SplitText
            as="h2"
            by="word"
            stagger={0.06}
            duration={0.8}
            yFrom={22}
            className="font-display text-2xl sm:text-3xl text-foreground leading-tight"
          >
            {`Because you liked ${topCategory}`}
          </SplitText>
        </div>
        <span className="hidden sm:inline shrink-0 font-body text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
          Picked for you
        </span>
      </motion.div>
      <motion.div
        variants={{
          hidden: { opacity: 0, y: 24 },
          visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.85, ease: [0.16, 1, 0.3, 1] },
          },
        }}
        className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory"
      >
        {picks.map((p) => {
          const discount = getDiscountPercent(p);
          // Rail thumbnails are ~180 px on desktop / ~160 px on phone.
          // Browser will pick the `sm` (400 w) variant for retina at
          // 2x DPR; `md` (800 w) for 3x. Either is far smaller than
          // the previous full-resolution download.
          const attrs = imgAttrsFromProduct(p, "180px", "sm");
          return (
            <Link
              key={p.id}
              to="/product/$id"
              params={{ id: `product-${p.id}` }}
              className="group flex-none w-[160px] md:w-[180px] snap-start"
            >
              <div className="relative aspect-[4/5] overflow-hidden bg-muted/30 rounded-sm shadow-[0_2px_18px_rgba(0,0,0,0.08)] transition-shadow duration-500 group-hover:shadow-[0_18px_44px_rgba(0,0,0,0.28)]">
                <img
                  src={attrs.src}
                  srcSet={attrs.srcSet}
                  sizes={attrs.sizes}
                  width={attrs.width}
                  height={attrs.height}
                  alt={p.title}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.09] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                />
                {/* Soft bottom gradient appears on hover — matches the
                    “gallery card” treatment on ArtworkCard so the
                    rail thumbnails feel of-a-piece. */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                {discount > 0 && p.availability === "available" && (
                  <span className="absolute top-2 left-2 px-1.5 py-0.5 bg-red-600 text-white font-body text-[10px] tracking-wider uppercase rounded-sm">
                    {discount}% OFF
                  </span>
                )}
              </div>
              <p className="mt-2 font-display text-sm text-foreground line-clamp-1">
                {p.title}
              </p>
              <p className="font-body text-xs tracking-[0.15em] uppercase text-muted-foreground">
                {discount > 0 ? (
                  <>
                    <span className="line-through mr-1 opacity-60">
                      ₱{p.price.toLocaleString()}
                    </span>
                    <span className="text-foreground">
                      ₱{getEffectivePrice(p).toLocaleString()}
                    </span>
                  </>
                ) : (
                  <>₱{getEffectivePrice(p).toLocaleString()}</>
                )}
              </p>
            </Link>
          );
        })}
      </motion.div>
    </SectionReveal>
  );
};

export default RecommendedRow;
