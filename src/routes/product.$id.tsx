import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  ZoomIn,
} from "lucide-react";
import GalleryNav from "@/components/GalleryNav";
import CartDrawer from "@/components/CartDrawer";
import CheckoutForm from "@/components/CheckoutForm";
import OrderConfirmation from "@/components/OrderConfirmation";
import {
  getDiscountPercent,
  getEffectivePrice,
  useProducts,
} from "@/contexts/ProductContext";
import { useCart } from "@/contexts/CartContext";
import {
  AVAILABILITY_LABEL,
  findArtworkById,
  isPurchasable,
  type Availability,
} from "@/lib/artworks";

export const Route = createFileRoute("/product/$id")({
  component: ProductPage,
  head: ({ params }) => ({
    meta: [
      {
        title: `Painting — Pintaterra`,
      },
      {
        name: "description",
        content: "View painting details, photos, and pricing on Pintaterra.",
      },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: `Painting — Pintaterra` },
      {
        property: "og:url",
        content: `/product/${params.id}`,
      },
    ],
  }),
});

const availabilityBadgeClass: Record<Availability, string> = {
  available: "bg-emerald-600 text-white",
  reserved: "bg-amber-500 text-white",
  sold: "bg-slate-900 text-white",
  draft: "bg-muted text-foreground",
};

function ProductPage() {
  const { id } = Route.useParams();
  const { products } = useProducts();
  const artwork = useMemo(() => findArtworkById(id, products), [id, products]);

  const [activeImage, setActiveImage] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const { addToCart } = useCart();

  useEffect(() => {
    setActiveImage(0);
    setZoomed(false);
  }, [id]);

  useEffect(() => {
    if (!zoomed) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomed(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [zoomed]);

  if (!artwork) {
    return (
      <div className="min-h-screen flex flex-col">
        <GalleryNav />
        <div className="flex-1 flex items-center justify-center px-6 py-32">
          <div className="max-w-md text-center">
            <p className="font-body text-xs tracking-[0.3em] uppercase text-muted-foreground mb-3">
              404
            </p>
            <h1 className="font-display text-3xl text-foreground mb-4">
              Painting not found
            </h1>
            <p className="font-body text-sm text-muted-foreground mb-6">
              The painting you're looking for is no longer in our collection.
            </p>
            <Link
              to="/"
              hash="gallery"
              className="inline-flex items-center gap-2 px-6 py-3 bg-foreground text-background font-body text-xs tracking-[0.2em] uppercase hover:bg-foreground/90 transition-all rounded-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to gallery
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (artwork.availability === "draft") {
    return (
      <div className="min-h-screen flex flex-col">
        <GalleryNav />
        <div className="flex-1 flex items-center justify-center px-6 py-32">
          <div className="max-w-md text-center">
            <h1 className="font-display text-3xl text-foreground mb-4">
              This painting isn't available yet
            </h1>
            <p className="font-body text-sm text-muted-foreground mb-6">
              It's still being prepared. Please check back soon.
            </p>
            <Link
              to="/"
              hash="gallery"
              className="inline-flex items-center gap-2 px-6 py-3 bg-foreground text-background font-body text-xs tracking-[0.2em] uppercase hover:bg-foreground/90 transition-all rounded-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to gallery
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const purchasable = isPurchasable(artwork.availability);
  const discount = getDiscountPercent(artwork);
  const effectivePrice = getEffectivePrice(artwork);
  const galleryImages =
    artwork.images.length > 0 ? artwork.images : [{ url: artwork.image }];
  const currentImage = galleryImages[activeImage] ?? galleryImages[0];
  const showAvailabilityBadge = artwork.availability !== "available";

  const handlePrev = () => {
    setActiveImage((i) => (i > 0 ? i - 1 : galleryImages.length - 1));
  };
  const handleNext = () => {
    setActiveImage((i) => (i < galleryImages.length - 1 ? i + 1 : 0));
  };

  const handleAdd = () => {
    if (!purchasable) return;
    addToCart({
      id: artwork.id,
      image: artwork.image,
      title: artwork.title,
      medium: artwork.medium,
      year: artwork.year,
      price: effectivePrice,
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <GalleryNav />
      <main className="flex-1 pt-28 md:pt-32 pb-20 px-6 md:px-12 max-w-7xl mx-auto w-full">
        <div className="mb-6">
          <Link
            to="/"
            hash="gallery"
            className="inline-flex items-center gap-2 font-body text-xs tracking-[0.25em] uppercase text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to gallery
          </Link>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="grid lg:grid-cols-[1.2fr_1fr] gap-10 lg:gap-16"
        >
          <section className="space-y-4">
            <div className="relative bg-card/30 border border-border/40 rounded-xl overflow-hidden gallery-frame">
              <button
                type="button"
                onClick={() => setZoomed(true)}
                className="block w-full"
                aria-label="Zoom image"
              >
                <img
                  key={currentImage.url}
                  src={currentImage.url}
                  alt={`${artwork.title} – photo ${activeImage + 1}`}
                  className="w-full h-auto max-h-[70vh] object-contain bg-black/5 cursor-zoom-in"
                />
              </button>
              {showAvailabilityBadge && (
                <span
                  className={`absolute top-4 left-4 px-3 py-1 font-body text-[10px] tracking-[0.3em] uppercase rounded-sm ${availabilityBadgeClass[artwork.availability]}`}
                >
                  {AVAILABILITY_LABEL[artwork.availability]}
                </span>
              )}
              {discount > 0 && artwork.availability === "available" && (
                <span className="absolute top-4 right-4 px-3 py-1 bg-red-600 text-white font-body text-[10px] tracking-[0.2em] uppercase rounded-sm">
                  {discount}% OFF
                </span>
              )}
              <button
                type="button"
                onClick={() => setZoomed(true)}
                aria-label="Zoom image"
                className="absolute bottom-4 right-4 p-2 bg-background/70 backdrop-blur-sm rounded-sm hover:bg-background/90"
              >
                <ZoomIn className="w-4 h-4 text-foreground" />
              </button>
              {galleryImages.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={handlePrev}
                    aria-label="Previous photo"
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-2 bg-background/70 backdrop-blur-sm rounded-sm hover:bg-background/90"
                  >
                    <ChevronLeft className="w-4 h-4 text-foreground" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    aria-label="Next photo"
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-background/70 backdrop-blur-sm rounded-sm hover:bg-background/90"
                  >
                    <ChevronRight className="w-4 h-4 text-foreground" />
                  </button>
                </>
              )}
            </div>
            {galleryImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {galleryImages.map((img, idx) => (
                  <button
                    key={`${img.url}-${idx}`}
                    type="button"
                    onClick={() => setActiveImage(idx)}
                    aria-label={`Show photo ${idx + 1}`}
                    aria-current={idx === activeImage}
                    className={`flex-shrink-0 w-20 h-20 rounded-sm overflow-hidden border-2 transition-all ${
                      idx === activeImage
                        ? "border-foreground"
                        : "border-transparent opacity-70 hover:opacity-100"
                    }`}
                  >
                    <img
                      src={img.url}
                      alt={`${artwork.title} thumbnail ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-6">
            <div>
              <p className="font-body text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">
                {artwork.medium} · {artwork.year}
                {artwork.category ? ` · ${artwork.category}` : ""}
              </p>
              <h1 className="font-display text-3xl md:text-4xl text-foreground mb-3">
                {artwork.title}
              </h1>
              {artwork.dimensions && (
                <p className="font-body text-xs tracking-[0.2em] uppercase text-muted-foreground">
                  Dimensions · {artwork.dimensions}
                </p>
              )}
            </div>

            <div className="font-body text-2xl md:text-3xl text-foreground font-semibold">
              {discount > 0 ? (
                <>
                  <span className="line-through text-muted-foreground text-base mr-2">
                    ₱{artwork.price.toLocaleString()}
                  </span>
                  <span>₱{effectivePrice.toLocaleString()}</span>
                  <span className="ml-2 text-sm text-red-500 font-semibold">
                    {discount}% OFF
                  </span>
                </>
              ) : (
                <>₱{artwork.price.toLocaleString()}</>
              )}
            </div>

            <p className="font-body text-sm md:text-base text-muted-foreground leading-relaxed">
              {artwork.description}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleAdd}
                disabled={!purchasable}
                className={`inline-flex items-center gap-2 px-8 py-3 font-body text-xs tracking-[0.2em] uppercase transition-all duration-300 rounded-sm ${
                  purchasable
                    ? "bg-foreground text-background hover:bg-foreground/90"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                }`}
              >
                <ShoppingCart className="w-4 h-4" />
                {purchasable
                  ? "Add to cart"
                  : `${AVAILABILITY_LABEL[artwork.availability]}`}
              </button>
              <Link
                to="/"
                hash="gallery"
                className="inline-flex items-center gap-2 px-6 py-3 border border-foreground/20 text-foreground font-body text-xs tracking-[0.2em] uppercase hover:bg-accent transition-all rounded-sm"
              >
                Continue browsing
              </Link>
            </div>

            <div className="border-t border-border/40 pt-6 space-y-2 font-body text-xs text-muted-foreground tracking-[0.05em]">
              <p>
                <span className="uppercase tracking-[0.25em] text-foreground/80 mr-2">
                  Authentic
                </span>
                Hand-crafted original. Each painting ships with a certificate.
              </p>
              <p>
                <span className="uppercase tracking-[0.25em] text-foreground/80 mr-2">
                  Shipping
                </span>
                Insured nationwide delivery (JRS / J&T / LBC) with tracking.
              </p>
              <p>
                <span className="uppercase tracking-[0.25em] text-foreground/80 mr-2">
                  Care
                </span>
                Keep out of direct sunlight and humid spaces for longevity.
              </p>
            </div>
          </section>
        </motion.div>
      </main>

      {zoomed && (
        <div
          role="dialog"
          aria-label={`${artwork.title} – zoomed`}
          className="fixed inset-0 z-[110] bg-black/95 flex items-center justify-center cursor-zoom-out p-6"
          onClick={() => setZoomed(false)}
        >
          <img
            src={currentImage.url}
            alt={artwork.title}
            className="max-w-[95vw] max-h-[95vh] object-contain"
          />
        </div>
      )}

      <CartDrawer />
      <CheckoutForm />
      <OrderConfirmation />
    </div>
  );
}
