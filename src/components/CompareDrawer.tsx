import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X, Trash2, ShoppingCart, ArrowUpRight } from "lucide-react";
import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useCompare, type CompareEntry } from "@/contexts/CompareContext";
import { useCart } from "@/contexts/CartContext";
import { useStorefrontConfig } from "@/contexts/StorefrontConfigContext";

/**
 * Bottom-sheet drawer that lays the visitor's compare picks out in a
 * horizontal scroll on mobile / 2-4 col grid on desktop, with the
 * shared attributes — price, medium, year, availability — aligned
 * row-by-row so the eye can scan across.
 *
 * Mounted once at the root of the tree (see __root.tsx). Renders
 * nothing when the list is empty or the drawer is closed.
 */
const CompareDrawer = () => {
  const { items, isOpen, close, remove, clear } = useCompare();
  const { addToCart } = useCart();
  const {
    config: { vacationMode },
  } = useStorefrontConfig();
  const reduceMotion = useReducedMotion();

  // ESC closes the sheet for keyboard users.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  const handleAddToCart = (entry: CompareEntry) => {
    if (vacationMode.enabled) return;
    addToCart({
      id: entry.id,
      image: entry.image,
      title: entry.title,
      medium: entry.medium ?? "",
      year: entry.year ?? "",
      price:
        entry.salePrice != null && entry.salePrice > 0
          ? entry.salePrice
          : entry.price,
    });
    toast.success(`Added "${entry.title}" to cart`);
  };

  return (
    <AnimatePresence>
      {isOpen && items.length > 0 && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 z-[90] bg-background/55 backdrop-blur-sm"
            aria-hidden="true"
          />
          <motion.aside
            role="dialog"
            aria-label="Compare paintings"
            initial={reduceMotion ? { opacity: 0 } : { y: "100%" }}
            animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { y: "100%" }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-0 left-0 right-0 z-[95] max-h-[80vh] flex flex-col bg-background border-t border-border/60 shadow-2xl rounded-t-2xl"
          >
            <header className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-border/40 shrink-0">
              <div>
                <h2 className="font-display text-lg sm:text-xl text-foreground">
                  Compare paintings
                </h2>
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mt-1">
                  {items.length} side by side
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={clear}
                  className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear all
                </button>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close compare drawer"
                  className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-x-auto overflow-y-auto px-4 sm:px-6 py-4">
              <div className="grid grid-flow-col auto-cols-[80vw] sm:auto-cols-[280px] lg:auto-cols-[300px] gap-4">
                {items.map((entry) => {
                  const display =
                    entry.salePrice != null &&
                    entry.salePrice > 0 &&
                    entry.salePrice < entry.price
                      ? entry.salePrice
                      : entry.price;
                  const hasSale = display !== entry.price;
                  const purchasable =
                    !vacationMode.enabled &&
                    entry.availability !== "sold" &&
                    entry.availability !== "draft";
                  return (
                    <article
                      key={entry.id}
                      className="flex flex-col bg-card/40 border border-border/50 rounded-xl overflow-hidden"
                    >
                      <div className="relative aspect-[4/5] bg-muted/40">
                        <img
                          src={entry.image}
                          alt={entry.title}
                          loading="lazy"
                          decoding="async"
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => remove(entry.id)}
                          aria-label={`Remove ${entry.title} from compare`}
                          className="absolute top-2 right-2 p-1.5 rounded-full bg-black/45 hover:bg-black/65 text-white/90 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex-1 p-3 sm:p-4 flex flex-col gap-2">
                        <h3 className="font-display text-base text-foreground line-clamp-2">
                          {entry.title}
                        </h3>
                        <dl className="text-xs text-muted-foreground space-y-1">
                          {entry.medium && (
                            <div className="flex justify-between gap-3">
                              <dt className="uppercase tracking-wider text-[10px]">
                                Medium
                              </dt>
                              <dd className="text-foreground/85 text-right">
                                {entry.medium}
                              </dd>
                            </div>
                          )}
                          {entry.year && (
                            <div className="flex justify-between gap-3">
                              <dt className="uppercase tracking-wider text-[10px]">
                                Year
                              </dt>
                              <dd className="text-foreground/85 text-right">
                                {entry.year}
                              </dd>
                            </div>
                          )}
                          {entry.availability && (
                            <div className="flex justify-between gap-3">
                              <dt className="uppercase tracking-wider text-[10px]">
                                Status
                              </dt>
                              <dd className="text-foreground/85 text-right capitalize">
                                {entry.availability}
                              </dd>
                            </div>
                          )}
                          <div className="flex justify-between gap-3 pt-1">
                            <dt className="uppercase tracking-wider text-[10px]">
                              Price
                            </dt>
                            <dd className="text-foreground font-medium text-right">
                              ₱{display.toLocaleString("en-PH")}
                              {hasSale && (
                                <span className="ml-2 text-muted-foreground line-through text-[11px]">
                                  ₱{entry.price.toLocaleString("en-PH")}
                                </span>
                              )}
                            </dd>
                          </div>
                        </dl>
                        <div className="mt-auto pt-3 flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => handleAddToCart(entry)}
                            disabled={!purchasable}
                            className="inline-flex items-center justify-center gap-2 w-full px-3 py-2 text-xs uppercase tracking-[0.18em] bg-foreground text-background rounded-sm hover:bg-foreground/85 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <ShoppingCart className="w-3.5 h-3.5" />
                            Add to cart
                          </button>
                          <Link
                            to="/product/$id"
                            params={{ id: entry.id }}
                            onClick={close}
                            className="inline-flex items-center justify-center gap-1.5 w-full px-3 py-2 text-xs uppercase tracking-[0.18em] text-foreground border border-border/60 rounded-sm hover:bg-accent/50 transition-colors"
                          >
                            View painting
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};

export default CompareDrawer;
