import { createFileRoute, Link } from "@tanstack/react-router";
import { Heart, ArrowLeft, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import GalleryNav from "@/components/GalleryNav";
import SiteFooter from "@/components/SiteFooter";
import {
  getEffectivePrice,
  getDiscountPercent,
  useProducts,
  type Product,
} from "@/contexts/ProductContext";
import { useSEO } from "@/hooks/useSEO";
import { findDefaultArtwork } from "@/lib/artworks";
import { formatPHP } from "@/lib/format";

/**
 * Public, read-only wishlist view. Visitors generate this link from
 * the in-drawer "Share wishlist" button — the recipient lands here
 * without needing an account and sees exactly the same paintings the
 * sender saved.
 *
 *   /wishlist/share?ids=ID1,ID2,ID3
 *   /wishlist/share?ids=...&from=Marie
 *
 * Painting metadata is hydrated from the live `useProducts()`
 * collection so prices / availability always match what the rest of
 * the storefront shows. Missing ids (deleted products) fall back to
 * `findArtworkById` to cover the built-in default artworks, and any
 * ids we can't resolve are listed at the bottom so the recipient
 * still sees a count instead of a silent drop.
 */
export const Route = createFileRoute("/wishlist/share")({
  component: WishlistSharePage,
  head: () => ({
    meta: [
      { title: "A wishlist from Canvas Hub" },
      {
        name: "description",
        content:
          "A friend shared their hand-picked Canvas Hub wishlist with you. Browse the paintings they saved.",
      },
      // Don't index a per-recipient URL — wishlist shares aren't
      // canonical and we'd rather the catalogue pages rank.
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const readSearchParam = (key: string): string | null => {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(key);
};

const parseIds = (raw: string | null): string[] => {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
};

interface ResolvedEntry {
  id: string;
  product: Product | null;
}

function WishlistSharePage() {
  useSEO({
    title: "A wishlist from Canvas Hub",
    description:
      "A friend shared their hand-picked Canvas Hub wishlist with you. Browse the paintings they saved.",
    canonicalPath: "/wishlist/share",
    noindex: true,
  });

  // Read once at mount — search params drive the whole page, no
  // need to subscribe to router state.
  const [params] = useState(() => ({
    ids: parseIds(readSearchParam("ids")),
    from: (readSearchParam("from") || "").slice(0, 80),
  }));
  const { products, productsLoaded } = useProducts();

  const resolved: ResolvedEntry[] = useMemo(() => {
    if (params.ids.length === 0) return [];
    return params.ids.map((id) => {
      const fromCatalogue = products.find((p) => p.id === id) ?? null;
      if (fromCatalogue) return { id, product: fromCatalogue };
      // Built-in default artworks aren't part of `/api/products`, so
      // adapt the static `DisplayArtwork` shape to the `Product`
      // interface where overlap allows.
      const fallback = findDefaultArtwork(id);
      if (fallback) {
        return {
          id,
          product: {
            id: fallback.id,
            image: fallback.image,
            title: fallback.title,
            medium: fallback.medium,
            year: fallback.year,
            price: fallback.price,
            salePrice: fallback.salePrice,
            description: fallback.description,
            createdAt: new Date(0).toISOString(),
            images: fallback.images,
          } satisfies Product,
        };
      }
      return { id, product: null };
    });
  }, [params.ids, products]);

  const resolvedCount = resolved.filter((r) => r.product).length;
  const missingCount = resolved.length - resolvedCount;

  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard denied — silently noop, the URL is still in the
      // address bar.
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <GalleryNav />
      <main
        id="main-content"
        className="max-w-5xl mx-auto px-4 sm:px-6 pt-28 pb-16"
      >
        <Link
          to="/collection"
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Browse the full collection
        </Link>

        <header className="mb-10">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full border border-border/60 mb-4">
            <Heart className="w-5 h-5 text-foreground/80" />
          </div>
          <h1 className="font-display text-3xl sm:text-4xl text-foreground">
            {params.from
              ? `${params.from}'s Canvas Hub wishlist`
              : "A shared Canvas Hub wishlist"}
          </h1>
          <p className="font-body text-sm text-muted-foreground mt-3 max-w-xl">
            These are the paintings your friend has been eyeing. Each piece is
            one of one — never reprinted. Tap any card to view the full story.
          </p>
          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-foreground border border-border/60 rounded-sm px-3 py-2 hover:bg-accent/50 transition-colors"
            >
              {copied ? "Link copied" : "Copy share link"}
            </button>
            <span className="text-xs text-muted-foreground">
              {resolvedCount} painting{resolvedCount === 1 ? "" : "s"}
            </span>
          </div>
        </header>

        {params.ids.length === 0 ? (
          <div className="border border-dashed border-border/60 rounded-xl p-10 text-center bg-card/30">
            <p className="text-sm text-muted-foreground">
              This share link doesn't include any paintings. Ask your friend to
              resend it from their wishlist.
            </p>
          </div>
        ) : !productsLoaded ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading paintings…
          </div>
        ) : (
          <>
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {resolved
                .filter((entry): entry is { id: string; product: Product } =>
                  Boolean(entry.product),
                )
                .map(({ product }) => {
                  const effective = getEffectivePrice(product);
                  const discount = getDiscountPercent(product);
                  return (
                    <li
                      key={product.id}
                      className="group border border-border/50 rounded-xl overflow-hidden bg-card/40"
                    >
                      <Link
                        to="/product/$id"
                        params={{ id: product.id }}
                        className="block"
                      >
                        <div className="relative aspect-[4/5] bg-muted/40">
                          <img
                            src={product.image}
                            alt={product.title}
                            loading="lazy"
                            decoding="async"
                            className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
                          />
                          {discount > 0 && (
                            <span className="absolute top-3 left-3 bg-foreground text-background text-[10px] font-semibold px-2 py-1 rounded-sm uppercase tracking-wider">
                              -{discount}%
                            </span>
                          )}
                        </div>
                        <div className="p-4">
                          <h2 className="font-display text-lg text-foreground line-clamp-1">
                            {product.title}
                          </h2>
                          <p className="text-xs text-muted-foreground mt-1">
                            {product.medium}
                            {product.year ? ` • ${product.year}` : ""}
                          </p>
                          <p className="text-sm text-foreground mt-3 font-medium">
                            {formatPHP(effective)}
                            {discount > 0 && (
                              <span className="ml-2 text-muted-foreground line-through text-xs">
                                {formatPHP(product.price)}
                              </span>
                            )}
                          </p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
            </ul>
            {missingCount > 0 && (
              <p className="text-xs text-muted-foreground mt-6">
                {missingCount} painting{missingCount === 1 ? " is" : "s are"} no
                longer available and couldn't be shown.
              </p>
            )}
          </>
        )}

        <p className="text-xs text-muted-foreground text-center mt-12">
          Want your own list?{" "}
          <Link
            to="/collection"
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            Start browsing
          </Link>{" "}
          and tap the heart on any painting.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
