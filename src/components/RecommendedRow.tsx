import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
    const recent = recentIds
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
    const recentSet = new Set(recentIds);
    const picks = products
      .filter(
        (p) =>
          (p.category || "").trim() === topCategory &&
          !recentSet.has(p.id) &&
          (p.availability ?? "available") === "available",
      )
      .slice(0, LIMIT);
    return { topCategory, picks };
  }, [products, recentIds]);

  if (picks.length === 0) return null;

  return (
    <section className="mt-12 border-t border-border/40 pt-10">
      <div className="flex items-baseline justify-between mb-6">
        <h2 className="font-display text-2xl text-foreground">
          Because you liked <span className="text-primary">{topCategory}</span>
        </h2>
        <span className="text-xs tracking-[0.2em] uppercase text-muted-foreground hidden sm:inline">
          Picked for you
        </span>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
        {picks.map((p) => {
          const discount = getDiscountPercent(p);
          return (
            <Link
              key={p.id}
              to="/product/$id"
              params={{ id: p.id }}
              className="group flex-none w-[160px] md:w-[180px] snap-start"
            >
              <div className="relative aspect-[4/5] overflow-hidden bg-muted/30 rounded-sm">
                <img
                  src={p.image}
                  alt={p.title}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
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
      </div>
    </section>
  );
};

export default RecommendedRow;
