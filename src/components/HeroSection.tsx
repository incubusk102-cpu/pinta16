import { motion, useScroll, useTransform } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useRef } from "react";
import BrushDivider from "@/components/decor/BrushDivider";
import MagneticButton from "@/components/MagneticButton";

const HeroSection = () => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  // Subtle parallax: text rises ~80 px slower than the page as you
  // scroll past the hero, creating depth like apple.com hero
  // headlines.
  const textY = useTransform(scrollYProgress, [0, 1], [0, -80]);

  return (
    <section id="hero" ref={ref} className="relative h-screen overflow-hidden">
      <div className="absolute inset-0 bg-background/70" />
      <motion.div
        className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6"
        style={{ opacity, y: textY }}
      >
        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.3 }}
          className="font-body text-[10px] sm:text-xs tracking-[0.25em] sm:tracking-[0.4em] uppercase text-muted-foreground mb-4 sm:mb-6"
        >
          Affordable Art, Authentic Stories
        </motion.p>
        {/* Loader-style spinner — copied verbatim from the admin auth-
            context's loading state at the top of `AdminPage`:
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            Same lucide glyph, same Tailwind classes, so the hero's
            "loading C" matches admin's loading C exactly. Wrapped in
            a motion.div so the entrance fades in alongside the
            eyebrow + body + button choreography rather than popping
            in instantly. */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.35 }}
          className="mb-4 md:mb-6"
          role="status"
          aria-label="Loading"
        >
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </motion.div>
        <BrushDivider className="mb-4 md:mb-6 text-foreground/70" delay={0.9} />
        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.7 }}
          className="font-body text-sm text-muted-foreground max-w-md mb-8 sm:mb-12 leading-relaxed"
        >
          Discover hand-crafted paintings that transform spaces. Each piece
          tells a story, crafted with passion and precision.
        </motion.p>
        <MagneticButton
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1 }}
          onClick={() =>
            document
              .getElementById("gallery")
              ?.scrollIntoView({ behavior: "smooth" })
          }
          className="font-body text-[11px] sm:text-xs tracking-[0.25em] sm:tracking-[0.3em] uppercase px-10 sm:px-14 py-4 sm:py-5 bg-foreground text-background hover:bg-foreground/90 transition-colors duration-700 rounded-none"
        >
          View Collection
        </MagneticButton>
      </motion.div>
    </section>
  );
};

export default HeroSection;
