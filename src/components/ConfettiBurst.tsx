import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";

// Decorative confetti burst played on the checkout-success state.
// Pure DOM (no canvas, no new dependency) — ~36 little squares that
// fly outward from a single anchor point with a subtle rotation and
// then fade out. The whole thing self-destructs after ~1.6 s so it
// never lingers behind the order details. Silent under
// `prefers-reduced-motion`.

interface ConfettiBurstProps {
  count?: number;
  /**
   * Anchor x/y as percentages of the parent. Defaults to the centre
   * of the parent (50 / 30) so the burst rains from above the success
   * tick. Pass {x: 50, y: 50} if you mount it inside a centred block.
   */
  originX?: number;
  originY?: number;
  className?: string;
}

const COLORS = [
  "#c9a25f", // brand gold
  "#f5f3ee", // canvas
  "#4dd0e1", // teal
  "#b388ff", // violet
  "#f87171", // wishlist red
];

// Tiny LCG so useMemo stays pure (react-hooks/purity). Same seed →
// same confetti layout, but it varies between modal opens because
// the seed is just `count + originY` and re-uses Math's bit-mix.
function lcgFactory(seed: number) {
  let state = (seed * 9301 + 49297) % 233280;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

const ConfettiBurst = ({
  count = 36,
  originX = 50,
  originY = 30,
  className = "",
}: ConfettiBurstProps) => {
  const reduce = useReducedMotion();
  const pieces = useMemo(() => {
    if (reduce) return [];
    const rand = lcgFactory(count * 1000 + originY);
    return Array.from({ length: count }).map((_, i) => {
      const angle = (i / count) * Math.PI * 2 + rand() * 0.4;
      const distance = 120 + rand() * 160;
      return {
        id: i,
        color: COLORS[i % COLORS.length],
        // Final x/y offset (px) relative to the origin point.
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance - 40, // bias upward
        rotate: (rand() - 0.5) * 720,
        duration: 1.1 + rand() * 0.6,
        delay: rand() * 0.08,
        size: 6 + rand() * 4,
      };
    });
  }, [count, originY, reduce]);

  if (reduce) return null;

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`.trim()}
    >
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          initial={{
            x: 0,
            y: 0,
            rotate: 0,
            opacity: 1,
          }}
          animate={{
            x: p.x,
            y: p.y,
            rotate: p.rotate,
            opacity: [1, 1, 0],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: [0.22, 1, 0.36, 1],
            times: [0, 0.75, 1],
          }}
          className="absolute"
          style={{
            top: `${originY}%`,
            left: `${originX}%`,
            width: `${p.size}px`,
            height: `${p.size * 0.4}px`,
            background: p.color,
            borderRadius: "1px",
            translateX: "-50%",
            translateY: "-50%",
            boxShadow: `0 0 6px ${p.color}55`,
          }}
        />
      ))}
    </div>
  );
};

export default ConfettiBurst;
