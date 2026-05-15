import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

// Floating "View Collection" pill that appears on mobile once the
// customer has drifted into the editorial sections (About / ThankYou /
// Reviews / Contact). Tapping it jumps to /collection where the full
// filterable gallery now lives. Hides on tablet and up.
//
// The sentinel `id="back-to-collection-sentinel"` lives in
// src/routes/index.tsx, just before the editorial block. PR #349
// collapsed the inline gallery into a small CTA card; observing that
// card directly made the pill appear ~1 viewport too early — the
// sentinel sits further down the page so the timing matches the spirit
// of the original (only show when the customer is reading the studio
// story, not the moment they scroll past the CTA card).
const SENTINEL_ID = "back-to-collection-sentinel";

const MobileBackToCollection = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let observer: IntersectionObserver | null = null;
    let mutationObserver: MutationObserver | null = null;

    const attach = () => {
      const target = document.getElementById(SENTINEL_ID);
      if (!target) return false;
      observer = new IntersectionObserver(
        ([entry]) => {
          // Only show when the sentinel is OUT of view AND its bottom
          // edge is above the viewport (customer has scrolled past it).
          // While the sentinel is below the fold, stay hidden so we
          // don't compete with the hero CTA.
          const passed =
            !entry.isIntersecting && entry.boundingClientRect.bottom <= 0;
          setShow(passed);
        },
        { threshold: 0 },
      );
      observer.observe(target);
      return true;
    };

    if (!attach()) {
      // Sentinel sits inside a Suspense boundary that may not have
      // resolved yet (AboutSection is React.lazy). Watch the DOM and
      // attach once it shows up; tear down the watcher on success so
      // we don't keep a long-running MutationObserver around.
      mutationObserver = new MutationObserver(() => {
        if (attach()) {
          mutationObserver?.disconnect();
          mutationObserver = null;
        }
      });
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      observer?.disconnect();
      mutationObserver?.disconnect();
    };
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
          <Button
            asChild
            className="rounded-full px-4 py-2.5 font-body text-[11px] uppercase tracking-[0.25em]"
          >
            <Link to="/collection" aria-label="Browse the collection">
              View Collection
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default MobileBackToCollection;
