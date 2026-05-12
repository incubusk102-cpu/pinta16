import { motion, useScroll, useSpring } from "framer-motion";

// Hairline progress bar pinned to the top of the viewport that
// tracks how far the visitor has scrolled through the current page.
// Uses Framer Motion's `useScroll` (browser scroll position) +
// a spring on the `scaleX` value so the bar trails the scroll
// slightly, which reads as more refined than a hard 1:1 follow.
//
// Width is anchored to the left edge via `transform-origin: 0%`
// and renders as a gold→ivory gradient over a near-transparent
// rail so it never visually competes with the navigation.
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 24,
    mass: 0.4,
  });

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[120] h-[2px] origin-left"
      style={{
        scaleX,
        background:
          "linear-gradient(90deg, color-mix(in oklab, var(--logo-color) 70%, transparent), var(--logo-color), color-mix(in oklab, var(--foreground) 80%, transparent))",
        boxShadow:
          "0 0 8px color-mix(in oklab, var(--logo-color) 55%, transparent)",
      }}
    />
  );
}
