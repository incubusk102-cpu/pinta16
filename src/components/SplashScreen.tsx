import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

const STORAGE_KEY = "pintaterra_splash_seen_v1";

/**
 * Brand splash on first paint of a session. The "P" logo strokes draw
 * themselves on, the wordmark fades in, then the whole overlay fades out.
 * Only shown once per browser session — afterwards we set sessionStorage
 * so subsequent route changes don't re-trigger the splash.
 */
const SplashScreen = () => {
  const [visible, setVisible] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return !sessionStorage.getItem(STORAGE_KEY);
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => {
      setVisible(false);
      try {
        sessionStorage.setItem(STORAGE_KEY, "1");
      } catch {
        /* ignore */
      }
    }, 1800);
    return () => window.clearTimeout(t);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background"
          aria-hidden
        >
          <motion.svg
            width="120"
            height="120"
            viewBox="0 0 120 120"
            initial="hidden"
            animate="visible"
            className="text-foreground"
          >
            <motion.path
              d="M30 100 V20 H70 a25 25 0 0 1 0 50 H30"
              fill="none"
              stroke="currentColor"
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
              variants={{
                hidden: { pathLength: 0, opacity: 0 },
                visible: {
                  pathLength: 1,
                  opacity: 1,
                  transition: { duration: 1.1, ease: [0.4, 0, 0.2, 1] },
                },
              }}
            />
          </motion.svg>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.0, duration: 0.5 }}
            className="font-display text-base sm:text-lg tracking-[0.4em] uppercase text-gradient-elegant mt-6"
          >
            Pintaterra
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SplashScreen;
