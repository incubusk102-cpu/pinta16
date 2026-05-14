import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface GsapStaggerRailProps {
  /** Rail contents. Each individual item must carry `data-rail-item`. */
  children: ReactNode;
  /** Per-item stagger (s). */
  stagger?: number;
  /** Duration per item (s). */
  duration?: number;
  /** Initial X offset (px). Items slide in from this distance. */
  xFrom?: number;
  /** Initial Y offset (px). Items rise from this distance. */
  yFrom?: number;
  /** Initial scale. Items settle to scale 1. */
  scaleFrom?: number;
  /** ScrollTrigger start string. */
  start?: string;
  /** GSAP easing string. */
  ease?: string;
  /** When true (default) the animation plays only the first time. */
  once?: boolean;
  /** Optional class names on the host element. */
  className?: string;
  /** Optional HTML element. Defaults to <div>. */
  as?: "div" | "section";
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * GSAP ScrollTrigger-driven left-to-right stagger reveal for
 * horizontal product rails (RecommendedRow, RecentlyViewed,
 * PaintingMarquee). Each rail item must opt-in via
 * `data-rail-item` so wrappers / dividers / fade gutters aren't
 * picked up by the selector.
 *
 * Items animate in from the left (`xFrom` px) with an upward rise
 * and a 0.94 → 1 scale settle. ScrollTrigger fires at `start`
 * (default `"top 85%"`) and toggles on first viewport entry only.
 * Cleanup via `gsap.context().revert()` so unmounting the rail
 * doesn't leak ScrollTriggers on long-scrolling routes.
 *
 * Honours `prefers-reduced-motion`.
 */
const GsapStaggerRail = ({
  children,
  stagger = 0.07,
  duration = 0.7,
  xFrom = -28,
  yFrom = 12,
  scaleFrom = 0.94,
  start = "top 85%",
  ease = "power3.out",
  once = true,
  className,
  as = "div",
}: GsapStaggerRailProps) => {
  const hostRef = useRef<HTMLElement | null>(null);
  const Host = as;

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const host = hostRef.current;
    if (!host) return;

    const items = host.querySelectorAll<HTMLElement>("[data-rail-item]");
    if (items.length === 0) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        Array.from(items),
        {
          autoAlpha: 0,
          x: xFrom,
          y: yFrom,
          scale: scaleFrom,
        },
        {
          autoAlpha: 1,
          x: 0,
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
  }, [stagger, duration, xFrom, yFrom, scaleFrom, start, ease, once]);

  return (
    <Host
      ref={hostRef as React.RefObject<HTMLDivElement>}
      className={className}
    >
      {children}
    </Host>
  );
};

export default GsapStaggerRail;
