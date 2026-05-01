import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { useCart } from "@/contexts/CartContext";
import {
  getDiscountPercent,
  getEffectivePrice,
  getProductImages,
  useProducts,
} from "@/contexts/ProductContext";
import {
  DEFAULT_GALLERY_ARTWORKS,
  defaultArtworkId,
} from "@/data/default-artworks";

export const Route = createFileRoute("/product/$id")({
  component: ProductPage,
  head: () => ({
    meta: [{ title: "Painting — Pintaterra" }],
  }),
});

function ProductPage() {
  const { id } = useParams({ from: "/product/$id" });
  const { products } = useProducts();
  const { addToCart, openCart } = useCart();
  const [activeIndex, setActiveIndex] = useState(0);

  const item = useMemo(() => {
    const adminMatch = products.find((p) => `product-${p.id}` === id);
    if (adminMatch) {
      const images = getProductImages(adminMatch).map((img) => img.url);
      return {
        id,
        title: adminMatch.title,
        medium: adminMatch.medium,
        year: adminMatch.year,
        price: adminMatch.price,
        salePrice: adminMatch.salePrice,
        description: adminMatch.description,
        category: adminMatch.category,
        dimensions: adminMatch.dimensions,
        images,
        availability: adminMatch.availability ?? "available",
      };
    }
    const def = DEFAULT_GALLERY_ARTWORKS.find(
      (a) => defaultArtworkId(a) === id,
    );
    if (def) {
      const images = [def.image, def.mockup].filter((img): img is string =>
        Boolean(img),
      );
      return {
        id,
        title: def.title,
        medium: def.medium,
        year: def.year,
        price: def.price,
        salePrice: undefined,
        description: def.description,
        category: undefined,
        dimensions: undefined,
        images,
        availability: "available" as const,
      };
    }
    return null;
  }, [id, products]);

  useEffect(() => {
    setActiveIndex(0);
  }, [id]);

  if (!item) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="font-display text-3xl mb-4">Painting not found</h1>
          <p className="text-sm text-muted-foreground mb-6">
            This piece may have been retired or never existed.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm underline"
          >
            <ArrowLeft className="w-4 h-4" /> Back to gallery
          </Link>
        </div>
      </div>
    );
  }

  const effectivePrice = getEffectivePrice(item);
  const discount = getDiscountPercent(item);
  const isPurchasable = item.availability === "available";
  const images = item.images.length > 0 ? item.images : ["/images/1.png"];

  const cycle = (delta: number) => {
    setActiveIndex((idx) => {
      const next = (idx + delta + images.length) % images.length;
      return next;
    });
  };

  const handleAddToCart = () => {
    addToCart({
      id: item.id,
      image: images[0],
      title: item.title,
      medium: item.medium,
      year: item.year,
      price: effectivePrice,
    });
    openCart();
  };

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-right" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-xs tracking-wider uppercase text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to gallery
        </Link>

        <div className="grid gap-8 lg:gap-12 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="relative gallery-frame overflow-hidden bg-muted/20">
              <motion.img
                key={images[activeIndex]}
                src={images[activeIndex]}
                alt={`${item.title} — view ${activeIndex + 1}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="w-full h-auto object-contain max-h-[70vh]"
              />
              {discount > 0 && (
                <span className="absolute top-3 left-3 z-[1] px-2 py-0.5 bg-red-600 text-white text-[10px] tracking-wider uppercase rounded-sm">
                  {discount}% OFF
                </span>
              )}
              {item.availability === "sold" && (
                <span className="absolute top-3 right-3 z-[1] px-3 py-1 bg-foreground text-background text-[10px] tracking-[0.25em] uppercase rounded-sm">
                  Sold
                </span>
              )}
              {item.availability === "reserved" && (
                <span className="absolute top-3 right-3 z-[1] px-3 py-1 bg-amber-500 text-white text-[10px] tracking-[0.25em] uppercase rounded-sm">
                  Reserved
                </span>
              )}
              {images.length > 1 && (
                <>
                  <button
                    onClick={() => cycle(-1)}
                    aria-label="Previous photo"
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/80 hover:bg-background border border-border/40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => cycle(1)}
                    aria-label="Next photo"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/80 hover:bg-background border border-border/40"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
            {images.length > 1 && (
              <div className="grid grid-cols-5 gap-2">
                {images.map((src, idx) => (
                  <button
                    key={`${src}-${idx}`}
                    onClick={() => setActiveIndex(idx)}
                    aria-label={`Show photo ${idx + 1}`}
                    className={`relative overflow-hidden rounded-sm border ${
                      idx === activeIndex
                        ? "border-foreground"
                        : "border-border/40 hover:border-border"
                    }`}
                  >
                    <img
                      src={src}
                      alt=""
                      className="w-full aspect-square object-cover"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-5">
            {item.category && (
              <p className="text-[10px] tracking-[0.4em] uppercase text-muted-foreground">
                {item.category}
              </p>
            )}
            <h1 className="font-display text-3xl md:text-4xl text-gradient-elegant">
              {item.title}
            </h1>
            <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground">
              {item.medium} · {item.year}
              {item.dimensions ? ` · ${item.dimensions}` : ""}
            </p>

            <div className="flex items-baseline gap-3">
              {discount > 0 ? (
                <>
                  <span className="font-body text-3xl font-semibold">
                    ₱{effectivePrice.toLocaleString()}
                  </span>
                  <span className="font-body text-base line-through text-muted-foreground">
                    ₱{item.price.toLocaleString()}
                  </span>
                </>
              ) : (
                <span className="font-body text-3xl font-semibold">
                  ₱{item.price.toLocaleString()}
                </span>
              )}
            </div>

            <p className="text-sm text-foreground/80 leading-relaxed">
              {item.description}
            </p>

            <div className="pt-2">
              {isPurchasable ? (
                <Button
                  size="lg"
                  onClick={handleAddToCart}
                  className="w-full sm:w-auto"
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Add to cart
                </Button>
              ) : (
                <Button
                  size="lg"
                  disabled
                  variant="secondary"
                  className="w-full sm:w-auto"
                >
                  {item.availability === "sold"
                    ? "Sold out"
                    : "Reserved — message us"}
                </Button>
              )}
              {item.availability === "reserved" && (
                <p className="text-xs text-muted-foreground mt-2">
                  This piece is currently reserved for another collector. Reach
                  out if you'd like to be next on the list.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
