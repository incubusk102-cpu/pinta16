import { useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface GsapSparklineProps {
  /**
   * Ordered numeric values. The component normalises to the visible
   * box height — a flat array (all-zero, all-equal) renders a
   * baseline. Minimum 2 points; below that nothing draws.
   */
  values: number[];
  /** SVG viewBox width. Defaults to 120. */
  width?: number;
  /** SVG viewBox height. Defaults to 32. */
  height?: number;
  /** Stroke + fill accent colour. Defaults to currentColor. */
  color?: string;
  /** Stroke width in viewBox units. Defaults to 1.6. */
  strokeWidth?: number;
  /** When provided, label is rendered below the chart for screen readers. */
  ariaLabel?: string;
  /** Optional className passed to the host SVG. */
  className?: string;
  /** Draw duration in seconds. Defaults to 1.1. */
  duration?: number;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Motion primitive that renders a small SVG sparkline and animates
 * its path stroke from 0% → 100% length via GSAP's
 * strokeDashoffset / strokeDasharray trick. A faint area-fill below
 * the line fades in slightly behind the stroke so the chart settles
 * into a finished state rather than dangling on a thin line.
 *
 * Defaults to running only once via ScrollTrigger when the chart
 * enters the viewport — this is what the admin Analytics cards want:
 * the trendline draws in the first time the panel is scrolled into
 * view, not on every render / state update.
 *
 * Reduced-motion clients see the final state immediately, no draw.
 *
 * Sized in **viewBox units**, not pixels — the SVG is responsive by
 * default (`width="100%"`) so the caller can drop it into any
 * container width and it scales. Pass an explicit width/height when
 * a fixed footprint is needed.
 */
const GsapSparkline = ({
  values,
  width = 120,
  height = 32,
  color = "currentColor",
  strokeWidth = 1.6,
  ariaLabel,
  className,
  duration = 1.1,
}: GsapSparklineProps) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);
  const areaRef = useRef<SVGPathElement | null>(null);

  // Build the SVG path strings once per `values` change. Points are
  // sampled across the full viewBox width and y-flipped so larger
  // numbers visually sit higher (SVG origin is top-left). We keep
  // both an open line `d` and a closed-area `d` so the chart can
  // render the stroke and the subtle fill independently.
  const { linePath, areaPath } = useMemo(() => {
    if (!values || values.length < 2) {
      return { linePath: "", areaPath: "" };
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const paddingTop = strokeWidth;
    const paddingBottom = strokeWidth;
    const usableH = height - paddingTop - paddingBottom;
    const step = values.length === 1 ? 0 : width / (values.length - 1);

    const points = values.map((v, i) => {
      const x = i * step;
      const normalised = (v - min) / span;
      const y = paddingTop + (1 - normalised) * usableH;
      return [x, y] as [number, number];
    });

    const line = points
      .map(
        ([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`,
      )
      .join(" ");
    const area = `${line} L${width.toFixed(2)},${height.toFixed(2)} L0,${height.toFixed(2)} Z`;
    return { linePath: line, areaPath: area };
  }, [values, width, height, strokeWidth]);

  useEffect(() => {
    const path = pathRef.current;
    const area = areaRef.current;
    const svg = svgRef.current;
    if (!path || !svg) return;
    if (!linePath) return;

    // Reduced-motion path: show the final state immediately.
    if (prefersReducedMotion()) {
      path.style.strokeDasharray = "none";
      path.style.strokeDashoffset = "0";
      path.style.opacity = "1";
      if (area) area.style.opacity = "0.18";
      return;
    }

    const length = path.getTotalLength();
    path.style.strokeDasharray = `${length} ${length}`;
    path.style.strokeDashoffset = `${length}`;
    path.style.opacity = "1";
    if (area) area.style.opacity = "0";

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: svg,
          start: "top 90%",
          toggleActions: "play none none none",
        },
      });
      tl.to(path, {
        strokeDashoffset: 0,
        duration,
        ease: "power2.out",
      });
      if (area) {
        tl.to(
          area,
          {
            opacity: 0.18,
            duration: duration * 0.6,
            ease: "power2.out",
          },
          `-=${duration * 0.55}`,
        );
      }
    }, svg);

    return () => {
      ctx.revert();
    };
  }, [linePath, areaPath, duration]);

  if (!linePath) {
    // Render a flat baseline so the layout doesn't collapse when
    // there's not enough data for a real chart.
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        className={className}
        aria-hidden={!ariaLabel}
        aria-label={ariaLabel}
        role={ariaLabel ? "img" : undefined}
      >
        <line
          x1={0}
          x2={width}
          y1={height / 2}
          y2={height / 2}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          opacity={0.3}
        />
      </svg>
    );
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className={className}
      aria-hidden={!ariaLabel}
      aria-label={ariaLabel}
      role={ariaLabel ? "img" : undefined}
    >
      <path
        ref={areaRef}
        d={areaPath}
        fill={color}
        stroke="none"
        style={{ opacity: 0 }}
      />
      <path
        ref={pathRef}
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ opacity: 0 }}
      />
    </svg>
  );
};

export default GsapSparkline;
