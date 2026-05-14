import { useRef, useState } from "react";
import {
  motion,
  AnimatePresence,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import { animate } from "animejs";
import { ShoppingCart, Eye, Heart, Box, GitCompare } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/contexts/CartContext";
import { useStorefrontConfig } from "@/contexts/StorefrontConfigContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { useQuickSpin } from "@/contexts/QuickSpinContext";
import { useCompare } from "@/contexts/CompareContext";
import { useFlyToCart } from "@/contexts/FlyToCartContext";
import {
  getEffectivePrice,
  getDiscountPercent,
  type ProductImage,
} from "@/contexts/ProductContext";
import { imgAttrs } from "@/lib/productImage";
import {
  AVAILABILITY_LABEL,
  isPurchasable,
  type Availability,
} from "@/lib/artworks";

interface ArtworkCardProps {
  id: string;
  image: string;
  mockup?: string;
  title: string;
  medium: string;
  year: string;
  price: number;
  salePrice?: number;
  description: string;
  index: number;
  availability?: Availability;
  /**
   * Full ProductImage records for the gallery card. When present,
   * the card renders `<img srcset>` against the multi-size variants
   * stored in `images[*].urls`. Absent on legacy default artworks
   * served from the static /images bundle, which fall back to the
   * single `image` prop.
   */
  images?: ProductImage[];
  onClick: () => void;
}

const availabilityBadgeClass: Record<Availability, string> = {
  available: "",
  "made-to-order": "bg-blue-600 text-white",
  reserved: "bg-amber-500 text-white",
  sold: "bg-slate-900 text-white",
  draft: "bg-muted text-foreground",
};

const ArtworkCard = ({
  id,
  image,
  mockup,
  title,
  medium,
  year,
  price,
  salePrice,
  description,
  index,
  availability = "available",
  images,
  onClick,
}: ArtworkCardProps) => {
  const { addToCart } = useCart();
  const {
    config: { vacationMode },
  } = useStorefrontConfig();
  const wishlist = useWishlist();
  const quickSpin = useQuickSpin();
  const compare = useCompare();
  const flyToCart = useFlyToCart();
  const [isHovered, setIsHovered] = useState(false);
  const [heartBurst, setHeartBurst] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const wishlistButtonRef = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const springConfig = { stiffness: 320, damping: 30, mass: 0.28 };
  const rotateX = useSpring(
    useTransform(tiltY, [-0.5, 0.5], [6, -6]),
    springConfig,
  );
  const rotateY = useSpring(
    useTransform(tiltX, [-0.5, 0.5], [-6, 6]),
    springConfig,
  );
  const glareX = useTransform(tiltX, [-0.5, 0.5], ["0%", "100%"]);
  const glareY = useTransform(tiltY, [-0.5, 0.5], ["0%", "100%"]);
  const glareBackground = useMotionTemplate`radial-gradient(320px circle at ${glareX} ${glareY}, rgba(255,255,255,0.16), transparent 62%)`;

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduceMotion || e.pointerType !== "mouse") return;
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    tiltX.set((e.clientX - rect.left) / rect.width - 0.5);
    tiltY.set((e.clientY - rect.top) / rect.height - 0.5);
  };
  const resetTilt = () => {
    tiltX.set(0);
    tiltY.set(0);
  };
  const effectivePrice = getEffectivePrice({ price, salePrice });
  const discount = getDiscountPercent({ price, salePrice });
  // Vacation mode soft-blocks add-to-cart from every product card —
  // wishlisting still works because that's how buyers tell us what to
  // reach out about when the shop reopens.
  const purchasable = isPurchasable(availability) && !vacationMode.enabled;
  const inWishlist = wishlist.has(id);

  // Spawns the dense anime.js confetti burst (8 spans, randomised
  // angle + speed) on top of framer-motion's 4-spark base. Anchored
  // to the wishlist button's centre via getBoundingClientRect()
  // because the burst layer is a viewport-positioned overlay.
  const fireWishlistConfetti = () => {
    if (reduceMotion) return;
    const btn = wishlistButtonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;
    const colors = [
      "rgba(248,113,113,0.95)", // red-400
      "rgba(252,165,165,0.9)", // red-300
      "rgba(253,224,71,0.95)", // yellow-300
      "rgba(251,191,36,0.95)", // amber-400
    ];
    for (let i = 0; i < 8; i += 1) {
      const span = document.createElement("span");
      const angle = (Math.PI * 2 * i) / 8 + (Math.random() - 0.5) * 0.45;
      const distance = 26 + Math.random() * 18;
      const size = 5 + Math.random() * 3;
      span.setAttribute("aria-hidden", "true");
      span.style.cssText = `position:fixed;top:${originY - size / 2}px;left:${originX - size / 2}px;width:${size}px;height:${size}px;border-radius:9999px;background:${colors[i % colors.length]};box-shadow:0 0 10px ${colors[i % colors.length]};pointer-events:none;z-index:9999;will-change:transform,opacity;`;
      document.body.appendChild(span);
      animate(span, {
        translateX: Math.cos(angle) * distance,
        translateY: Math.sin(angle) * distance,
        scale: [0.6, 1.05, 0.4],
        opacity: [1, 1, 0],
        duration: 620 + Math.random() * 160,
        ease: "outQuad",
        onComplete: () => {
          span.remove();
        },
      });
    }
  };

  const handleToggleWishlist = (e: React.MouseEvent) => {
    e.stopPropagation();
    const added = wishlist.toggle({
      id,
      title,
      image,
      price: effectivePrice,
    });
    // Fire the 3D burst only when the heart was just turned ON. The
    // burst animation is decorative — toggling off should feel
    // weightless, so we skip it on the removal path.
    if (added && !reduceMotion) {
      setHeartBurst(true);
      window.setTimeout(() => setHeartBurst(false), 720);
      // Layer anime.js confetti on top of the framer-motion 4-spark
      // base so the heart "pops" with extra density without
      // replacing the existing motion. Skipped on the removal path
      // and under reduced-motion.
      fireWishlistConfetti();
    }
    toast.success(
      added
        ? `Saved "${title}" to your wishlist`
        : `Removed "${title}" from your wishlist`,
    );
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!purchasable) return;
    // Project a thumbnail from the artwork's hero image into the
    // cart icon. The cart state update happens unconditionally; the
    // animation is purely chrome and silent under reduced motion.
    const rect = imgRef.current?.getBoundingClientRect();
    if (rect) {
      flyToCart.trigger({ imageUrl: image, fromRect: rect });
    }
    addToCart({
      id,
      image,
      title,
      medium,
      year,
      price: effectivePrice,
    });
  };

  const inCompare = compare.has(id);
  const handleToggleCompare = (e: React.MouseEvent) => {
    e.stopPropagation();
    const result = compare.toggle({
      id,
      title,
      image,
      medium,
      year,
      price,
      salePrice,
      availability,
    });
    if (result.rejected) {
      toast.error(
        `Compare list is full (max ${compare.limit}). Remove a painting to add another.`,
      );
      return;
    }
    toast.success(
      result.added
        ? `Added "${title}" to compare`
        : `Removed "${title}" from compare`,
    );
    if (result.added) compare.open();
  };

  // Decide which ProductImage record (if any) backs the currently
  // displayed photo so we can emit `<img srcset>` for it. Falls back
  // to a string-only `src` when the product predates the variants
  // pipeline or when the source is the static /images bundle.
  const primaryImage = images?.[0];
  const mockupImage = images && images.length > 1 ? images[1] : undefined;
  const activeImage = isHovered && mockupImage ? mockupImage : primaryImage;
  const displayImage = isHovered && mockup ? mockup : image;
  const responsiveAttrs = imgAttrs(
    activeImage && activeImage.url === displayImage ? activeImage : undefined,
    "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
  );
  const isDimmed = availability === "sold" || availability === "draft";

  return (
    <motion.div
      ref={cardRef}
      initial={reduceMotion ? false : { opacity: 0, y: 36 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{
        duration: 0.5,
        delay: (index % 4) * 0.035,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="break-inside-avoid group gallery-dof-card cursor-pointer [perspective:1200px]"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        resetTilt();
      }}
      onPointerMove={reduceMotion ? undefined : handlePointerMove}
    >
      <motion.div
        style={{
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
        }}
        whileHover={reduceMotion ? undefined : { y: -6, z: 18 }}
        transition={{
          y: { type: "spring", stiffness: 360, damping: 30 },
          z: { type: "spring", stiffness: 360, damping: 30 },
        }}
        className="relative overflow-hidden gallery-frame hover-lift-shadow motion-safe:group-hover:will-change-transform motion-reduce:!transform-none"
      >
        {/* Painterly glare overlay following pointer */}
        <motion.div
          aria-hidden
          style={{ background: glareBackground }}
          className="pointer-events-none absolute inset-0 z-[4] mix-blend-overlay opacity-0 group-hover:opacity-100 transition-opacity duration-300 motion-reduce:hidden"
        />
        <AnimatePresence mode="wait">
          <motion.img
            ref={imgRef}
            key={responsiveAttrs.src || displayImage}
            src={responsiveAttrs.src || displayImage}
            srcSet={responsiveAttrs.srcSet}
            alt={title}
            initial={reduceMotion ? false : { opacity: 0, scale: 1.025 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.985 }}
            transition={{ duration: 0.24 }}
            className={`w-full object-cover ${isDimmed ? "grayscale opacity-80" : ""}`}
            loading="lazy"
            decoding="async"
            width={responsiveAttrs.width}
            height={responsiveAttrs.height}
            // Help the browser pick an appropriately-sized image for
            // the card slot at each breakpoint (gallery is 1-up on
            // mobile, 2-up on `sm:`, 3-up on `lg:`).
            sizes={
              responsiveAttrs.sizes ??
              "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            }
          />
        </AnimatePresence>

        {/* Mockup badge on hover */}
        <AnimatePresence>
          {isHovered && mockup && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-3 right-12 flex items-center gap-1.5 px-2.5 py-1 bg-black/50 backdrop-blur-sm rounded-sm"
            >
              <Eye className="w-3 h-3 text-white/80" />
              <span className="font-body text-[9px] tracking-[0.2em] uppercase text-white/80">
                Room Preview
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quick-spin 3D peek — tapping the cube icon opens the
            shared `PaintingViewer3D` modal (the same one the product
            page uses behind "View in 3D"), pre-loaded with this
            card's primary image. The icon only appears on hover for
            fine-pointer visitors; touch users get the persistent
            button alongside the wishlist heart on the other side. */}
        <div className="absolute top-3 left-3 z-[3] flex flex-col gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              quickSpin.open({ imageUrl: image, title });
            }}
            aria-label={`Spin ${title} in 3D`}
            className="p-2 rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60 transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <Box className="w-4 h-4 text-white/85" />
          </button>
          {/* Compare toggle — pinned below the quick-spin button so the
              hover badges stay aligned on the left edge. */}
          <button
            type="button"
            onClick={handleToggleCompare}
            aria-pressed={inCompare}
            aria-label={
              inCompare
                ? `Remove ${title} from compare`
                : `Add ${title} to compare`
            }
            className={`p-2 rounded-full backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 ${
              inCompare
                ? "bg-white text-foreground"
                : "bg-black/40 text-white/85 hover:bg-black/60"
            }`}
          >
            <GitCompare className="w-4 h-4" />
          </button>
        </div>

        {/* Wishlist heart — when the heart is toggled ON we burst it
            in 3D (springy scale + rotate-X tumble) and emit four
            short-lived sparks that fly outward. Pure framer-motion,
            silent under `prefers-reduced-motion`. */}
        <button
          ref={wishlistButtonRef}
          type="button"
          onClick={handleToggleWishlist}
          aria-pressed={inWishlist}
          aria-label={
            inWishlist
              ? `Remove ${title} from wishlist`
              : `Save ${title} to wishlist`
          }
          className="absolute top-3 right-3 z-[3] p-2 rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60 transition-colors [perspective:600px]"
        >
          <motion.span
            aria-hidden="true"
            initial={false}
            animate={
              heartBurst
                ? {
                    scale: [1, 1.55, 0.92, 1.12, 1],
                    rotateX: [0, 180, 360],
                  }
                : { scale: 1, rotateX: 0 }
            }
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="relative inline-flex items-center justify-center motion-reduce:!transform-none"
            style={{ transformStyle: "preserve-3d" }}
          >
            <Heart
              className={`w-4 h-4 transition-colors ${
                inWishlist ? "fill-red-500 text-red-500" : "text-white/80"
              }`}
            />
            <AnimatePresence>
              {heartBurst && (
                <>
                  {[0, 90, 180, 270].map((angle) => (
                    <motion.span
                      key={angle}
                      aria-hidden="true"
                      initial={{ opacity: 1, x: 0, y: 0, scale: 0.4 }}
                      animate={{
                        opacity: 0,
                        x: Math.cos((angle * Math.PI) / 180) * 18,
                        y: Math.sin((angle * Math.PI) / 180) * 18,
                        scale: 1.1,
                      }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.55, ease: "easeOut" }}
                      className="pointer-events-none absolute w-1 h-1 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.85)]"
                    />
                  ))}
                </>
              )}
            </AnimatePresence>
          </motion.span>
        </button>

        {/* Availability + discount badges — bottom-left rail so they
            don't collide with the new quick-spin / compare buttons
            stacked along the top-left. */}
        {availability !== "available" && (
          <div
            className={`absolute bottom-3 left-3 z-[2] px-2 py-0.5 font-body text-[10px] tracking-[0.2em] uppercase rounded-sm ${availabilityBadgeClass[availability]}`}
          >
            {AVAILABILITY_LABEL[availability]}
          </div>
        )}

        {discount > 0 && availability === "available" && (
          <div className="absolute bottom-3 left-3 z-[1] px-2 py-0.5 bg-red-600 text-white font-body text-[10px] tracking-wider uppercase rounded-sm">
            {discount}% OFF
          </div>
        )}

        {/* Bottom-up legibility gradient. Always on for touch viewports
            so the title + price strip below is readable over the image;
            hover-only on md+ so desktop visitors see the bare painting
            until they engage. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300" />
        {/* Metadata + add-to-cart strip. On <md it stays anchored at the
            bottom so touch users can see the title, price, and tap the
            cart button; on md+ it slides up on hover for a cleaner
            gallery aesthetic. */}
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5 translate-y-0 md:translate-y-full md:group-hover:translate-y-0 transition-transform duration-300">
          <p className="font-body text-[10px] tracking-[0.3em] uppercase text-white/60 mb-1">
            {medium} · {year}
          </p>
          <h3 className="font-display text-base sm:text-lg text-white mb-1 line-clamp-1">
            {title}
          </h3>
          <p className="hidden md:block font-body text-xs text-white/70 mb-3 line-clamp-2">
            {description}
          </p>
          <div className="flex items-center justify-between">
            <span className="font-body text-sm text-white font-semibold">
              {discount > 0 ? (
                <>
                  <span className="line-through text-white/50 mr-1">
                    ₱{price.toLocaleString()}
                  </span>
                  ₱{effectivePrice.toLocaleString()}
                </>
              ) : (
                <>₱{price.toLocaleString()}</>
              )}
            </span>
            <button
              onClick={handleAddToCart}
              disabled={!purchasable}
              aria-label={
                purchasable
                  ? "Add to cart"
                  : vacationMode.enabled
                    ? "Shop paused — add-to-cart disabled"
                    : `${AVAILABILITY_LABEL[availability]} — not available`
              }
              className={`p-2.5 rounded-sm transition-colors ${
                purchasable
                  ? "bg-white/10 backdrop-blur-sm hover:bg-white/20"
                  : "bg-white/5 cursor-not-allowed opacity-50"
              }`}
            >
              <ShoppingCart className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default ArtworkCard;
