import { motion, useReducedMotion, type Variants } from "framer-motion";
import { type ReactNode } from "react";

type RevealFrom = "left" | "right" | "bottom" | "top";

/**
 * Tags supported as the host element. Kept to a small set on purpose:
 * `motion.section` and `motion.div` cover every actual use site, and
 * limiting the union lets us pick the right motion component at the
 * type level without `motion(as as ...)` casts that defeat strict TS.
 */
type SectionRevealAs = "section" | "div" | "article" | "header" | "footer";

interface SectionRevealProps {
  children: ReactNode;
  /**
   * Direction the content slides in *from* on scroll-into-view.
   * Default "bottom" reads neutrally; pair with the section's text
   * alignment ("left" for left-aligned blocks, "right" for the
   * mirrored ones) for the apple.com "scenes from different sides"
   * feel.
   */
  from?: RevealFrom;
  /** Pixel distance the content travels. */
  distance?: number;
  /** Animation duration (s). */
  duration?: number;
  /** Initial delay before the reveal starts (s). */
  delay?: number;
  /** Stagger between direct child motion components (s). */
  staggerChildren?: number;
  /** Trigger only the first time this scrolls into view. */
  once?: boolean;
  /** IntersectionObserver root margin. Use to delay/advance the trigger. */
  margin?: string;
  /** Element type to render. Default "section" so it stays semantic. */
  as?: SectionRevealAs;
  className?: string;
  /** DOM `id` (forwarded so anchor links like `#about` keep working). */
  id?: string;
  /** ARIA label, forwarded to the host element. */
  "aria-label"?: string;
}

const buildVariants = (
  from: RevealFrom,
  distance: number,
  duration: number,
  staggerChildren: number,
): Variants => {
  const offset = (() => {
    switch (from) {
      case "left":
        return { x: -distance, y: 0 };
      case "right":
        return { x: distance, y: 0 };
      case "top":
        return { x: 0, y: -distance };
      case "bottom":
      default:
        return { x: 0, y: distance };
    }
  })();
  return {
    hidden: { opacity: 0, ...offset },
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: {
        duration,
        ease: [0.16, 1, 0.3, 1],
        staggerChildren,
        when: "beforeChildren",
      },
    },
  };
};

/**
 * Wraps a section so its contents slide into view from a chosen
 * direction as the user scrolls past. Designed to make every major
 * page section feel like a separate "scene" the way apple's product
 * pages do, rather than a long uninterrupted scroll.
 *
 * Pair the `from` prop with the section's text alignment:
 * - centred / hero copy → `from="bottom"` (the default)
 * - left-aligned blocks → `from="left"`
 * - right-aligned blocks → `from="right"`
 *
 * Honours `prefers-reduced-motion` — when reduced is set we skip the
 * motion variants and render the children inline with no entry
 * animation.
 */
const SectionReveal = ({
  children,
  from = "bottom",
  distance = 60,
  duration = 0.9,
  delay = 0,
  staggerChildren = 0.08,
  once = true,
  margin = "-10% 0px",
  as = "section",
  className,
  id,
  "aria-label": ariaLabel,
}: SectionRevealProps) => {
  const reduce = useReducedMotion();
  const Tag = motion[as];

  if (reduce) {
    const Plain = as;
    return (
      <Plain className={className} id={id} aria-label={ariaLabel}>
        {children}
      </Plain>
    );
  }

  const variants = buildVariants(from, distance, duration, staggerChildren);

  return (
    <Tag
      id={id}
      aria-label={ariaLabel}
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin }}
      variants={variants}
      transition={{ delay }}
    >
      {children}
    </Tag>
  );
};

export default SectionReveal;
