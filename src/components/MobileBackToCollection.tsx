import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp } from "lucide-react";

// Floating "View Collection" pill that appears on mobile once the gallery
// has scrolled out of the viewport (i.e. the user is reading About / Reviews
// / Contact). Tapping it snaps back to the gallery. Hides on tablet and up.
const MobileBackToCollection = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const target = document.getElementById("gallery");
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Only show when the gallery is OUT of view AND its bottom edge is
        // above the viewport (user has scrolled past it). When the gallery
        // is below the viewport (still scrolling down toward it), stay
        // hidden so we don't compete with the hero CTA.
        const pastGallery =
          !entry.isIntersecting && entry.boundingClientRect.bottom <= 0;
        setShow(pastGallery);
      },
      { threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const handleClick = () => {
    document
      .getElementById("gallery")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.button
          type="button"
          onClick={handleClick}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="md:hidden fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 inline-flex items-center gap-2 rounded-full bg-foreground text-background px-4 py-2.5 font-body text-[11px] tracking-[0.25em] uppercase shadow-[0_6px_20px_-4px_rgba(0,0,0,0.35)] hover:bg-foreground/90 active:scale-[0.98] transition-all"
          aria-label="Back to collection"
        >
          <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
          View Collection
        </motion.button>
      )}
    </AnimatePresence>
  );
};

export default MobileBackToCollection;
