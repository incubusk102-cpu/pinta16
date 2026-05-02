import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, ShoppingCart } from "lucide-react";

interface StickyMobileBuyBarProps {
  // Selector or DOM ref for the in-page Add-to-cart button so we hide
  // the sticky bar while the original is visible (avoids stacking two
  // identical CTAs in the viewport).
  watchRef: React.RefObject<HTMLElement | null>;
  price: number;
  originalPrice?: number;
  onAdd: () => void;
  onWishlist?: () => void;
  isInWishlist?: boolean;
  ctaLabel: string;
  ctaDisabled?: boolean;
}

const StickyMobileBuyBar = ({
  watchRef,
  price,
  originalPrice,
  onAdd,
  onWishlist,
  isInWishlist,
  ctaLabel,
  ctaDisabled,
}: StickyMobileBuyBarProps) => {
  const [show, setShow] = useState(false);
  const observedEl = useRef<Element | null>(null);

  useEffect(() => {
    const target = watchRef.current;
    if (!target) return;
    observedEl.current = target;
    const io = new IntersectionObserver(
      ([entry]) => {
        // Show the sticky bar only when the in-page CTA has scrolled
        // out of the viewport. Threshold 0 = any pixel visible counts
        // as "in view".
        setShow(!entry.isIntersecting);
      },
      { rootMargin: "0px 0px -40px 0px", threshold: 0 },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [watchRef]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 320 }}
          className="md:hidden fixed bottom-0 inset-x-0 z-[70] bg-card/95 backdrop-blur-md border-t border-border/30 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_-4px_rgba(0,0,0,0.12)]"
        >
          <div className="flex items-center gap-3">
            <div className="flex flex-col leading-tight min-w-0">
              {originalPrice && originalPrice > price && (
                <span className="font-body text-[10px] line-through text-muted-foreground">
                  ₱{originalPrice.toLocaleString()}
                </span>
              )}
              <span className="font-body text-base font-semibold text-foreground">
                ₱{price.toLocaleString()}
              </span>
            </div>
            {onWishlist && (
              <button
                type="button"
                onClick={onWishlist}
                aria-pressed={isInWishlist}
                aria-label={
                  isInWishlist ? "Remove from wishlist" : "Save to wishlist"
                }
                className={`min-w-[44px] min-h-[44px] flex items-center justify-center border rounded-sm transition-all ${
                  isInWishlist
                    ? "border-red-500/40 bg-red-500/10 text-red-500"
                    : "border-foreground/20 text-foreground hover:bg-accent"
                }`}
              >
                <Heart
                  className={`w-4 h-4 ${isInWishlist ? "fill-red-500" : ""}`}
                  aria-hidden="true"
                />
              </button>
            )}
            <button
              type="button"
              onClick={onAdd}
              disabled={ctaDisabled}
              className={`flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 font-body text-xs tracking-[0.2em] uppercase rounded-sm transition-all duration-300 ${
                ctaDisabled
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-foreground text-background hover:bg-foreground/90"
              }`}
            >
              <ShoppingCart className="w-4 h-4" aria-hidden="true" />
              {ctaLabel}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default StickyMobileBuyBar;
