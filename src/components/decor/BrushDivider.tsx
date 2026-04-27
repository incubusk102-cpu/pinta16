import { motion } from "framer-motion";

interface BrushDividerProps {
  className?: string;
  /** Stroke colour. Defaults to currentColor so it inherits theme. */
  stroke?: string;
  /** Animation delay in seconds. */
  delay?: number;
}

/**
 * Hand-drawn ink-stroke divider. The path is "drawn" with strokeDashoffset
 * once it scrolls into view, giving each section seam a calligraphic feel
 * that matches the gallery's painterly tone.
 */
const BrushDivider = ({
  className = "",
  stroke = "currentColor",
  delay = 0,
}: BrushDividerProps) => (
  <motion.svg
    viewBox="0 0 600 24"
    aria-hidden
    className={`pointer-events-none w-full max-w-[600px] h-6 mx-auto opacity-60 ${className}`}
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, margin: "-80px" }}
  >
    <motion.path
      d="M4 14 C 80 4, 200 22, 300 12 S 520 4, 596 12"
      fill="none"
      stroke={stroke}
      strokeWidth={2}
      strokeLinecap="round"
      variants={{
        hidden: { pathLength: 0, opacity: 0 },
        visible: {
          pathLength: 1,
          opacity: 1,
          transition: {
            pathLength: { duration: 1.6, ease: [0.4, 0, 0.2, 1], delay },
            opacity: { duration: 0.4, delay },
          },
        },
      }}
    />
    <motion.circle
      cx={596}
      cy={12}
      r={3}
      fill={stroke}
      variants={{
        hidden: { opacity: 0, scale: 0 },
        visible: {
          opacity: 0.8,
          scale: 1,
          transition: { delay: delay + 1.4, duration: 0.4 },
        },
      }}
    />
  </motion.svg>
);

export default BrushDivider;
