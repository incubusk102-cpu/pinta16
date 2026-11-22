import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface ScrollDepthProps {
  /** Children rendered inside the depth container. */
  children: ReactNode;
  /**
   * How far the section "rises out of" the page on scroll progress.
   * Positive values feel like the section is coming closer to the
   * camera as the visitor scrolls past it. (px)
   */
  rise?: number;
  /**
   * Initial scale the section starts at (slightly larger so it
   * reads as "deeper in the scene" and resolves to 1 at center).
   */
  scaleFrom?: number;
  /**
   * Opacity floor at the top / bottom of the scrub. Center of the
   * tween always resolves to 1 — visitors never read text at low
   * opacity.
   */
  opacityFrom?: number;
  /** Scrub smoothing in seconds. Default 0.6. */
  scrub?: number | boolean;
  /** Optional class names for the host element. */
  className?: string;
  /** Optional element to render. Defaults to <div>. */
  as?: "div" | "section";
  /** DOM `id` forwarded to the host element. */
  id?: string;
  /** ARIA label forwarded to the host element. */
  "aria-label"?: string;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * `<ScrollDepth />` — a GSAP ScrollTrigger-scrubbed wrapper that
 * gives child sections a "floating in space" depth feel as the
 * visitor scrolls past.
 *
 * Unlike `GsapReveal` (a one-shot fade + rise that fires when the
 * section enters the viewport and stops), this wrapper *scrubs* its
 * animation against scroll progress, so the section gently lifts +
 * scales + brightens through the entire scroll window. The result
 * pairs with `<LandingBackdrop3D />`'s scroll-driven camera dolly
 * to give the homepage a coherent z-axis parallax — the 3D scene
 * dollies forward, the foreground sections lift toward the camera,
 * and copy / artwork drift up out of the depth.
 *
 * Honours `prefers-reduced-motion` by skipping the GSAP context
 * entirely — children render flat with no transforms. Cleans up
 * its ScrollTrigger on unmount via `gsap.context()`.
 */
const ScrollDepth = ({
  children,
  rise = 60,
  scaleFrom = 1.06,
  opacityFrom = 0.55,
  scrub = 0.6,
  className,
  as = "section",
  id,
  "aria-label": ariaLabel,
}: ScrollDepthProps) => {
  const hostRef = useRef<HTMLElement | null>(null);
  const Host = as;

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const host = hostRef.current;
    if (!host) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        host,
        {
          y: rise,
          scale: scaleFrom,
          opacity: opacityFrom,
        },
        {
          y: 0,
          scale: 1,
          opacity: 1,
          ease: "none",
          scrollTrigger: {
            trigger: host,
            // The section starts the tween before it enters fully
            // (so visitors see it "rise into view") and finishes
            // when it's roughly centred — past that point the
            // wrapper holds at the resting state so reading the
            // copy never feels like wading through animation.
            start: "top bottom",
            end: "center center",
            scrub,
          },
        },
      );
    }, host);

    return () => {
      ctx.revert();
    };
  }, [rise, scaleFrom, opacityFrom, scrub]);

  return (
    <Host
      ref={hostRef as React.RefObject<HTMLDivElement>}
      className={className}
      id={id}
      aria-label={ariaLabel}
      style={{
        // Hint the compositor — sections that lift + scale on scroll
        // benefit from being promoted to their own layer; otherwise
        // Chrome repaints the whole document on each frame.
        willChange: "transform, opacity",
      }}
    >
      {children}
    </Host>
  );
};

export default ScrollDepth;
