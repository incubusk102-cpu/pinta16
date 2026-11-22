import { useMemo } from "react";
import { useReducedMotion } from "framer-motion";

// Animated section divider used between editorial blocks on the
// homepage. A thin gold hairline with a moving highlight bead and a
// handful of drifting particles. Pure CSS — the only React state is a
// memoised list of particle positions so each instance gets a unique
// drift pattern instead of identical phases.
interface SectionDividerProps {
  particleCount?: number;
  className?: string;
}

const SectionDivider = ({
  particleCount = 5,
  className = "",
}: SectionDividerProps) => {
  const reduceMotion = useReducedMotion();
  const particles = useMemo(() => {
    if (reduceMotion) return [];
    return Array.from({ length: particleCount }).map((_, i) => {
      const seed = (i + 1) / (particleCount + 1);
      return {
        top: 30 + Math.round(seed * 40) + (i % 2 === 0 ? -6 : 6),
        left: Math.round(seed * 92) + 4,
        duration: 7 + ((i * 1.7) % 4),
        delay: (i * 0.9) % 4,
      };
    });
  }, [particleCount, reduceMotion]);

  return (
    <div aria-hidden="true" className={`section-divider ${className}`.trim()}>
      <div className="section-divider-line" />
      {!reduceMotion && <div className="section-divider-bead" />}
      {particles.map((p, i) => (
        <span
          key={i}
          className="section-divider-particle"
          style={{
            top: `${p.top}%`,
            left: `${p.left}%`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
};

export default SectionDivider;
