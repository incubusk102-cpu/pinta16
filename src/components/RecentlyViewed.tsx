import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getEffectivePrice, useProducts } from "@/contexts/ProductContext";
import {
  clearRecentlyViewed,
  getRecentlyViewed,
  subscribeRecentlyViewed,
} from "@/lib/recentlyViewed";

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

  const visible = ids
    .filter((id) => id !== excludeId)
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .slice(0, limit);

  if (visible.length === 0) return null;

  return (
    <section className="mt-16 border-t border-border/40 pt-10">
      <div className="flex items-baseline justify-between mb-6">
        <h2 className="font-display text-2xl text-foreground">
          Recently viewed
        </h2>
        <button
          type="button"
          onClick={clearRecentlyViewed}
          className="text-xs tracking-[0.2em] uppercase text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <X className="w-3 h-3" />
          Clear
        </button>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
        {visible.map((p) => (
          <Link
            key={p.id}
            to="/product/$id"
            params={{ id: p.id }}
            className="group flex-none w-[160px] md:w-[180px] snap-start"
          >
            <div className="aspect-[4/5] overflow-hidden bg-muted/30 rounded-sm">
              <img
                src={p.image}
                alt={p.title}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>
            <p className="mt-2 font-display text-sm text-foreground line-clamp-1">
              {p.title}
            </p>
            <p className="font-body text-xs tracking-[0.15em] uppercase text-muted-foreground">
              ₱{getEffectivePrice(p).toLocaleString()}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
