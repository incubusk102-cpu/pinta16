import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface GsapRevealProps {
  /** Children rendered inside the reveal container. */
  children: ReactNode;
  /** Per-child stagger (s). Children = direct DOM children of the host. */
  stagger?: number;
  /** Animation duration per child (s). */
  duration?: number;
  /** Initial Y offset (px). Children rise from this distance. */
  yFrom?: number;
  /** Initial scale. Children settle to scale 1. */
  scaleFrom?: number;
  /** Easing string passed straight to GSAP. */
  ease?: string;
  /** ScrollTrigger start position. Defaults to "top 80%". */
  start?: string;
  /** When true, the animation only runs once. */
  once?: boolean;
  /** Optional class names for the host element. */
  className?: string;
  /** Optional HTML element to render. Defaults to <div>. */
  as?: "div" | "section";
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * GSAP ScrollTrigger-powered reveal wrapper. Animates direct DOM
 * children of the host element with a coordinated rise + scale +
 * fade, fired when the host enters the viewport.
 *
 * Why GSAP here (not framer-motion `whileInView`):
 * - ScrollTrigger handles edge cases (resize, refresh, async images
 *   shifting layout) more reliably than the IntersectionObserver
 *   path framer-motion uses.
 * - The `data-gsap-reveal-item` opt-in lets a parent containing
 *   wrappers / decorative divs (FilmGrain overlays, parallax masks)
 *   pick only the *tiles* to animate without animating its own
 *   chrome.
 *
 * Honours `prefers-reduced-motion` by rendering children with no
 * transform / opacity offsets at all. Cleans up its ScrollTrigger on
 * unmount so route changes don't leak observers.
 */
const GsapReveal = ({
  children,
  stagger = 0.1,
  duration = 0.85,
  yFrom = 28,
  scaleFrom = 0.94,
  ease = "power3.out",
  start = "top 80%",
  once = true,
  className,
  as = "div",
}: GsapRevealProps) => {
  const hostRef = useRef<HTMLElement | null>(null);
  const Host = as;

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const host = hostRef.current;
    if (!host) return;

    // Prefer items explicitly tagged with `data-gsap-reveal-item`; fall
    // back to direct children so a parent without explicit tagging still
    // works as a one-liner reveal wrapper.
    const tagged = host.querySelectorAll<HTMLElement>(
      "[data-gsap-reveal-item]",
    );
    const targets =
      tagged.length > 0
        ? Array.from(tagged)
        : (Array.from(host.children) as HTMLElement[]);
    if (targets.length === 0) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        targets,
        {
          autoAlpha: 0,
          y: yFrom,
          scale: scaleFrom,
        },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration,
          ease,
          stagger,
          scrollTrigger: {
            trigger: host,
            start,
            toggleActions: once
              ? "play none none none"
              : "play reverse play reverse",
          },
        },
      );
    }, host);

    return () => {
      ctx.revert();
    };
  }, [stagger, duration, yFrom, scaleFrom, ease, start, once]);

  return (
    <Host
      ref={hostRef as React.RefObject<HTMLDivElement>}
      className={className}
    >
      {children}
    </Host>
  );
};

export default GsapReveal;
