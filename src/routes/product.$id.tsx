import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { animate, stagger } from "animejs";
import {
  ArrowLeft,
  Box,
  ChevronLeft,
  ChevronRight,
  Frame,
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
import RelatedProducts from "@/components/RelatedProducts";
import SimilarPaintingsRail from "@/components/SimilarPaintingsRail";
import ReviewPhotoLightbox, {
  type ReviewPhotoView,
} from "@/components/ReviewPhotoLightbox";
import StickyMobileBuyBar from "@/components/StickyMobileBuyBar";
import ImageWithFallback from "@/components/ImageWithFallback";
import MagneticButton from "@/components/MagneticButton";
import SplitText from "@/components/motion/SplitText";
import GsapStaggerRail from "@/components/motion/GsapStaggerRail";
import CuratorsNoteTypewriter from "@/components/CuratorsNoteTypewriter";
import DominantColorChips from "@/components/DominantColorChips";
import PaintingNotes from "@/components/PaintingNotes";
import { pushRecentlyViewed } from "@/lib/recentlyViewed";
import { addStamp } from "@/lib/passport";
import { imgAttrs, variantSrc } from "@/lib/productImage";
import {
  getDiscountPercent,
  getEffectivePrice,
  useProducts,
} from "@/contexts/ProductContext";
import { useCart } from "@/contexts/CartContext";
import { useStorefrontConfig } from "@/contexts/StorefrontConfigContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { useFlyToCart } from "@/contexts/FlyToCartContext";
import {
  AVAILABILITY_LABEL,
  findArtworkById,
  isPurchasable,
  type Availability,
} from "@/lib/artworks";
import { NotifyMeButton } from "@/components/NotifyMeButton";
import { useSEO } from "@/hooks/useSEO";
import { formatDatePHT, formatPHP } from "@/lib/format";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import StorefrontErrorBoundary from "@/components/StorefrontErrorBoundary";

gsap.registerPlugin(ScrollTrigger);

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// 3D viewer ships ~120 KB gz of three.js + r3f + drei runtime, so
// load it on-demand only when a customer taps "View in 3D". The
// button itself stays in the initial product-page bundle (it's just
// an icon + label).
const PaintingViewer3D = lazy(() => import("@/components/PaintingViewer3D"));
// "View on your wall" — shares the same three.js runtime as the 3D
// viewer above, so opening either modal warms the same chunk; we
// still code-split it from the product page itself to keep the
// initial bundle slim for the common case where neither is opened.
const WallPreview3D = lazy(() => import("@/components/WallPreview3D"));
// CartDrawer / CheckoutForm are conditional UI that only renders
// after the customer taps "Add to cart" / "Checkout", so we lazy
// them to keep the product page's initial JS smaller. Loading them
// the same way as the homepage + collection routes also resolves
// the Vite INEFFECTIVE_DYNAMIC_IMPORT warning we used to emit
// because the static import here was defeating the lazy split in
// those other routes.
const CartDrawer = lazy(() => import("@/components/CartDrawer"));
const CheckoutForm = lazy(() => import("@/components/CheckoutForm"));
// "Recently viewed" rail renders below the fold (after the related
// + similar painting rails), so lazy-loading it keeps the initial
// product-page bundle smaller without affecting the first paint.
const RecentlyViewed = lazy(() => import("@/components/RecentlyViewed"));
const ZoomOverlay = lazy(() => import("@/components/ZoomOverlay"));

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
  // Static SSR head: we don't have the artwork loaded server-side at
  // this point (products live in client-fetched KV via
  // `useProducts()`), so the SSR-emitted title / og:title fall back
  // to a `Painting #<id>` shape that still beats a generic
  // "Painting — Canvas Hub" for both crawlers and link previews.
  // Once the route mounts on the client, `useSEO()` inside
  // <ProductPage /> swaps in the resolved artwork title /
  // description / canonical, so social shares and search engines
  // that execute JS see the enriched copy.
  head: ({ params }) => {
    const title = `Painting #${params.id} — Canvas Hub`;
    const ogImage = `/api/r/products/${params.id}/main.jpg`;
    return {
      meta: [
        { title },
        {
          name: "description",
          content: "View painting details, photos, and pricing on Canvas Hub.",
        },
        { name: "robots", content: "index, follow" },
        { property: "og:title", content: title },
        {
          property: "og:url",
          content: `/product/${params.id}`,
        },
        { property: "og:image", content: ogImage },
        { property: "og:type", content: "product" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:image", content: ogImage },
      ],
    };
  },
});

const availabilityBadgeClass: Record<Availability, string> = {
  available: "bg-emerald-600 text-white",
  "made-to-order": "bg-blue-600 text-white",
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
  const [viewOnWall, setViewOnWall] = useState(false);
  // Captured viewport rect of the hero frame when the customer taps
  // "View in 3D" / "Zoom". Fed to the launcher animation so the
  // overlay reads as if it grew out of the frame the customer was
  // looking at, instead of fading in from nowhere.
  const [launchRect, setLaunchRect] = useState<DOMRect | null>(null);
  const addToCartButtonRef = useRef<HTMLButtonElement>(null);
  // Hero gallery + thumbnail strip — both animated in via
  // GSAP/anime.js once the artwork loads. Refs let the effect
  // target only this page's slot without scanning the whole DOM.
  const heroFrameRef = useRef<HTMLDivElement | null>(null);
  const thumbStripRef = useRef<HTMLDivElement | null>(null);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const { addToCart } = useCart();
  const flyToCart = useFlyToCart();
  const { config } = useStorefrontConfig();
  const madeToOrderNotice = config.siteCopy.madeToOrderNotice;
  const productInfoCopy = config.siteCopy.productInfo;
  const wishlist = useWishlist();
  const inWishlist = wishlist.has(id);

  useEffect(() => {
    setActiveImage(0);
    setZoomed(false);
    setView3d(false);
    setViewOnWall(false);
    setLaunchRect(null);
  }, [id]);

  const captureLaunchRect = () => {
    const frame = heroFrameRef.current;
    if (!frame) {
      setLaunchRect(null);
      return;
    }
    setLaunchRect(frame.getBoundingClientRect());
  };

  const openZoom = () => {
    captureLaunchRect();
    setZoomed(true);
  };

  const open3D = () => {
    captureLaunchRect();
    setView3d(true);
  };

  // Track view in localStorage so the "recently viewed" strip can show this
  // product on the home page and other product pages later.
  useEffect(() => {
    if (artwork && artwork.availability !== "draft") {
      pushRecentlyViewed(artwork.id);
      addStamp(artwork.id);
    }
  }, [artwork]);

  // Hero entrance: a short GSAP timeline that scales the hero frame in
  // from 0.94 + fade and then, once the frame has settled, hands off
  // to an anime.js stagger that reveals the thumbnail tiles left to
  // right. Re-runs whenever the route's artwork id changes so
  // navigating between product pages plays the entrance every time.
  useEffect(() => {
    if (!artwork) return;
    if (prefersReducedMotion()) return;

    const hero = heroFrameRef.current;
    const strip = thumbStripRef.current;

    const ctx = gsap.context(() => {
      if (hero) {
        gsap.fromTo(
          hero,
          { autoAlpha: 0, scale: 0.94, y: 18 },
          {
            autoAlpha: 1,
            scale: 1,
            y: 0,
            duration: 0.95,
            ease: "power3.out",
          },
        );
      }
    });

    let thumbControls: ReturnType<typeof animate> | null = null;
    if (strip) {
      const tiles = strip.querySelectorAll<HTMLElement>("[data-thumb-tile]");
      if (tiles.length > 0) {
        tiles.forEach((tile) => {
          tile.style.opacity = "0";
          tile.style.transform = "translateY(8px)";
        });
        thumbControls = animate(Array.from(tiles), {
          opacity: [0, 1],
          translateY: [8, 0],
          duration: 600,
          delay: stagger(50, { start: 650 }),
          ease: "outQuad",
          onComplete: () => {
            tiles.forEach((tile) => {
              tile.style.opacity = "";
              tile.style.transform = "";
            });
          },
        });
      }
    }

    return () => {
      ctx.revert();
      thumbControls?.pause();
    };
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

  // Compute SEO copy from the loaded artwork. Falls back to a generic
  // "Painting — Canvas Hub" title while products are still loading, so a
  // deep-linked product page never inherits the homepage's static title.
  const productDescription = artwork
    ? artwork.description ||
      `${artwork.title} — original painting on ${artwork.medium}, ${artwork.year}.`
    : "View painting details, photos, and pricing on Canvas Hub.";
  const productImage = artwork ? artwork.image : undefined;
  useSEO({
    title: artwork ? `${artwork.title} — Canvas Hub` : "Painting — Canvas Hub",
    description: productDescription,
    canonicalPath: `/product/${id}`,
    ogType: "product",
    image: productImage,
    socialTitle: artwork?.title,
  });

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
        : artwork.availability === "made-to-order"
          ? "https://schema.org/MadeToOrder"
          : artwork.availability === "reserved"
            ? "https://schema.org/PreOrder"
            : "https://schema.org/SoldOut";

    // Google Merchant prefers a `priceValidUntil` on every offer; we use
    // end-of-current-year so the field stays plausibly fresh without
    // requiring per-product editorial input. Likewise, `shippingDetails`
    // and `hasMerchantReturnPolicy` unlock the price-and-availability
    // rich result; we expose the same nationwide shipping band the
    // /policy/shipping page documents.
    const endOfYear = new Date();
    endOfYear.setMonth(11, 31);
    endOfYear.setHours(23, 59, 59, 0);
    const priceValidUntil = endOfYear.toISOString().slice(0, 10);

    const data: Record<string, unknown> = {
      "@context": "https://schema.org/",
      "@type": "Product",
      name: artwork.title,
      description:
        artwork.description ||
        `${artwork.title} — original painting on ${artwork.medium}, ${artwork.year}.`,
      image: imageUrls,
      sku: artwork.id,
      mpn: artwork.id,
      brand: { "@type": "Brand", name: "Canvas Hub" },
      offers: {
        "@type": "Offer",
        url,
        priceCurrency: "PHP",
        price: getEffectivePrice(artwork),
        priceValidUntil,
        availability,
        itemCondition: "https://schema.org/NewCondition",
        seller: { "@type": "Organization", name: "Canvas Hub" },
        shippingDetails: {
          "@type": "OfferShippingDetails",
          shippingDestination: {
            "@type": "DefinedRegion",
            addressCountry: "PH",
          },
          shippingRate: {
            "@type": "MonetaryAmount",
            currency: "PHP",
            value: "0",
          },
          deliveryTime: {
            "@type": "ShippingDeliveryTime",
            handlingTime: {
              "@type": "QuantitativeValue",
              minValue: 7,
              maxValue: 21,
              unitCode: "DAY",
            },
            transitTime: {
              "@type": "QuantitativeValue",
              minValue: 2,
              maxValue: 7,
              unitCode: "DAY",
            },
          },
        },
        hasMerchantReturnPolicy: {
          "@type": "MerchantReturnPolicy",
          applicableCountry: "PH",
          returnPolicyCategory:
            "https://schema.org/MerchantReturnFiniteReturnWindow",
          merchantReturnDays: 7,
          returnMethod: "https://schema.org/ReturnByMail",
          returnFees: "https://schema.org/FreeReturn",
        },
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

  // BreadcrumbList JSON-LD mirrors the visible <Breadcrumb> trail
  // above so Google can render the structured "Home > Collection >
  // [Category] > Title" path on the SERP card instead of the raw
  // URL slug. The visible breadcrumb and this block always have to
  // agree, so we derive both from the same `artwork.category`.
  const breadcrumbJsonLd = useMemo(() => {
    if (!artwork) return null;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const items: Array<Record<string, unknown>> = [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: `${origin}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Collection",
        item: `${origin}/collection`,
      },
    ];
    if (artwork.category) {
      items.push({
        "@type": "ListItem",
        position: items.length + 1,
        name: artwork.category,
        item: `${origin}/collection?categories=${encodeURIComponent(
          artwork.category,
        )}`,
      });
    }
    items.push({
      "@type": "ListItem",
      position: items.length + 1,
      name: artwork.title,
    });
    const data = {
      "@context": "https://schema.org/",
      "@type": "BreadcrumbList",
      itemListElement: items,
    };
    return JSON.stringify(data).replace(/</g, "\\u003c");
  }, [artwork]);

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
  // "View on your wall" shows the mockup photo (2nd uploaded image —
  // typically the painting staged in a real interior) edge-to-edge.
  // Falls back to the bare artwork (1st photo) when no mockup was
  // uploaded so the modal always has something to render.
  const wallImage = galleryImages[1] ?? galleryImages[0];
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
    // Project a thumbnail of the artwork from the add-to-cart button
    // (the surface the visitor just engaged with) into the nav cart
    // icon. The flight is purely chrome — the cart state update
    // below always lands.
    const sourceRect = addToCartButtonRef.current?.getBoundingClientRect();
    if (sourceRect) {
      flyToCart.trigger({ imageUrl: artwork.image, fromRect: sourceRect });
    }
    addToCart({
      id: artwork.id,
      image: artwork.image,
      title: artwork.title,
      medium: artwork.medium,
      year: artwork.year,
      price: effectivePrice,
      ...(artwork.dimensions ? { dimensions: artwork.dimensions } : {}),
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      {breadcrumbJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd }}
        />
      ) : null}
      <GalleryNav />
      <main
        id="main-content"
        className="flex-1 pt-24 md:pt-32 pb-20 px-4 sm:px-6 md:px-12 max-w-7xl mx-auto w-full"
      >
        <StorefrontErrorBoundary surface={`product-${id}`}>
          {/* Breadcrumb trail: Home → Collection → [Category if present]
            → Product title. Renders the structured trail visibly for
            shoppers (especially on deep-linked landings where they
            don't have a clean back stack) AND emits a
            BreadcrumbList JSON-LD schema block below so Google can
            show the trail on the SERP card instead of a bare URL. */}
          <Breadcrumb className="mb-4">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link
                    to="/"
                    className="font-body text-xs tracking-[0.2em] uppercase"
                  >
                    Home
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link
                    to="/collection"
                    className="font-body text-xs tracking-[0.2em] uppercase"
                  >
                    Collection
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              {artwork.category ? (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link
                        to="/collection"
                        search={{ categories: artwork.category }}
                        className="font-body text-xs tracking-[0.2em] uppercase"
                      >
                        {artwork.category}
                      </Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                </>
              ) : null}
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="font-body text-xs tracking-[0.2em] uppercase line-clamp-1 max-w-[55vw] sm:max-w-none">
                  {artwork.title}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
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
              <div
                ref={heroFrameRef}
                className="relative bg-card/30 border border-border/40 rounded-xl overflow-hidden gallery-frame holo-frame"
              >
                {isVideoActive && productVideo ? (
                  <>
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
                        {/* Accessibility: studio videos are short, ambient
                        clips of the artist working on the piece — they
                        carry no spoken dialogue, so there is no
                        verbatim caption file to ship. We attach an
                        empty WebVTT descriptions track instead, which
                        AT users can detect as "descriptions available",
                        plus the visible descriptive paragraph below
                        the video so screen-reader and low-bandwidth
                        users get the same context as visual
                        viewers. */}
                        <track
                          kind="descriptions"
                          srcLang="en"
                          label="Studio video description"
                          src="data:text/vtt;charset=utf-8,WEBVTT%0A%0A"
                          default
                        />
                      </video>
                    </div>
                    <p
                      className="sr-only"
                      aria-label={`${artwork.title} studio video description`}
                    >
                      Short studio clip of {artwork.title} — a hand-crafted
                      painting from Canvas Hub. The video has no spoken
                      dialogue; it shows the artist working on the piece in the
                      studio.
                    </p>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={openZoom}
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
                {/* Hero overlay buttons (On your wall / View in 3D /
                  Zoom) only appear on the 1st photo. Mockups, detail
                  shots, and the studio-video tile stay view-only so
                  customers can study the alternate angles without UI
                  competing with the artwork. */}
                {!isVideoActive && imageIndexForTile(activeImage) === 0 && (
                  <div className="absolute bottom-4 right-4 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setViewOnWall(true)}
                      aria-label="View painting on your wall"
                      title="View on your wall"
                      className="inline-flex items-center gap-1.5 px-2.5 py-2 bg-background/70 backdrop-blur-sm rounded-sm hover:bg-background/90 font-body text-[10px] tracking-[0.25em] uppercase text-foreground"
                    >
                      <Frame className="w-4 h-4" />
                      <span className="hidden sm:inline">On your wall</span>
                    </button>
                    <button
                      type="button"
                      onClick={open3D}
                      aria-label="View painting in 3D"
                      title="View in 3D"
                      className="inline-flex items-center gap-1.5 px-2.5 py-2 bg-background/70 backdrop-blur-sm rounded-sm hover:bg-background/90 font-body text-[10px] tracking-[0.25em] uppercase text-foreground"
                    >
                      <Box className="w-4 h-4" />
                      <span className="hidden sm:inline">View in 3D</span>
                    </button>
                    <button
                      type="button"
                      onClick={openZoom}
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
                <div
                  ref={thumbStripRef}
                  className="flex gap-2 overflow-x-auto pb-1"
                >
                  {Array.from({ length: totalGalleryItems }, (_, tileIdx) => {
                    if (
                      hasVideo &&
                      productVideo &&
                      tileIdx === videoTileIndex
                    ) {
                      return (
                        <button
                          key="__video-tile"
                          type="button"
                          data-thumb-tile
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
                        data-thumb-tile
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
                      {formatPHP(artwork.price)}
                    </span>
                    <span>{formatPHP(effectivePrice)}</span>
                    <span className="ml-2 text-sm text-red-500 font-semibold">
                      {discount}% OFF
                    </span>
                  </>
                ) : (
                  <>{formatPHP(artwork.price)}</>
                )}
              </div>

              <CuratorsNoteTypewriter text={artwork.description} />

              <DominantColorChips imageUrl={artwork.image} />

              <PaintingNotes productId={artwork.id} title={artwork.title} />

              {artwork.availability === "made-to-order" && (
                <div className="rounded-sm border border-blue-500/40 bg-blue-500/10 px-4 py-3 text-sm text-foreground">
                  <p className="font-body text-[10px] tracking-[0.3em] uppercase text-blue-700 dark:text-blue-300 mb-1">
                    {madeToOrderNotice.heading}
                  </p>
                  <p className="font-body text-xs md:text-sm text-muted-foreground whitespace-pre-line">
                    {madeToOrderNotice.body}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <MagneticButton
                  ref={addToCartButtonRef}
                  type="button"
                  onClick={() => handleAdd()}
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
                    ? artwork.availability === "made-to-order"
                      ? "Order this piece"
                      : "Add to cart"
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
                {(artwork.availability === "sold" ||
                  artwork.availability === "reserved") && (
                  <NotifyMeButton
                    productId={artwork.id}
                    // Different copy depending on why the piece is
                    // unavailable: a sold-out painting is permanently gone
                    // unless the artist commissions a recreation; a
                    // reserved one is held by another shopper today but
                    // may free up if the reservation lapses. Both can
                    // notify the visitor the moment availability changes.
                    label={
                      artwork.availability === "reserved"
                        ? "Notify me if released"
                        : "Notify me when available"
                    }
                  />
                )}
                <Link
                  to="/collection"
                  className="inline-flex items-center gap-2 px-6 py-3 border border-foreground/20 text-foreground font-body text-xs tracking-[0.2em] uppercase hover:bg-accent transition-all rounded-sm"
                >
                  Continue browsing
                </Link>
              </div>

              <div className="border-t border-border/40 pt-6 space-y-2 font-body text-xs text-muted-foreground tracking-[0.05em]">
                <p className="whitespace-pre-line">
                  <span className="uppercase tracking-[0.25em] text-foreground/80 mr-2">
                    {productInfoCopy.shippingLabel}
                  </span>
                  {productInfoCopy.shippingBody}
                </p>
                <p className="whitespace-pre-line">
                  <span className="uppercase tracking-[0.25em] text-foreground/80 mr-2">
                    {productInfoCopy.careLabel}
                  </span>
                  {productInfoCopy.careBody}
                </p>
              </div>
            </section>
          </motion.div>

          <ProductReviews loading={reviewsLoading} reviews={reviews} />

          <SimilarPaintingsRail currentId={artwork.id} />
          <RelatedProducts currentId={artwork.id} />
          <Suspense fallback={null}>
            <RecentlyViewed excludeId={artwork.id} />
          </Suspense>
        </StorefrontErrorBoundary>
      </main>

      {zoomed && (
        <Suspense fallback={null}>
          <ZoomOverlay
            originRect={launchRect}
            title={artwork.title}
            src={variantSrc(currentImage, "lg")}
            onClose={() => setZoomed(false)}
          />
        </Suspense>
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
            originRect={launchRect}
          />
        </Suspense>
      )}

      {viewOnWall && (
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
          <WallPreview3D
            imageUrl={variantSrc(wallImage, "lg")}
            title={artwork.title}
            dimensions={artwork.dimensions}
            onClose={() => setViewOnWall(false)}
          />
        </Suspense>
      )}

      <StickyMobileBuyBar
        watchRef={addToCartButtonRef}
        price={effectivePrice}
        originalPrice={discount > 0 ? artwork.price : undefined}
        onAdd={() => handleAdd()}
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
      <Suspense fallback={null}>
        <CartDrawer />
        <CheckoutForm />
      </Suspense>
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
  // Lightbox state. Review photos are stored as base64 data URIs
  // (~600 KB each). The previous implementation opened them as
  // `<a href={dataUri} target="_blank">`, which on mobile Chrome
  // OOMs the renderer process and looks to the customer like the
  // browser tab just closed. Rendering the photo inside an in-page
  // <ReviewPhotoLightbox /> avoids that — same GPU-safe pattern
  // already used by the home-page reviews carousel.
  const [photoView, setPhotoView] = useState<ReviewPhotoView | null>(null);
  const averageStarsRef = useRef<HTMLDivElement | null>(null);
  const totalForStars = reviews.length
    ? reviews.reduce((s, r) => s + r.rating, 0)
    : 0;
  const avgForStars = reviews.length ? totalForStars / reviews.length : 0;
  const filledCount = Math.round(avgForStars);

  // Pulse each filled star in the header rating as soon as the
  // reviews list resolves. anime.js `stagger(70)` walks left-to-right
  // so the visitor's eye lands on the rating. Replays whenever the
  // count changes (e.g. a new review arrives via re-fetch). Skipped
  // under prefers-reduced-motion.
  useEffect(() => {
    if (loading || reviews.length === 0) return;
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const host = averageStarsRef.current;
    if (!host) return;
    const filled = host.querySelectorAll<HTMLElement>(
      "[data-review-star-filled]",
    );
    if (filled.length === 0) return;
    animate(Array.from(filled), {
      scale: [1, 1.25, 1],
      duration: 520,
      delay: stagger(70),
      ease: "outElastic(1, .6)",
    });
  }, [loading, reviews.length, filledCount]);
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
          <div ref={averageStarsRef} className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => {
              const isFilled = n <= Math.round(avg);
              return (
                <Star
                  key={n}
                  data-review-star-filled={isFilled ? "" : undefined}
                  className={`w-4 h-4 ${
                    isFilled
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-muted-foreground/40"
                  }`}
                />
              );
            })}
          </div>
          <span className="font-medium text-foreground">{avg.toFixed(1)}</span>
          <span>·</span>
          <span>
            {reviews.length} review{reviews.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <GsapStaggerRail
        className="grid md:grid-cols-2 gap-4"
        xFrom={0}
        yFrom={16}
        scaleFrom={0.97}
        stagger={0.06}
        duration={0.6}
      >
        {reviews.map((r, i) => (
          <article
            key={`${r.orderId}-${i}`}
            data-rail-item
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
                {/* Reviews are written by customers shopping in PHT;
                    rendering the date in the visitor's browser locale
                    leaks the wrong calendar shape on non-Western
                    systems. `formatDatePHT` always renders Asia/Manila
                    in the storefront's en-PH locale to match the rest
                    of the site. */}
                {formatDatePHT(r.submittedAt, {
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
                {r.images.slice(0, 3).map((src, j) => {
                  const reviewImages = r.images.slice(0, 3);
                  return (
                    <button
                      key={j}
                      type="button"
                      onClick={() =>
                        setPhotoView({ images: reviewImages, index: j })
                      }
                      aria-label={`Open review photo ${j + 1}`}
                      className="block aspect-square w-full overflow-hidden rounded-md border border-border/40 focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <img
                        src={src}
                        alt={`Review photo ${j + 1}`}
                        className="h-full w-full object-cover transition-transform duration-200 hover:scale-[1.03]"
                        loading="lazy"
                        decoding="async"
                      />
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-auto">
              — {r.customerName}
              {r.customerCity ? `, ${r.customerCity}` : ""}
            </p>
          </article>
        ))}
      </GsapStaggerRail>
      <ReviewPhotoLightbox view={photoView} onChange={setPhotoView} />
    </section>
  );
}
