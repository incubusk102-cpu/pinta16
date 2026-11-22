import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import gsap from "gsap";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Cinematic route-change wipe layered on top of the existing
 * framer-motion fade-up in `PageTransitions`. On every storefront
 * pathname change a single brand-foreground ribbon scales across
 * the viewport (`scaleX 0 → 1 → 0`) so the navigation feels like a
 * deliberate cut rather than a content swap. Admin routes and
 * reduced-motion visitors get nothing — the existing framer-motion
 * fade handles those cases on its own.
 *
 * The overlay is `pointer-events: none` and `aria-hidden`, so it
 * never intercepts clicks or screen-reader focus. Mounted once at
 * the root.
 */
const RouteWipeOverlay = () => {
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });
  const overlayRef = useRef<HTMLDivElement | null>(null);
  // Track the previous pathname so we skip the very first render
  // (no wipe on landing, only on transitions).
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = lastPathRef.current;
    lastPathRef.current = pathname;
    if (prev === null) return;
    if (prev === pathname) return;
    if (pathname.startsWith("/admin")) return;
    if (prefersReducedMotion()) return;
    const overlay = overlayRef.current;
    if (!overlay) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: "power3.inOut" },
      });
      tl.set(overlay, {
        scaleX: 0,
        transformOrigin: "left center",
        opacity: 1,
      })
        .to(overlay, { scaleX: 1, duration: 0.32 })
        .to(overlay, {
          scaleX: 0,
          transformOrigin: "right center",
          duration: 0.36,
        });
    }, overlay);

    return () => {
      ctx.revert();
    };
  }, [pathname]);

  return (
    <div
      ref={overlayRef}
      aria-hidden="true"
      // z-[140] sits above the cart drawer (z-80) and FlyToCart
      // layer (z-[120]) but below the sonner toaster (z-[200]).
      className="pointer-events-none fixed inset-0 z-[140] origin-left scale-x-0 bg-foreground"
    />
  );
};

export default RouteWipeOverlay;
