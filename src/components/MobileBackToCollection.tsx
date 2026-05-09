import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";

// Floating "View Collection" pill that appears on mobile once the
// homepage's collection-CTA section has scrolled out of view (i.e. the
// customer is reading About / Reviews / Contact). Tapping it jumps to
// /collection where the full filterable gallery now lives. Hides on
// tablet and up. Only mounts on the homepage today (the homepage
// renders it lazily), so the observed `#gallery` anchor is always the
// homepage CTA section, but the destination is the dedicated route so
// the customer always lands on the same browse experience.
const MobileBackToCollection = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const target = document.getElementById("gallery");
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Only show when the gallery anchor is OUT of view AND its
        // bottom edge is above the viewport (customer has scrolled
        // past it). When the anchor is below the viewport (still
        // scrolling down toward it), stay hidden so we don't compete
        // with the hero CTA.
        const pastGallery =
          !entry.isIntersecting && entry.boundingClientRect.bottom <= 0;
        setShow(pastGallery);
      },
      { threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="md:hidden fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40"
        >
          <Link
            to="/collection"
            className="inline-flex items-center gap-2 rounded-full bg-foreground text-background px-4 py-2.5 font-body text-[11px] tracking-[0.25em] uppercase shadow-[0_6px_20px_-4px_rgba(0,0,0,0.35)] hover:bg-foreground/90 active:scale-[0.98] transition-all"
            aria-label="Browse the collection"
          >
            View Collection
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default MobileBackToCollection;
