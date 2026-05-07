import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  getDiscountPercent,
  getEffectivePrice,
  type Product,
  useProducts,
} from "@/contexts/ProductContext";
import { findArtworkById } from "@/lib/artworks";
import { imgAttrsFromProduct } from "@/lib/productImage";

interface Props {
  currentId: string;
  limit?: number;
  title?: string;
}

type ScoreInput = Pick<Product, "category" | "medium" | "year">;

const score = (a: ScoreInput, b: ScoreInput): number => {
  let s = 0;
  if (a.category && b.category && a.category === b.category) s += 4;
  if (a.medium && b.medium && a.medium === b.medium) s += 2;
  if (a.year && b.year && a.year === b.year) s += 1;
  return s;
};

export default function RelatedProducts({
  currentId,
  limit = 4,
  title = "You might also like",
}: Props) {
  const { products } = useProducts();
  const current = useMemo(
    () => findArtworkById(currentId, products),
    [currentId, products],
  );

  const related = useMemo(() => {
    if (!current) return [];
    // Exclude stock-catalog overrides: their UUID doesn't resolve through
    // `findArtworkById` (which returns the merged default's id), so linking
    // to them would 404. Their customizations are already reflected in the
    // default they replace.
    // Compare against the raw uuid carved out of the display id (the page
    // route receives `product-<uuid>`, but `p.id` is the bare `<uuid>`).
    const currentRawId = currentId.startsWith("product-")
      ? currentId.slice("product-".length)
      : currentId;
    const others = products.filter(
      (p) =>
        p.id !== currentRawId &&
        p.availability !== "draft" &&
        !p.replacesDefaultId,
    );
    const scored = others
      .map((p) => ({ p, s: score(current, p) }))
      .sort((a, b) => b.s - a.s || a.p.title.localeCompare(b.p.title));
    const top = scored.filter((x) => x.s > 0).slice(0, limit);
    if (top.length >= limit) return top.map((x) => x.p);
    // Pad with newest products that haven't been picked.
    const seen = new Set(top.map((x) => x.p.id));
    const filler = others
      .filter((p) => !seen.has(p.id))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, limit - top.length);
    return [...top.map((x) => x.p), ...filler];
  }, [current, products, currentId, limit]);

  if (related.length === 0) return null;

  return (
    <section className="mt-16 border-t border-border/40 pt-10">
      <h2 className="font-display text-2xl text-foreground mb-6">{title}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        {related.map((p) => {
          const discount = getDiscountPercent(p);
          // Grid is 2-up phone / 4-up desktop. Phone slots are ~50 vw,
          // desktop ~25 vw — `md` (800 w) covers both at retina DPR.
          const attrs = imgAttrsFromProduct(
            p,
            "(min-width: 768px) 25vw, 50vw",
            "md",
          );
          return (
            <Link
              key={p.id}
              to="/product/$id"
              params={{ id: `product-${p.id}` }}
              className="group block"
            >
              <div className="relative aspect-[4/5] overflow-hidden bg-muted/30 rounded-sm">
                <img
                  src={attrs.src}
                  srcSet={attrs.srcSet}
                  sizes={attrs.sizes}
                  width={attrs.width}
                  height={attrs.height}
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
                {p.availability === "sold" && " · sold"}
                {p.availability === "reserved" && " · reserved"}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
