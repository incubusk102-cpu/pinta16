import { useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

export interface ReviewPhotoView {
  images: string[];
  index: number;
}

interface Props {
  view: ReviewPhotoView | null;
  onChange: (view: ReviewPhotoView | null) => void;
}

// Fullscreen viewer for review photos. Used by both the home-page
// reviews carousel and the per-product reviews section. Lives as a
// shared component so the GPU-safe rendering choices made here stay
// consistent in every place a customer can tap a review photo —
// review images are stored as ~600 KB base64 data URIs, and opening
// one as a top-level `<a href={dataUri} target="_blank">` reliably
// OOMs mobile Chrome on low-RAM devices (the browser decodes the
// full bitmap with no layout-driven downsampling). Rendering inside
// a constrained <img> inside the SPA avoids that.
const ReviewPhotoLightbox = ({ view, onChange }: Props) => {
  const close = useCallback(() => onChange(null), [onChange]);
  const showPrev = useCallback(() => {
    if (!view) return;
    onChange({
      ...view,
      index: view.index === 0 ? view.images.length - 1 : view.index - 1,
    });
  }, [view, onChange]);
  const showNext = useCallback(() => {
    if (!view) return;
    onChange({
      ...view,
      index: view.index === view.images.length - 1 ? 0 : view.index + 1,
    });
  }, [view, onChange]);

  useBodyScrollLock(view !== null);

  useEffect(() => {
    if (!view) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") showPrev();
      else if (e.key === "ArrowRight") showNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, close, showPrev, showNext]);

  return (
    <AnimatePresence>
      {view && (
        <motion.div
          key="review-photo-viewer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          // Solid background, no backdrop-filter. backdrop-blur on a
          // fullscreen overlay over a large image is GPU-heavy enough
          // to crash mobile Chrome on lower-spec devices, so we stay
          // cheap and opaque here.
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/95"
          role="dialog"
          aria-modal="true"
          aria-label="Review photo viewer"
          onClick={close}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
            aria-label="Close photo viewer"
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
          >
            <X className="w-5 h-5" />
          </button>

          {view.images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  showPrev();
                }}
                aria-label="Previous photo"
                className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  showNext();
                }}
                aria-label="Next photo"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] tracking-[0.3em] uppercase text-white/80">
                {view.index + 1} / {view.images.length}
              </p>
            </>
          )}

          {/* Plain <img>, not motion.img. The framer-motion scaling
              animation on a 2000×2000 decoded photo can blow past the
              GPU memory budget on phones and crash the tab. The
              overlay's own fade is enough motion. */}
          <img
            key={view.images[view.index]}
            src={view.images[view.index]}
            alt={`Review photo ${view.index + 1}`}
            onClick={(e) => e.stopPropagation()}
            draggable={false}
            decoding="async"
            className="max-h-[90vh] max-w-[92vw] object-contain rounded-md shadow-2xl select-none"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ReviewPhotoLightbox;
