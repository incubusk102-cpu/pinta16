import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";

interface Stat {
  label: string;
  value: number;
  suffix?: string;
}

const stats: Stat[] = [
  { label: "Original paintings", value: 240, suffix: "+" },
  { label: "Years painting", value: 12 },
  { label: "Collectors served", value: 180, suffix: "+" },
  { label: "Provinces shipped", value: 38 },
];

interface CountUpProps {
  to: number;
  start: boolean;
  duration?: number;
}

const CountUp = ({ to, start, duration = 1200 }: CountUpProps) => {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!start) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(eased * to));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [start, to, duration]);
  return <>{n.toLocaleString()}</>;
};

const StatsStrip = () => {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "-20% 0px" });

  return (
    <section
      ref={ref}
      aria-label="Studio at a glance"
      className="px-4 sm:px-6 md:px-12 max-w-6xl mx-auto py-12 sm:py-16"
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
        className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10 text-center"
      >
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col items-center gap-2">
            <p className="font-display text-3xl sm:text-4xl md:text-5xl text-gradient-elegant tracking-tight">
              <CountUp to={s.value} start={inView} />
              {s.suffix}
            </p>
            <p className="font-body text-[10px] sm:text-xs tracking-[0.25em] uppercase text-muted-foreground">
              {s.label}
            </p>
          </div>
        ))}
      </motion.div>
    </section>
  );
};

export default StatsStrip;
