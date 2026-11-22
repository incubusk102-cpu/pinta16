import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useProducts } from "@/contexts/ProductContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { getStorefrontArtworks, type DisplayArtwork } from "@/lib/artworks";

const IDLE_TIMEOUT_MS = 25_000;
const SESSION_KEY = "canvhub_idle_nudge_shown";

/**
 * After ~25 seconds of inactivity on the homepage with no scroll, a
 * small dismissible toast slides in from the bottom-left pointing at
 * a painting we think the visitor might like:
 *
 * - If they have a wishlist, pick the most recently saved entry
 *   whose product is still purchasable.
 * - Otherwise, fall back to the first purchasable artwork (a
 *   "Featured" recommendation).
 *
 * Fires once per browser session — once dismissed, navigated away
 * from, or the user clicks through, sessionStorage records that we
 * already nudged so we don't re-pester them on every return to `/`.
 *
 * "Inactivity" = no `mousemove`, `keydown`, `pointerdown`, `touchstart`,
 * or `scroll` for the full timeout window. The first scroll cancels
 * the nudge entirely — the visitor is clearly engaged and doesn't
 * need a hint.
 */
export default function IdleNudgeToast() {
  const { products } = useProducts();
  const { items: wishlistItems } = useWishlist();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const firedRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const target = useMemo<DisplayArtwork | null>(() => {
    const all = getStorefrontArtworks(products);
    const purchasable = all.filter((a) => a.availability === "available");
    if (purchasable.length === 0) return null;
    // Prefer the most recently wishlisted artwork that's still
    // purchasable. WishlistEntry.addedAt is an ISO string; sort
    // newest first.
    const sortedWishlist = [...wishlistItems].sort((a, b) =>
      b.addedAt.localeCompare(a.addedAt),
    );
    for (const w of sortedWishlist) {
      const match = purchasable.find((a) => a.id === w.id);
      if (match) return match;
    }
    return purchasable[0] ?? null;
  }, [products, wishlistItems]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!target) return;
    if (sessionStorage.getItem(SESSION_KEY) === "1") return;

    const armTimer = () => {
      if (firedRef.current) return;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        firedRef.current = true;
        setOpen(true);
        sessionStorage.setItem(SESSION_KEY, "1");
      }, IDLE_TIMEOUT_MS);
    };

    const cancelOnScroll = () => {
      // Engaged visitors get no toast. Tear everything down.
      firedRef.current = true;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      sessionStorage.setItem(SESSION_KEY, "1");
      removeListeners();
    };

    const onActivity = () => armTimer();

    const removeListeners = () => {
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("touchstart", onActivity);
      window.removeEventListener("scroll", cancelOnScroll);
    };

    window.addEventListener("mousemove", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity);
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("touchstart", onActivity, { passive: true });
    window.addEventListener("scroll", cancelOnScroll, { passive: true });
    armTimer();

    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      removeListeners();
    };
  }, [target]);

  if (!target) return null;

  const wishlistMatch = wishlistItems.some((w) => w.id === target.id);
  const label = wishlistMatch ? "Still thinking it over?" : "Featured today";

  const motionProps = reduceMotion
    ? { initial: false, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 24, scale: 0.98 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 16, scale: 0.98 },
      };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          {...motionProps}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-4 z-40 hidden sm:flex max-w-sm bg-background border border-border/60 rounded-xl shadow-xl overflow-hidden"
        >
          <Link
            to="/product/$id"
            params={{ id: target.id }}
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-3 py-3 flex-1 min-w-0 hover:bg-foreground/[0.03] transition-colors duration-200"
          >
            <img
              src={target.image}
              alt=""
              className="w-14 h-14 object-cover rounded-sm shrink-0"
              loading="lazy"
              decoding="async"
            />
            <div className="min-w-0 flex-1">
              <p className="font-body text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-0.5">
                {label}
              </p>
              <p className="font-display text-sm text-foreground truncate">
                {target.title}
              </p>
              <p className="font-body text-xs text-muted-foreground truncate">
                ₱{target.price.toLocaleString("en-PH")}
              </p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Dismiss"
            className="px-2 text-muted-foreground hover:text-foreground transition-colors duration-200 border-l border-border/40"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
