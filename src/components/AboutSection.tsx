import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import SectionReveal from "@/components/motion/SectionReveal";
import SplitText from "@/components/motion/SplitText";
import { useStorefrontConfig } from "@/contexts/StorefrontConfigContext";

gsap.registerPlugin(ScrollTrigger);

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const AboutSection = () => {
  const { config } = useStorefrontConfig();
  const { eyebrow, title, body } = config.siteCopy.about;
  const underlineRef = useRef<SVGPathElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  // Once the title's SplitText settle finishes, GSAP draws a thin
  // gold rule across its width. Length is computed from the SVG
  // path so the animation works on any viewport.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const path = underlineRef.current;
    const host = hostRef.current;
    if (!path || !host) return;

    const length = path.getTotalLength();
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length}`;

    const ctx = gsap.context(() => {
      gsap.to(path, {
        strokeDashoffset: 0,
        duration: 1.6,
        ease: "power2.out",
        scrollTrigger: {
          trigger: host,
          start: "top 80%",
          toggleActions: "play none none none",
        },
        delay: 0.9,
      });
    }, host);

    return () => {
      ctx.revert();
    };
  }, []);

  return (
    <SectionReveal
      as="section"
      id="about"
      from="bottom"
      distance={60}
      duration={0.95}
      staggerChildren={0.1}
      className="py-16 sm:py-24 md:py-32 px-4 sm:px-6 md:px-12 max-w-4xl mx-auto text-center"
    >
      <motion.p
        variants={{
          hidden: { opacity: 0, y: 24 },
          visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
          },
        }}
        className="font-body text-xs tracking-[0.4em] uppercase text-muted-foreground mb-4"
      >
        {eyebrow}
      </motion.p>
      <div ref={hostRef} className="relative inline-block">
        <SplitText
          as="h2"
          by="word"
          stagger={0.07}
          duration={0.85}
          yFrom={28}
          className="font-display text-3xl md:text-4xl text-gradient-elegant mb-2"
        >
          {title}
        </SplitText>
        {/* GSAP draws the underline path in via strokeDashoffset once
            the section enters the viewport. Two short flanking
            segments + a longer middle rule mimic the editorial
            rule-and-bead motif used by the AnimeDivider component. */}
        <svg
          viewBox="0 0 320 8"
          preserveAspectRatio="none"
          className="mx-auto -mt-1 mb-8 h-2 w-full max-w-[18rem] text-amber-700/70 dark:text-amber-300/60"
          aria-hidden
        >
          <path
            ref={underlineRef}
            d="M 8 4 L 312 4"
            stroke="currentColor"
            strokeWidth={1}
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </div>
      <motion.p
        variants={{
          hidden: { opacity: 0, y: 24 },
          visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.85, ease: [0.16, 1, 0.3, 1] },
          },
        }}
        className="font-body text-sm text-muted-foreground leading-relaxed max-w-2xl mx-auto whitespace-pre-line"
      >
        {body}
      </motion.p>
    </SectionReveal>
  );
};

export default AboutSection;
