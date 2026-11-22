import { useEffect, useRef } from "react";
import gsap from "gsap";
import { cn } from "@/lib/utils";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// `animate-pulse` from tw-animate-css is preserved as the base
// "loading" cue. On top we layer a GSAP-driven shimmer band that
// sweeps left-to-right via a CSS custom property (`--shimmer-x`)
// so a single ticker can drive every Skeleton instance on the page
// without per-instance overhead. The band is rendered via a
// `::before` pseudo-element styled here so we don't introduce
// CSS-in-JS or a separate stylesheet — the gradient is set inline
// on the host element with a Tailwind `before:*` arbitrary
// selector chain.
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const host = ref.current;
    if (!host) return;
    const ctx = gsap.context(() => {
      // Set the starting position so the band is off-screen left
      // before the first tween paints.
      gsap.set(host, { "--shimmer-x": "-100%" });
      const tween = gsap.to(host, {
        "--shimmer-x": "200%",
        duration: 1.6,
        ease: "none",
        repeat: -1,
        repeatDelay: 0.4,
      });
      return () => {
        tween.kill();
      };
    }, host);
    return () => {
      ctx.revert();
    };
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        "animate-pulse rounded-md bg-primary/10 relative overflow-hidden",
        // Shimmer band. `before:` provides the layer; `--shimmer-x`
        // is the GSAP-driven custom property that drives its
        // horizontal translation.
        "before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:w-1/2 before:translate-x-[var(--shimmer-x,-100%)] before:bg-gradient-to-r before:from-transparent before:via-foreground/10 before:to-transparent",
        "motion-reduce:before:hidden",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
