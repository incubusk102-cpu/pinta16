import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useLocale } from "@/contexts/LocaleContext";

interface MiniCartHoverProps {
  /** Children render the underlying cart button (icon + badge). The
   *  wrapper owns the hover / focus state and renders the peek popover
   *  positioned below the children's bounding box. */
  children: ReactNode;
  /** Click handler forwarded to the wrapper for accessibility — the
   *  same click still opens the full drawer (mobile behaviour). */
  onClickWrapper?: () => void;
}

/**
 * Desktop-only "peek" popover anchored to the cart icon in the nav.
 *
 * On hover (or focus-within), if the visitor's cart has items, the
 * popover slides down to show the most recent 3 lines + subtotal +
 * a "View cart" CTA. Mobile gets nothing — tap behaviour on the
 * underlying button continues to open the full `<CartDrawer />`.
 *
 * The wrapper does NOT replace the click handler. The click that
 * opens the drawer keeps working unchanged; the hover preview is
 * additive chrome.
 */
const PHP_FORMATTER = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

export default function MiniCartHover({
  children,
  onClickWrapper,
}: MiniCartHoverProps) {
  const { items, subtotal, itemCount, openCart } = useCart();
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const closeTimerRef = useRef<number | null>(null);

  // The peek surfaces the last 3 lines (most recent first). Lines
  // added in succession stack newest-first so the visitor sees the
  // change that just happened, not what they added 20 minutes ago.
  const previewLines = useMemo(() => items.slice(-3).reverse(), [items]);

  const scheduleClose = () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 120);
  };
  const cancelClose = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  const motionProps = reduceMotion
    ? { initial: false, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: -6, scale: 0.98 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: -4, scale: 0.98 },
      };

  return (
    <div
      className="relative"
      onMouseEnter={() => {
        cancelClose();
        if (itemCount > 0) setOpen(true);
      }}
      onMouseLeave={scheduleClose}
      onFocusCapture={() => {
        cancelClose();
        if (itemCount > 0) setOpen(true);
      }}
      onBlurCapture={scheduleClose}
      onClick={onClickWrapper}
    >
      {children}
      <AnimatePresence>
        {open && itemCount > 0 && (
          <motion.div
            {...motionProps}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            // Hidden on touch / narrow viewports — the cart drawer is
            // the primary interaction on mobile, hover events fire
            // inconsistently there, and the peek would intercept the
            // tap. md+ only.
            className="hidden md:block absolute right-0 top-full mt-2 w-[300px] bg-background border border-border/60 rounded-xl shadow-xl overflow-hidden z-[80]"
            role="dialog"
            aria-label="Cart preview"
          >
            <div className="px-4 pt-3 pb-2 flex items-baseline justify-between gap-3 border-b border-border/30">
              <span className="font-display text-sm text-foreground">
                {t("nav.cart")}
              </span>
              <span className="text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </span>
            </div>
            <ul className="divide-y divide-border/30">
              {previewLines.map((line, index) => (
                <li
                  key={`${line.id}-${index}`}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <img
                    src={line.image}
                    alt=""
                    className="w-10 h-10 object-cover rounded-sm shrink-0"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">
                      {line.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {line.quantity} × {PHP_FORMATTER.format(line.price)}
                    </p>
                  </div>
                </li>
              ))}
              {items.length > previewLines.length && (
                <li className="px-4 py-2 text-[11px] text-muted-foreground">
                  + {items.length - previewLines.length} more
                </li>
              )}
            </ul>
            <div className="px-4 py-3 flex items-center justify-between gap-3 border-t border-border/30">
              <span className="text-[11px] tracking-[0.16em] uppercase text-muted-foreground">
                Subtotal
              </span>
              <span className="font-display text-sm text-foreground">
                {PHP_FORMATTER.format(subtotal)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openCart();
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-body uppercase tracking-[0.2em] text-background bg-foreground hover:bg-foreground/90 transition-colors"
            >
              View cart <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
