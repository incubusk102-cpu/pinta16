import { useEffect, useMemo, useRef } from "react";
import { animate } from "animejs";

interface AnimeCounterProps {
  /** Target integer to roll the counter up (or down) to. */
  value: number;
  /** Initial value used the first time the counter renders. Defaults to 0. */
  from?: number;
  /** Animation duration in ms. */
  durationMs?: number;
  /** Easing name. Defaults to "outExpo" — quick start, long settle. */
  ease?: string;
  /** Optional formatter for the rendered number (e.g. Intl). */
  format?: (value: number) => string;
  /** Optional class names on the host span. */
  className?: string;
  /** Render element. Defaults to <span>. */
  as?: "span" | "strong" | "div";
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Animated integer counter powered by anime.js v4. Animates a single
 * scalar prop and writes the formatted result into a span on every
 * frame, so React doesn't have to re-render mid-animation.
 *
 * Why anime.js (not framer-motion's `useMotionValue` + a `useEffect`
 * that reads `value.on("change")`): anime.js's `update` callback +
 * `outExpo` easing gives a satisfying "spin the odometer" feel with
 * no extra wiring, and the same component is reused across the
 * homepage (visitor count, ratings, totals) without each caller
 * implementing the same scaffolding.
 */
const AnimeCounter = ({
  value,
  from = 0,
  durationMs = 1400,
  ease = "outExpo",
  format,
  className,
  as = "span",
}: AnimeCounterProps) => {
  const hostRef = useRef<HTMLElement | null>(null);
  const lastValueRef = useRef<number | null>(null);
  const Host = as;
  // Memoise so the effect's dep array is stable when the caller
  // passes a fresh inline `format` callback each render.
  const fmt = useMemo(
    () => format ?? ((n: number) => String(Math.round(n))),
    [format],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const target = Number.isFinite(value) ? value : 0;
    const start =
      lastValueRef.current === null ? from : (lastValueRef.current ?? 0);
    lastValueRef.current = target;

    if (prefersReducedMotion()) {
      host.textContent = fmt(target);
      return;
    }

    const proxy = { n: start };
    host.textContent = fmt(start);

    const controls = animate(proxy, {
      n: target,
      duration: durationMs,
      ease,
      onUpdate: () => {
        host.textContent = fmt(proxy.n);
      },
      onComplete: () => {
        // Land exactly on the integer target to avoid sub-pixel drift
        // from the easing curve.
        host.textContent = fmt(target);
      },
    });

    return () => {
      controls.pause();
    };
  }, [value, from, durationMs, ease, fmt]);

  // Callback ref keeps the typing honest across the polymorphic `as`
  // prop ("span" | "strong" | "div") — each rendered tag's element
  // subtype is widened to HTMLElement via the callback signature.
  return (
    <Host
      ref={(el: HTMLElement | null) => {
        hostRef.current = el;
      }}
      className={className}
    >
      {fmt(from)}
    </Host>
  );
};

export default AnimeCounter;
