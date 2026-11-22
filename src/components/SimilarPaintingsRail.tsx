import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Button } from "@/components/ui/button";

gsap.registerPlugin(ScrollTrigger);

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Vector-search-powered "More like this" rail. Calls
 * `/api/products/:id/similar` (Turso + Workers AI embeddings); when Turso
 * isn't configured, the painting hasn't been embedded yet, or the API
 * returns no similar rows, this component renders nothing so the existing
 * rule-based `RelatedProducts` underneath remains the only related-art
 * section visible. There is no "loading" placeholder for the same reason —
 * a flashing-then-empty rail looks worse than no rail at all.
 *
 * The id passed in matches the product page's URL param (`product-<uuid>`);
 * we forward it as-is and let the API normalise it. Cards link back to
 * `/product/product-<uuid>` to match the existing route shape.
 */

interface SimilarPainting {
  id: string;
  title: string;
  category: string | null;
  medium: string | null;
  year: string | null;
  price: number | null;
  salePrice: number | null;
  availability: string;
  image: string | null;
  similarity: number;
}

interface ApiResponse {
  available: boolean;
  similar?: SimilarPainting[];
  reason?: string;
}

interface Props {
  /** Either `product-<uuid>` (route param shape) or the bare `<uuid>`. */
  currentId: string;
  /** Optional override for top-k. Defaults to 6. */
  limit?: number;
}

const formatPHP = (n: number): string =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);

const effectivePrice = (p: SimilarPainting): number => {
  if (
    p.salePrice != null &&
    p.salePrice > 0 &&
    p.price != null &&
    p.salePrice < p.price
  ) {
    return p.salePrice;
  }
  return p.price ?? 0;
};

const discountPercent = (p: SimilarPainting): number => {
  if (
    p.salePrice != null &&
    p.salePrice > 0 &&
    p.price != null &&
    p.salePrice < p.price
  ) {
    return Math.round(((p.price - p.salePrice) / p.price) * 100);
  }
  return 0;
};

export default function SimilarPaintingsRail({ currentId, limit = 6 }: Props) {
  const [items, setItems] = useState<SimilarPainting[]>([]);
  const [loaded, setLoaded] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setItems([]);

    const idParam = encodeURIComponent(currentId);
    fetch(`/api/products/${idParam}/similar?k=${limit}`, {
      headers: { Accept: "application/json" },
    })
      .then((res) => (res.ok ? (res.json() as Promise<ApiResponse>) : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.available && Array.isArray(data.similar)) {
          setItems(data.similar);
        }
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [currentId, limit]);

  const scrollBy = (delta: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: delta, behavior: "smooth" });
  };

  // GSAP ScrollTrigger stagger reveal once tiles have rendered. Items
  // opt-in via `data-rail-item` so the arrow-button row above the
  // scroller isn't picked up. Cleaned up on unmount via
  // gsap.context().revert().
  useEffect(() => {
    if (prefersReducedMotion()) return;
    if (!loaded || items.length < 2) return;
    const host = sectionRef.current;
    if (!host) return;

    const tiles = host.querySelectorAll<HTMLElement>("[data-rail-item]");
    if (tiles.length === 0) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        Array.from(tiles),
        { autoAlpha: 0, x: -24, y: 10, scale: 0.95 },
        {
          autoAlpha: 1,
          x: 0,
          y: 0,
          scale: 1,
          duration: 0.7,
          ease: "power3.out",
          stagger: 0.07,
          scrollTrigger: {
            trigger: host,
            start: "top 88%",
            toggleActions: "play none none none",
          },
        },
      );
    }, host);

    return () => {
      ctx.revert();
    };
  }, [loaded, items.length]);

  // Hide entirely until we have enough results to show a useful rail —
  // a single-card row looks like a bug, and we have a perfectly good
  // rule-based fallback below.
  if (!loaded || items.length < 2) return null;

  return (
    <section ref={sectionRef} className="mt-12 pt-8 border-t border-border/40">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-foreground/70" />
          <h2 className="font-display text-xl text-foreground">
            More like this
          </h2>
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground hidden sm:inline">
            AI-matched
          </span>
        </div>
        <div className="hidden md:flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Scroll left"
            onClick={() => scrollBy(-360)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Scroll right"
            onClick={() => scrollBy(360)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="flex gap-3 md:gap-4 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1 scroll-smooth [scrollbar-width:thin]"
      >
        {items.map((p) => {
          const discount = discountPercent(p);
          const price = effectivePrice(p);
          return (
            <Link
              key={p.id}
              to="/product/$id"
              params={{ id: `product-${p.id}` }}
              data-rail-item
              className="snap-start shrink-0 w-[44vw] sm:w-[30vw] md:w-[18vw] lg:w-[15vw] group"
            >
              <div className="relative aspect-[4/5] overflow-hidden bg-muted/30 rounded-sm">
                {p.image ? (
                  <img
                    src={p.image}
                    alt={p.title}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full bg-muted/40" />
                )}
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
                {discount > 0 && p.price != null ? (
                  <>
                    <span className="line-through mr-1 opacity-60">
                      {formatPHP(p.price)}
                    </span>
                    <span className="text-foreground">{formatPHP(price)}</span>
                  </>
                ) : (
                  formatPHP(price)
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
