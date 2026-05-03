import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Heart } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useStorefrontConfig } from "@/contexts/StorefrontConfigContext";

const SEEN_KEY = "canvhub_thankyou_seen_v1";

const wasSeen = () => {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
};

const markSeen = () => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
};

/**
 * Polished modal shown once after the visitor's first paid order. The
 * artist uploads a hand-written thank-you image or video in admin →
 * Appreciation. Auto-plays exactly once per browser; gated by the
 * `lastOrder` having a paymentIntentId or non-cancelled status, plus
 * the visitor's local order count being 1.
 */
const ArtistThankYou = () => {
  const { config, loading } = useStorefrontConfig();
  const { lastOrder, orders } = useCart();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!config.thankYou.enabled) return;
    if (!config.thankYou.assetUrl) return;
    if (!lastOrder) return;
    if (wasSeen()) return;
    // Only fire on the visitor's *first* paid order. Cancelled orders
    // are never inserted into the local orders array (the
    // CompletedOrder.status union excludes them), so the array length
    // is the paid-order count.
    if (orders.length !== 1) return;
    setOpen(true);
    markSeen();
  }, [
    loading,
    config.thankYou.enabled,
    config.thankYou.assetUrl,
    lastOrder,
    orders,
  ]);

  if (!open) return null;
  const { assetUrl, assetType, message } = config.thankYou;

  return (
    <AnimatePresence>
      <motion.div
        key="thankyou-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[1200] flex items-center justify-center px-4 py-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="artist-thankyou-title"
      >
        <div
          className="absolute inset-0 bg-black/75 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.25 }}
          className="relative w-full max-w-2xl max-h-full overflow-hidden rounded-md border border-border bg-background shadow-2xl"
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute top-3 right-3 z-20 p-1.5 rounded-full text-white/90 bg-black/30 hover:bg-black/50 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="relative aspect-[16/10] bg-muted">
            {assetType === "video" ? (
              <video
                src={assetUrl}
                autoPlay
                playsInline
                controls
                className="w-full h-full object-cover bg-black"
              />
            ) : (
              <img
                src={assetUrl}
                alt="Thank you note from the artist"
                className="w-full h-full object-cover"
              />
            )}
          </div>

          <div className="px-6 py-5 md:px-8 md:py-6 space-y-3">
            <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-rose-600 dark:text-rose-300">
              <Heart className="w-3.5 h-3.5" aria-hidden="true" />A note from
              the artist
            </div>
            <h2
              id="artist-thankyou-title"
              className="font-display text-xl md:text-2xl text-foreground leading-tight"
            >
              Thank you for your first order
            </h2>
            {message && (
              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {message}
              </p>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-2 inline-flex items-center justify-center px-5 py-2.5 rounded-sm bg-foreground text-background text-xs uppercase tracking-[0.18em] hover:bg-foreground/90"
            >
              Close
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ArtistThankYou;
