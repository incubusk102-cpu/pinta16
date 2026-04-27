import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const AuthenticityCallout = () => {
  const ref = useRef<HTMLElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "-20% 0px" });

  return (
    <section
      ref={ref}
      aria-label="Certificate of Authenticity"
      className="px-4 sm:px-6 md:px-12 max-w-5xl mx-auto py-12 sm:py-16"
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
        className="relative rounded-2xl border border-border/40 bg-card/60 backdrop-blur-sm px-6 sm:px-10 py-8 sm:py-12 grid md:grid-cols-[auto,1fr] gap-6 md:gap-10 items-center"
      >
        {/* Wax-style seal */}
        <div className="mx-auto md:mx-0">
          <svg
            viewBox="0 0 120 120"
            className="w-24 h-24 sm:w-28 sm:h-28 text-foreground"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden
          >
            <defs>
              <radialGradient id="seal-grad" cx="50%" cy="40%" r="60%">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
                <stop
                  offset="60%"
                  stopColor="currentColor"
                  stopOpacity="0.06"
                />
                <stop
                  offset="100%"
                  stopColor="currentColor"
                  stopOpacity="0.0"
                />
              </radialGradient>
            </defs>
            {/* Outer ring */}
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.55"
              strokeWidth="0.6"
            />
            <circle
              cx="60"
              cy="60"
              r="48"
              fill="url(#seal-grad)"
              stroke="currentColor"
              strokeOpacity="0.35"
              strokeWidth="0.4"
            />
            {/* Star points */}
            <g stroke="currentColor" strokeOpacity="0.45" strokeWidth="0.5">
              {Array.from({ length: 12 }).map((_, i) => {
                const a = (i / 12) * Math.PI * 2;
                return (
                  <line
                    key={i}
                    x1={60 + Math.cos(a) * 42}
                    y1={60 + Math.sin(a) * 42}
                    x2={60 + Math.cos(a) * 50}
                    y2={60 + Math.sin(a) * 50}
                  />
                );
              })}
            </g>
            <text
              x="60"
              y="58"
              textAnchor="middle"
              fontFamily="Georgia, 'Playfair Display', serif"
              fontSize="36"
              fontStyle="italic"
              fill="currentColor"
            >
              P
            </text>
            <text
              x="60"
              y="78"
              textAnchor="middle"
              fontFamily="Inter, sans-serif"
              fontSize="6"
              letterSpacing="3"
              fill="currentColor"
              fillOpacity="0.85"
            >
              CERTIFIED
            </text>
          </svg>
        </div>

        <div className="text-center md:text-left">
          <p className="font-body text-[11px] tracking-[0.3em] uppercase text-muted-foreground mb-2">
            Every piece
          </p>
          <h3 className="font-display text-2xl sm:text-3xl text-foreground mb-3 tracking-tight">
            Signed, numbered &amp; certified original.
          </h3>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-xl">
            Every painting we ship comes with a hand-signed Certificate of
            Authenticity recording the title, medium, dimensions, year, and a
            unique edition number. Each canvas is also signed by the artist on
            the reverse — guaranteeing it's a one-of-one original, never a
            reproduction.
          </p>
        </div>
      </motion.div>
    </section>
  );
};

export default AuthenticityCallout;
