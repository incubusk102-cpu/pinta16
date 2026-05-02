import { useRef, useState } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { ShoppingCart, Eye, Heart } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/contexts/CartContext";
import { useStorefrontConfig } from "@/contexts/StorefrontConfigContext";
import { useWishlist } from "@/contexts/WishlistContext";
import {
  getEffectivePrice,
  getDiscountPercent,
} from "@/contexts/ProductContext";
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
  onClick: () => void;
}

const availabilityBadgeClass: Record<Availability, string> = {
  available: "",
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
  onClick,
}: ArtworkCardProps) => {
  const { addToCart } = useCart();
  const {
    config: { vacationMode },
  } = useStorefrontConfig();
  const wishlist = useWishlist();
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  // Mouse-tracked 3D tilt: pointer x/y get mapped onto a small rotation
  // around the X/Y axes, springed for a smooth follow. Disabled on touch
  // / reduced-motion via the CSS media query on `motion-safe:` below.
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const springConfig = { stiffness: 220, damping: 22, mass: 0.4 };
  const rotateX = useSpring(
    useTransform(tiltY, [-0.5, 0.5], [8, -8]),
    springConfig,
  );
  const rotateY = useSpring(
    useTransform(tiltX, [-0.5, 0.5], [-8, 8]),
    springConfig,
  );
  const glareX = useTransform(tiltX, [-0.5, 0.5], ["0%", "100%"]);
  const glareY = useTransform(tiltY, [-0.5, 0.5], ["0%", "100%"]);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
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

  const handleToggleWishlist = (e: React.MouseEvent) => {
    e.stopPropagation();
    const added = wishlist.toggle({
      id,
      title,
      image,
      price: effectivePrice,
    });
    toast.success(
      added
        ? `Saved "${title}" to your wishlist`
        : `Removed "${title}" from your wishlist`,
    );
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!purchasable) return;
    addToCart({
      id,
      image,
      title,
      medium,
      year,
      price: effectivePrice,
    });
  };

  const displayImage = isHovered && mockup ? mockup : image;
  const isDimmed = availability === "sold" || availability === "draft";

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      className="break-inside-avoid group cursor-pointer [perspective:1200px]"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        resetTilt();
      }}
      onPointerMove={handlePointerMove}
    >
      <motion.div
        style={{
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
        }}
        whileHover={{ y: -4 }}
        transition={{ y: { type: "spring", stiffness: 220, damping: 22 } }}
        className="relative overflow-hidden gallery-frame hover-lift-shadow will-change-transform motion-reduce:!transform-none"
      >
        {/* Painterly glare overlay following pointer */}
        <motion.div
          aria-hidden
          style={{
            background: `radial-gradient(380px circle at var(--gx) var(--gy), rgba(255,255,255,0.18), transparent 60%)`,
            ["--gx" as string]: glareX,
            ["--gy" as string]: glareY,
          }}
          className="pointer-events-none absolute inset-0 z-[4] mix-blend-overlay opacity-0 group-hover:opacity-100 transition-opacity duration-500 motion-reduce:hidden"
        />
        <AnimatePresence mode="wait">
          <motion.img
            key={displayImage}
            src={displayImage}
            alt={title}
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4 }}
            className={`w-full object-cover ${isDimmed ? "grayscale opacity-80" : ""}`}
            loading="lazy"
            decoding="async"
            // Help the browser pick an appropriately-sized image for
            // the card slot at each breakpoint (gallery is 1-up on
            // mobile, 2-up on `sm:`, 3-up on `lg:`).
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
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

        {/* Wishlist heart */}
        <button
          type="button"
          onClick={handleToggleWishlist}
          aria-pressed={inWishlist}
          aria-label={
            inWishlist
              ? `Remove ${title} from wishlist`
              : `Save ${title} to wishlist`
          }
          className="absolute top-3 right-3 z-[3] p-2 rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60 transition-colors"
        >
          <Heart
            className={`w-4 h-4 transition-colors ${
              inWishlist ? "fill-red-500 text-red-500" : "text-white/80"
            }`}
          />
        </button>

        {/* Availability badge */}
        {availability !== "available" && (
          <div
            className={`absolute top-3 left-3 z-[2] px-2 py-0.5 font-body text-[10px] tracking-[0.2em] uppercase rounded-sm ${availabilityBadgeClass[availability]}`}
          >
            {AVAILABILITY_LABEL[availability]}
          </div>
        )}

        {/* Discount badge */}
        {discount > 0 && availability === "available" && (
          <div className="absolute top-3 left-3 z-[1] px-2 py-0.5 bg-red-600 text-white font-body text-[10px] tracking-wider uppercase rounded-sm">
            {discount}% OFF
          </div>
        )}

        {/* Bottom-up legibility gradient. Always on for touch viewports
            so the title + price strip below is readable over the image;
            hover-only on md+ so desktop visitors see the bare painting
            until they engage. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-500" />
        {/* Metadata + add-to-cart strip. On <md it stays anchored at the
            bottom so touch users can see the title, price, and tap the
            cart button; on md+ it slides up on hover for a cleaner
            gallery aesthetic. */}
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5 translate-y-0 md:translate-y-full md:group-hover:translate-y-0 transition-transform duration-500">
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
