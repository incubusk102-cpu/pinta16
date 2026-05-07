import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
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
              className="group flex-none w-[160px] md:w-[180px] snap-start"
            >
              <div className="relative aspect-[4/5] overflow-hidden bg-muted/30 rounded-sm">
                <img
                  {...railAttrs(art)}
                  alt={art.title}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
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
      </div>
    </section>
  );
}
