import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Box,
  ChevronLeft,
  ChevronRight,
  Heart,
  Loader2,
  ShoppingCart,
  Star,
  Share2,
  Play,
  ZoomIn,
} from "lucide-react";
import { toast } from "sonner";
import GalleryNav from "@/components/GalleryNav";
import CartDrawer from "@/components/CartDrawer";
import CheckoutForm from "@/components/CheckoutForm";
import RelatedProducts from "@/components/RelatedProducts";
import SimilarPaintingsRail from "@/components/SimilarPaintingsRail";
import RecentlyViewed from "@/components/RecentlyViewed";
import ZoomableImage from "@/components/ZoomableImage";
import StickyMobileBuyBar from "@/components/StickyMobileBuyBar";
import ImageWithFallback from "@/components/ImageWithFallback";
import MagneticButton from "@/components/MagneticButton";
import SplitText from "@/components/motion/SplitText";
import { pushRecentlyViewed } from "@/lib/recentlyViewed";
import { addStamp } from "@/lib/passport";
import { imgAttrs, variantSrc } from "@/lib/productImage";
import {
  getDiscountPercent,
  getEffectivePrice,
  useProducts,
} from "@/contexts/ProductContext";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/contexts/WishlistContext";
import {
  AVAILABILITY_LABEL,
  findArtworkById,
  isPurchasable,
  type Availability,
} from "@/lib/artworks";
import { NotifyMeButton } from "@/components/NotifyMeButton";

// 3D viewer ships ~120 KB gz of three.js + r3f + drei runtime, so
// load it on-demand only when a customer taps "View in 3D". The
// button itself stays in the initial product-page bundle (it's just
// an icon + label).
const PaintingViewer3D = lazy(() => import("@/components/PaintingViewer3D"));

interface ProductReview {
  orderId: string;
  rating: number;
  text: string;
  images: string[];
  submittedAt: string;
  customerName: string;
  customerCity?: string;
  productId?: string;
  productTitle?: string;
}

export const Route = createFileRoute("/product/$id")({
  component: ProductPage,
  head: ({ params }) => ({
    meta: [
      {
        title: `Painting — Canvas Hub`,
      },
      {
        name: "description",
        content: "View painting details, photos, and pricing on Canvas Hub.",
      },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: `Painting — Canvas Hub` },
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
  const { products, productsLoaded } = useProducts();
  const artwork = useMemo(() => findArtworkById(id, products), [id, products]);

  const [activeImage, setActiveImage] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [view3d, setView3d] = useState(false);
  const addToCartButtonRef = useRef<HTMLButtonElement>(null);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const { addToCart } = useCart();
  const wishlist = useWishlist();
  const inWishlist = wishlist.has(id);

  useEffect(() => {
    setActiveImage(0);
    setZoomed(false);
    setView3d(false);
  }, [id]);

  // Track view in localStorage so the "recently viewed" strip can show this
  // product on the home page and other product pages later.
  useEffect(() => {
    if (artwork && artwork.availability !== "draft") {
      pushRecentlyViewed(artwork.id);
      addStamp(artwork.id);
    }
  }, [artwork]);

  useEffect(() => {
    let cancelled = false;
    setReviewsLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/orders?reviews=published&productId=${encodeURIComponent(id)}`,
        );
        if (!res.ok) {
          if (!cancelled) setReviews([]);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setReviews(
          Array.isArray(data.reviews) ? (data.reviews as ProductReview[]) : [],
        );
      } catch {
        if (!cancelled) setReviews([]);
      } finally {
        if (!cancelled) setReviewsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!zoomed) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomed(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [zoomed]);

  const ratingStats = useMemo(() => {
    if (!reviews.length) return null;
    const sum = reviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
    return { count: reviews.length, average: sum / reviews.length };
  }, [reviews]);

  // Update document head dynamically with rich product metadata for sharing.
  useEffect(() => {
    if (!artwork || typeof document === "undefined") return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/product/${artwork.id}`;
    const desc =
      artwork.description ||
      `${artwork.title} — original painting on ${artwork.medium}, ${artwork.year}.`;
    const imageUrl = artwork.image.startsWith("http")
      ? artwork.image
      : `${origin}${artwork.image}`;

    document.title = `${artwork.title} — Canvas Hub`;

    const setMeta = (selector: string, attr: string, value: string) => {
      let tag = document.querySelector<HTMLMetaElement>(selector);
      if (!tag) {
        tag = document.createElement("meta");
        const [k, v] = selector
          .replace(/^meta\[/, "")
          .replace(/\]$/, "")
          .split("=");
        if (k && v) tag.setAttribute(k, v.replace(/['"]/g, ""));
        document.head.appendChild(tag);
      }
      tag.setAttribute(attr, value);
    };

    setMeta('meta[name="description"]', "content", desc);
    setMeta('meta[property="og:title"]', "content", artwork.title);
    setMeta('meta[property="og:description"]', "content", desc);
    setMeta('meta[property="og:type"]', "content", "product");
    setMeta('meta[property="og:url"]', "content", url);
    setMeta('meta[property="og:image"]', "content", imageUrl);
    setMeta('meta[property="og:site_name"]', "content", "Canvas Hub");
    setMeta('meta[name="twitter:card"]', "content", "summary_large_image");
    setMeta('meta[name="twitter:title"]', "content", artwork.title);
    setMeta('meta[name="twitter:description"]', "content", desc);
    setMeta('meta[name="twitter:image"]', "content", imageUrl);
  }, [artwork]);

  const jsonLd = useMemo(() => {
    if (!artwork) return "{}";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/product/${artwork.id}`;
    const imageUrls = (
      artwork.images.length > 0
        ? artwork.images.map((img) => img.url)
        : [artwork.image]
    ).map((u) => (u.startsWith("http") ? u : `${origin}${u}`));
    const availability =
      artwork.availability === "available"
        ? "https://schema.org/InStock"
        : artwork.availability === "reserved"
          ? "https://schema.org/PreOrder"
          : "https://schema.org/SoldOut";

    const data: Record<string, unknown> = {
      "@context": "https://schema.org/",
      "@type": "Product",
      name: artwork.title,
      description:
        artwork.description ||
        `${artwork.title} — original painting on ${artwork.medium}, ${artwork.year}.`,
      image: imageUrls,
      sku: artwork.id,
      brand: { "@type": "Brand", name: "Canvas Hub" },
      offers: {
        "@type": "Offer",
        url,
        priceCurrency: "PHP",
        price: getEffectivePrice(artwork),
        availability,
        itemCondition: "https://schema.org/NewCondition",
      },
    };
    if (ratingStats) {
      data.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: ratingStats.average.toFixed(2),
        reviewCount: ratingStats.count,
      };
    }
    // Escape "<" so a stray "</script>" inside a string can't break out
    // of the surrounding <script type="application/ld+json"> block.
    return JSON.stringify(data).replace(/</g, "\\u003c");
  }, [artwork, ratingStats]);

  if (!artwork) {
    // While the first /api/products fetch is still in flight (e.g. a
    // deep-linked product page on a phone with an empty local cache),
    // show a neutral loading state. Only render the 404 once we've
    // actually loaded products and confirmed nothing matches this id.
    if (!productsLoaded) {
      return (
        <div className="min-h-screen flex flex-col">
          <GalleryNav />
          <div
            className="flex-1 flex items-center justify-center px-6 py-32"
            role="status"
            aria-live="polite"
          >
            <div className="max-w-md text-center">
              <Loader2 className="mx-auto mb-4 h-6 w-6 animate-spin text-muted-foreground" />
              <p className="font-body text-xs tracking-[0.3em] uppercase text-muted-foreground">
                Loading painting…
              </p>
            </div>
          </div>
        </div>
      );
    }
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
              to="/collection"
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
              to="/collection"
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
  // Optional studio video shows up as a leading "play" tile in the
  // thumbnail strip and switches the hero slot from `<img>` to
  // `<video controls>` when selected. We resolve the artwork-level
  // video off the underlying Product (defaults from `lib/artworks` may
  // not carry it) so default artworks don't try to render undefined.
  //
  // `artwork.id` is the merged display id (`product-<uuid>` for pure
  // uploads, `default-<slug>` for stock pieces). `p.id` is always the
  // bare uuid, and overrides of stock pieces carry the matching
  // `default-<slug>` on `p.replacesDefaultId` — neither matches a
  // direct `p.id === artwork.id` comparison, so map both shapes back
  // to the underlying product before reading the video field.
  const productVideo = (() => {
    if (artwork.id.startsWith("default-")) {
      return products.find((p) => p.replacesDefaultId === artwork.id)?.video;
    }
    if (artwork.id.startsWith("product-")) {
      const rawId = artwork.id.slice("product-".length);
      return products.find((p) => p.id === rawId)?.video;
    }
    return undefined;
  })();
  const hasVideo = Boolean(productVideo?.url);
  // The "play" tile sits at the 3rd thumbnail slot (index 2) when
  // there are at least two images, otherwise it tags onto the end of
  // the strip. Image tiles before that slot keep their natural index;
  // image tiles after it shift right by one.
  const VIDEO_TILE_POSITION = 2;
  const videoTileIndex = hasVideo
    ? Math.min(VIDEO_TILE_POSITION, galleryImages.length)
    : -1;
  const isVideoActive = hasVideo && activeImage === videoTileIndex;
  const totalGalleryItems = galleryImages.length + (hasVideo ? 1 : 0);
  const imageIndexForTile = (tileIdx: number): number =>
    hasVideo && tileIdx > videoTileIndex ? tileIdx - 1 : tileIdx;
  const currentImage = isVideoActive
    ? galleryImages[0]
    : (galleryImages[imageIndexForTile(activeImage)] ?? galleryImages[0]);
  const showAvailabilityBadge = artwork.availability !== "available";

  const handlePrev = () => {
    setActiveImage((i) => (i > 0 ? i - 1 : totalGalleryItems - 1));
  };
  const handleNext = () => {
    setActiveImage((i) => (i < totalGalleryItems - 1 ? i + 1 : 0));
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <GalleryNav />
      <main className="flex-1 pt-24 md:pt-32 pb-20 px-4 sm:px-6 md:px-12 max-w-7xl mx-auto w-full">
        <div className="mb-6">
          <Link
            to="/collection"
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
          className="grid lg:grid-cols-[1.2fr_1fr] gap-8 md:gap-10 lg:gap-16"
        >
          <section className="space-y-4">
            <div className="relative bg-card/30 border border-border/40 rounded-xl overflow-hidden gallery-frame">
              {isVideoActive && productVideo ? (
                <div className="w-full bg-black flex items-center justify-center">
                  <video
                    key={productVideo.url}
                    src={productVideo.url}
                    poster={productVideo.posterUrl || currentImage.url}
                    controls
                    autoPlay
                    playsInline
                    preload="metadata"
                    className="w-full h-auto max-h-[70vh]"
                    aria-label={`${artwork.title} — studio video`}
                  >
                    {productVideo.mimeType ? (
                      <source
                        src={productVideo.url}
                        type={productVideo.mimeType}
                      />
                    ) : null}
                  </video>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setZoomed(true)}
                  className="block w-full"
                  aria-label="Zoom image"
                >
                  {(() => {
                    // LCP element on the product detail page. Hero slot
                    // is roughly 60 vw on desktop / 100 vw on mobile, so
                    // `md` (800 w) covers most phones at retina DPR and
                    // `lg` (1600 w) handles desktop and high-DPR phones.
                    const heroAttrs = imgAttrs(
                      currentImage,
                      "(min-width: 1024px) 60vw, 100vw",
                      "lg",
                    );
                    return (
                      <ImageWithFallback
                        key={currentImage.url}
                        src={heroAttrs.src || currentImage.url}
                        srcSet={heroAttrs.srcSet}
                        sizes={heroAttrs.sizes}
                        width={heroAttrs.width}
                        height={heroAttrs.height}
                        alt={`${artwork.title} – photo ${activeImage + 1}`}
                        className="w-full h-auto max-h-[70vh] object-contain bg-black/5 cursor-zoom-in"
                        fallbackClassName="w-full max-h-[70vh] aspect-[4/3] flex items-center justify-center bg-muted/30 border border-border/20 rounded-sm"
                        // Tell the browser to prioritize the LCP image
                        // over off-screen gallery images and deferred
                        // chunks.
                        loading="eager"
                        // Cast to bypass the older React DOM types that
                        // don't know about the modern `fetchpriority`
                        // attribute yet.
                        {...({ fetchpriority: "high" } as Record<
                          string,
                          string
                        >)}
                      />
                    );
                  })()}
                </button>
              )}
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
              {!isVideoActive && (
                <div className="absolute bottom-4 right-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setView3d(true)}
                    aria-label="View painting in 3D"
                    title="View in 3D"
                    className="inline-flex items-center gap-1.5 px-2.5 py-2 bg-background/70 backdrop-blur-sm rounded-sm hover:bg-background/90 font-body text-[10px] tracking-[0.25em] uppercase text-foreground"
                  >
                    <Box className="w-4 h-4" />
                    <span className="hidden sm:inline">View in 3D</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomed(true)}
                    aria-label="Zoom image"
                    className="p-2 bg-background/70 backdrop-blur-sm rounded-sm hover:bg-background/90"
                  >
                    <ZoomIn className="w-4 h-4 text-foreground" />
                  </button>
                </div>
              )}
              {totalGalleryItems > 1 && (
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
            {totalGalleryItems > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {Array.from({ length: totalGalleryItems }, (_, tileIdx) => {
                  if (hasVideo && productVideo && tileIdx === videoTileIndex) {
                    return (
                      <button
                        key="__video-tile"
                        type="button"
                        onClick={() => setActiveImage(videoTileIndex)}
                        aria-label="Play studio video"
                        aria-current={isVideoActive}
                        className={`relative flex-shrink-0 w-20 h-20 rounded-sm overflow-hidden border-2 transition-all bg-black ${
                          isVideoActive
                            ? "border-foreground"
                            : "border-transparent opacity-80 hover:opacity-100"
                        }`}
                      >
                        {productVideo.posterUrl ? (
                          <ImageWithFallback
                            src={productVideo.posterUrl}
                            alt={`${artwork.title} — studio video poster`}
                            className="w-full h-full object-cover"
                            fallbackClassName="w-full h-full flex items-center justify-center bg-black/80"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <ImageWithFallback
                            src={variantSrc(galleryImages[0], "sm")}
                            alt={`${artwork.title} — studio video poster`}
                            className="w-full h-full object-cover opacity-60"
                            fallbackClassName="w-full h-full flex items-center justify-center bg-black/80"
                            loading="lazy"
                            decoding="async"
                          />
                        )}
                        <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <Play className="w-6 h-6 text-white drop-shadow" />
                        </span>
                      </button>
                    );
                  }
                  const imgIdx = imageIndexForTile(tileIdx);
                  const img = galleryImages[imgIdx];
                  if (!img) return null;
                  return (
                    <button
                      key={`${img.url}-${imgIdx}`}
                      type="button"
                      onClick={() => setActiveImage(tileIdx)}
                      aria-label={`Show photo ${imgIdx + 1}`}
                      aria-current={tileIdx === activeImage}
                      className={`flex-shrink-0 w-20 h-20 rounded-sm overflow-hidden border-2 transition-all ${
                        tileIdx === activeImage
                          ? "border-foreground"
                          : "border-transparent opacity-70 hover:opacity-100"
                      }`}
                    >
                      <ImageWithFallback
                        // Thumbnails are 80×80 — `sm` (400 w) covers
                        // 4x DPR phones with bytes to spare.
                        src={variantSrc(img, "sm")}
                        alt={`${artwork.title} thumbnail ${imgIdx + 1}`}
                        className="w-full h-full object-cover"
                        fallbackClassName="w-full h-full flex items-center justify-center bg-muted/30"
                        loading="lazy"
                        decoding="async"
                        width={img.dims?.w}
                        height={img.dims?.h}
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-6 lg:sticky lg:top-28 lg:self-start">
            <div>
              <p className="font-body text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">
                {artwork.medium} · {artwork.year}
                {artwork.category ? ` · ${artwork.category}` : ""}
              </p>
              <SplitText
                as="h1"
                by="word"
                stagger={0.06}
                duration={0.85}
                yFrom={28}
                className="font-display text-3xl md:text-4xl text-foreground mb-3"
              >
                {artwork.title}
              </SplitText>
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

            <p className="font-body text-sm md:text-base text-muted-foreground leading-relaxed first-letter:font-display first-letter:text-3xl first-letter:md:text-4xl first-letter:text-foreground first-letter:float-left first-letter:mr-1.5 first-letter:mt-1 first-letter:leading-none">
              {artwork.description}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <MagneticButton
                ref={addToCartButtonRef}
                type="button"
                onClick={handleAdd}
                disabled={!purchasable}
                strength={purchasable ? 8 : 0}
                className={`inline-flex items-center gap-2 px-8 py-3 font-body text-xs tracking-[0.2em] uppercase transition-colors duration-300 rounded-sm ${
                  purchasable
                    ? "bg-foreground text-background hover:bg-foreground/90"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                }`}
              >
                <ShoppingCart className="w-4 h-4" />
                {purchasable
                  ? "Add to cart"
                  : `${AVAILABILITY_LABEL[artwork.availability]}`}
              </MagneticButton>
              <button
                type="button"
                onClick={() => {
                  if (!artwork) return;
                  const added = wishlist.toggle({
                    id,
                    title: artwork.title,
                    image: artwork.image,
                    price: effectivePrice,
                  });
                  toast.success(
                    added
                      ? `Saved "${artwork.title}" to your wishlist`
                      : `Removed "${artwork.title}" from your wishlist`,
                  );
                }}
                aria-pressed={inWishlist}
                className={`inline-flex items-center gap-2 px-6 py-3 border font-body text-xs tracking-[0.2em] uppercase rounded-sm transition-all ${
                  inWishlist
                    ? "border-red-500/40 bg-red-500/10 text-red-500"
                    : "border-foreground/20 text-foreground hover:bg-accent"
                }`}
              >
                <Heart
                  className={`w-4 h-4 ${inWishlist ? "fill-red-500" : ""}`}
                />
                {inWishlist ? "Saved" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  const url =
                    typeof window !== "undefined"
                      ? `${window.location.origin}/product/${artwork.id}`
                      : "";
                  const data = {
                    title: `${artwork.title} — Canvas Hub`,
                    text: `Check out "${artwork.title}" on Canvas Hub.`,
                    url,
                  };
                  const nav = navigator as Navigator & {
                    share?: (d: ShareData) => Promise<void>;
                  };
                  if (nav.share) {
                    nav.share(data).catch(() => {
                      /* user cancelled */
                    });
                  } else if (navigator.clipboard) {
                    navigator.clipboard
                      .writeText(url)
                      .then(() => toast.success("Link copied to clipboard"))
                      .catch(() => toast.error("Could not copy link"));
                  } else {
                    toast.message(url);
                  }
                }}
                className="inline-flex items-center gap-2 px-6 py-3 border border-foreground/20 text-foreground font-body text-xs tracking-[0.2em] uppercase hover:bg-accent transition-all rounded-sm"
                aria-label="Share painting"
              >
                <Share2 className="w-4 h-4" />
                Share
              </button>
              {artwork.availability === "sold" && (
                <NotifyMeButton productId={artwork.id} />
              )}
              <Link
                to="/collection"
                className="inline-flex items-center gap-2 px-6 py-3 border border-foreground/20 text-foreground font-body text-xs tracking-[0.2em] uppercase hover:bg-accent transition-all rounded-sm"
              >
                Continue browsing
              </Link>
            </div>

            <div className="border-t border-border/40 pt-6 space-y-2 font-body text-xs text-muted-foreground tracking-[0.05em]">
              <p>
                <span className="uppercase tracking-[0.25em] text-foreground/80 mr-2">
                  Shipping
                </span>
                Lalamove courier within Luzon — live tracking, fare paid to the
                rider on delivery.
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

        <ProductReviews loading={reviewsLoading} reviews={reviews} />

        <SimilarPaintingsRail currentId={artwork.id} />
        <RelatedProducts currentId={artwork.id} />
        <RecentlyViewed excludeId={artwork.id} />
      </main>

      {zoomed && (
        <div
          role="dialog"
          aria-label={`${artwork.title} – zoomed`}
          className="fixed inset-0 z-[110] bg-black/95 flex flex-col items-center justify-center p-4 md:p-6"
        >
          <button
            type="button"
            onClick={() => setZoomed(false)}
            className="absolute top-4 right-4 z-10 px-3 py-1.5 rounded-full bg-foreground text-background text-[11px] tracking-[0.2em] uppercase hover:opacity-90"
            aria-label="Close zoomed view"
          >
            Close
          </button>
          <ZoomableImage
            // Pinch-zoom needs the highest-resolution variant we have
            // so detail stays crisp at full scale.
            src={variantSrc(currentImage, "lg")}
            alt={artwork.title}
            className="w-full h-full"
          />
          <p className="mt-3 text-[10px] tracking-[0.25em] uppercase text-white/60">
            Pinch · scroll · double-tap to zoom · drag to pan
          </p>
        </div>
      )}

      {view3d && (
        <Suspense
          fallback={
            <div
              className="fixed inset-0 z-[1100] bg-background/95 backdrop-blur-xl flex items-center justify-center"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <PaintingViewer3D
            imageUrl={variantSrc(currentImage, "lg")}
            title={artwork.title}
            onClose={() => setView3d(false)}
          />
        </Suspense>
      )}

      <StickyMobileBuyBar
        watchRef={addToCartButtonRef}
        price={effectivePrice}
        originalPrice={discount > 0 ? artwork.price : undefined}
        onAdd={handleAdd}
        ctaDisabled={!purchasable}
        ctaLabel={
          purchasable ? "Add to cart" : AVAILABILITY_LABEL[artwork.availability]
        }
        isInWishlist={inWishlist}
        onWishlist={() => {
          if (!artwork) return;
          const added = wishlist.toggle({
            id,
            title: artwork.title,
            image: artwork.image,
            price: effectivePrice,
          });
          toast.success(
            added
              ? `Saved "${artwork.title}" to your wishlist`
              : `Removed "${artwork.title}" from your wishlist`,
          );
        }}
      />
      <CartDrawer />
      <CheckoutForm />
    </div>
  );
}

function ProductReviews({
  loading,
  reviews,
}: {
  loading: boolean;
  reviews: ProductReview[];
}) {
  if (loading) {
    return (
      <section className="mt-16 border-t border-border/40 pt-10">
        <p className="font-body text-xs tracking-[0.3em] uppercase text-muted-foreground">
          Loading reviews…
        </p>
      </section>
    );
  }
  if (reviews.length === 0) {
    return (
      <section className="mt-16 border-t border-border/40 pt-10">
        <h2 className="font-display text-2xl text-foreground mb-3">Reviews</h2>
        <p className="font-body text-sm text-muted-foreground">
          No reviews yet for this painting. Be the first collector to share your
          experience after delivery.
        </p>
      </section>
    );
  }
  const total = reviews.reduce((s, r) => s + r.rating, 0);
  const avg = total / reviews.length;
  return (
    <section className="mt-16 border-t border-border/40 pt-10">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <h2 className="font-display text-2xl text-foreground">
          Reviews from collectors
        </h2>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className={`w-4 h-4 ${
                  n <= Math.round(avg)
                    ? "fill-yellow-400 text-yellow-400"
                    : "text-muted-foreground/40"
                }`}
              />
            ))}
          </div>
          <span className="font-medium text-foreground">{avg.toFixed(1)}</span>
          <span>·</span>
          <span>
            {reviews.length} review{reviews.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {reviews.map((r, i) => (
          <article
            key={`${r.orderId}-${i}`}
            className="bg-card/40 border border-border/60 rounded-md p-5 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={`w-4 h-4 ${
                      n <= r.rating
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-muted-foreground/40"
                    }`}
                  />
                ))}
              </div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {new Date(r.submittedAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
            <p className="font-body text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
              {r.text}
            </p>
            {r.images.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {r.images.slice(0, 3).map((src, j) => (
                  <a
                    key={j}
                    href={src}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <img
                      src={src}
                      alt={`Review photo ${j + 1}`}
                      className="aspect-square w-full object-cover rounded-md border border-border/40"
                      loading="lazy"
                      decoding="async"
                    />
                  </a>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-auto">
              — {r.customerName}
              {r.customerCity ? `, ${r.customerCity}` : ""}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
