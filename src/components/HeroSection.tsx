import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { useStorefrontConfig } from "@/contexts/StorefrontConfigContext";

const FALLBACK_BACKGROUNDS: string[] = [];

const HeroSection = () => {
  const { config } = useStorefrontConfig();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const bgY = useTransform(scrollYProgress, [0, 1], ["0%", "20%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1.05, 1.2]);

  if (!config.hero.enabled) return null;

  const handleCta = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const href = config.hero.ctaHref || "#gallery";
    if (href.startsWith("#")) {
      const target = document.getElementById(href.slice(1));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth" });
      }
    }
  };

  const backgrounds =
    config.hero.backgroundImages.length > 0
      ? config.hero.backgroundImages
      : FALLBACK_BACKGROUNDS;

  return (
    <section id="hero" ref={ref} className="relative h-screen overflow-hidden">
      {backgrounds.map((img, i) => (
        <motion.div
          key={`${img}-${i}`}
          className="absolute inset-0"
          style={{ y: bgY, scale, opacity: i === 0 ? 0.25 : 0.5 }}
        >
          <img src={img} alt="" className="w-full h-full object-cover" />
        </motion.div>
      ))}
      <div className="absolute inset-0 bg-background/70" />
      <motion.div
        className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6"
        style={{ opacity }}
      >
        {config.hero.eyebrow && (
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.3 }}
            className="font-body text-xs tracking-[0.4em] uppercase text-muted-foreground mb-6"
          >
            {config.hero.eyebrow}
          </motion.p>
        )}
        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, delay: 0.5 }}
          className="font-display text-5xl md:text-7xl lg:text-8xl text-gradient-elegant mb-8"
        >
          {config.hero.headline || "Pintaterra"}
        </motion.h1>
        {config.hero.subhead && (
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.7 }}
            className="font-body text-sm text-muted-foreground max-w-md mb-12 leading-relaxed"
          >
            {config.hero.subhead}
          </motion.p>
        )}
        {config.hero.ctaLabel && (
          <motion.a
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1 }}
            href={config.hero.ctaHref || "#gallery"}
            onClick={handleCta}
            className="font-body text-xs tracking-[0.3em] uppercase px-14 py-5 bg-foreground text-background hover:bg-foreground/90 transition-all duration-700 rounded-none"
          >
            {config.hero.ctaLabel}
          </motion.a>
        )}
      </motion.div>
    </section>
  );
};

export default HeroSection;
