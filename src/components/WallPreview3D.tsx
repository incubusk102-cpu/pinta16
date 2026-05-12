import { useEffect } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// "View on your wall" — fullscreen viewer for a painting's mockup
// photo. The mockup (typically the product's 2nd image) is already
// shot in a real interior so it doubles as a wall preview without
// any synthetic 3D rendering.
//
// This used to be a three.js scene with a 1.7 m human silhouette and
// a S/M/L/XL/XXL size picker; both were removed when canvas sizing
// became admin-controlled (one fixed dimension per artwork, set in
// the product editor) and customers were no longer expected to pick
// a size at checkout.

interface WallPreview3DProps {
  imageUrl: string;
  title: string;
  dimensions?: string;
  onClose: () => void;
}

export default function WallPreview3D({
  imageUrl,
  title,
  dimensions,
  onClose,
}: WallPreview3DProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[1100] bg-background/95 backdrop-blur-xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={`${title} — view on your wall`}
      >
        <div
          className="flex-1 flex items-center justify-center p-4 sm:p-8 relative"
          onClick={onClose}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="absolute top-4 right-4 z-10 p-2 rounded-sm bg-background/70 backdrop-blur-sm hover:bg-background/90 transition-colors"
            aria-label="Close wall preview"
          >
            <X className="w-5 h-5 text-foreground" />
          </button>
          <img
            src={imageUrl}
            alt={`${title} — on a wall`}
            className="max-w-full max-h-full object-contain"
            decoding="async"
            loading="eager"
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        {dimensions ? (
          <div className="px-4 pb-4 sm:pb-6 text-center">
            <p className="font-display text-base sm:text-lg text-foreground">
              {title}
            </p>
            <p className="font-body text-[10px] sm:text-xs tracking-[0.25em] uppercase text-muted-foreground mt-1">
              Dimensions · {dimensions}
            </p>
          </div>
        ) : (
          <div className="px-4 pb-4 sm:pb-6 text-center">
            <p className="font-display text-base sm:text-lg text-foreground">
              {title}
            </p>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
