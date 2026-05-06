import { useEffect, type PropsWithChildren } from "react";
import Lenis from "lenis";

/**
 * Wraps the SPA in a Lenis smooth-scroll context. Lenis adds
 * inertial easing on top of native scroll so the whole site feels
 * "buttery" the way apple.com does, without any change at the
 * component level.
 *
 * Honours `prefers-reduced-motion: reduce` — when the OS-level
 * setting is on we skip Lenis entirely and the browser's native
 * scroll handles everything. We also bail out inside iframes,
 * inside admin routes (where smooth scrolling fights the long
 * tables / tabular layouts), and on touch-only devices where
 * fingers already do their own thing.
 *
 * Lenis dispatches a regular `scroll` event after every tween, so
 * existing components that listen on `window.scroll` (the nav blur,
 * sticky bars, framer-motion's `useScroll`, etc.) keep working.
 */
const SmoothScrollProvider = ({ children }: PropsWithChildren) => {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const inAdmin = window.location.pathname.startsWith("/admin");
    const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
    if (reduce || inAdmin || isCoarsePointer) return;

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t: number) => Math.min(1, 1.001 - 2 ** (-10 * t)),
      gestureOrientation: "vertical",
      wheelMultiplier: 1,
      touchMultiplier: 1.5,
      infinite: false,
      autoRaf: false,
    });

    let rafId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = window.requestAnimationFrame(raf);
    };
    rafId = window.requestAnimationFrame(raf);

    return () => {
      window.cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
};

export default SmoothScrollProvider;
