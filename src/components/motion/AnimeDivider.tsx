import { useEffect, useId, useRef } from "react";
import { animate, stagger } from "animejs";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface AnimeDividerProps {
  /** Number of drifting particles along the hairline. Defaults to 5. */
  particleCount?: number;
  /** Optional extra class names on the host element. */
  className?: string;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Editorial section divider — an animated hairline with a travelling
 * bead and a tiny particle field. Replaces the CSS-only
 * `SectionDivider` with a richer treatment driven by anime.js (the
 * particles' staggered entrance) and GSAP (the bead orbit +
 * ScrollTrigger-gated hairline draw-in).
 *
 * Reduced-motion: renders a static hairline only.
 */
const AnimeDivider = ({
  particleCount = 5,
  className = "",
}: AnimeDividerProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const lineRef = useRef<SVGPathElement | null>(null);
  const beadRef = useRef<SVGCircleElement | null>(null);
  const reactId = useId();
  const gradientId = `anime-divider-grad-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const particles = Array.from({ length: particleCount }).map((_, i) => {
    const seed = (i + 1) / (particleCount + 1);
    return {
      top: 30 + Math.round(seed * 40) + (i % 2 === 0 ? -6 : 6),
      left: Math.round(seed * 92) + 4,
    };
  });

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const host = hostRef.current;
    const line = lineRef.current;
    const bead = beadRef.current;
    if (!host || !line || !bead) return;

    // Measure the line length so the draw-in fills the rendered path
    // regardless of viewport width (the SVG itself stretches to 100%).
    const length = line.getTotalLength();
    line.style.strokeDasharray = `${length}`;
    line.style.strokeDashoffset = `${length}`;

    const ctx = gsap.context(() => {
      // Hairline draw-in, gated on the divider scrolling into view.
      const drawIn = gsap.to(line, {
        strokeDashoffset: 0,
        duration: 1.6,
        ease: "power2.out",
        scrollTrigger: {
          trigger: host,
          start: "top 92%",
          toggleActions: "play none none none",
        },
      });

      // Endless bead orbit along the hairline. We translate via x in
      // a percentage of the host width so the bead always rides the
      // line even as the viewport resizes.
      const orbit = gsap.fromTo(
        bead,
        { attr: { cx: 0 }, opacity: 0 },
        {
          attr: { cx: 100 },
          opacity: 1,
          duration: 6.5,
          ease: "none",
          repeat: -1,
          yoyo: true,
          delay: 1.4,
        },
      );

      // anime.js handles the entry stagger of the particle field.
      // Each particle is opacity:0 + translateY(8) initially; anime
      // reveals them in sequence after the hairline draws.
      const particleNodes = host.querySelectorAll<HTMLElement>(
        "[data-divider-particle]",
      );
      if (particleNodes.length > 0) {
        animate(Array.from(particleNodes), {
          opacity: [0, 1],
          translateY: [8, 0],
          duration: 900,
          delay: stagger(120, { start: 700 }),
          ease: "outQuad",
        });
      }

      return () => {
        drawIn.kill();
        orbit.kill();
      };
    }, host);

    return () => {
      ctx.revert();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className={`anime-divider relative w-full h-12 sm:h-14 ${className}`.trim()}
    >
      <svg
        viewBox="0 0 100 1"
        preserveAspectRatio="none"
        className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px w-full overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.05" />
            <stop offset="50%" stopColor="currentColor" stopOpacity="0.45" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <path
          ref={lineRef}
          d="M 0 0.5 L 100 0.5"
          stroke={`url(#${gradientId})`}
          strokeWidth={0.3}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          ref={beadRef}
          cx={0}
          cy={0.5}
          r={0.6}
          fill="currentColor"
          opacity={0}
          vectorEffect="non-scaling-stroke"
          style={{ filter: "drop-shadow(0 0 4px currentColor)" }}
        />
      </svg>
      {particles.map((p, i) => (
        <span
          key={i}
          data-divider-particle
          className="absolute size-1 rounded-full bg-current/70 pointer-events-none"
          style={{
            top: `${p.top}%`,
            left: `${p.left}%`,
            opacity: 0,
          }}
        />
      ))}
    </div>
  );
};

export default AnimeDivider;
