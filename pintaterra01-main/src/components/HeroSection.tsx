import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import mockup1 from "@/assets/p2.jpg";
import mockup2 from "@/assets/p6.jpg";
import mockup3 from "@/assets/p8.jpg";

const HeroSection = () => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const bgY = useTransform(scrollYProgress, [0, 1], ["0%", "20%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1.05, 1.2]);

  return (
    <section id="hero" ref={ref} className="relative h-screen overflow-hidden">
      {[mockup1, mockup2, mockup3].map((img, i) => (
        <motion.div key={i} className="absolute inset-0" style={{ y: bgY, scale, opacity: i === 0 ? 0.25 : 0 }}>
          <img src={img} alt="" className="w-full h-full object-cover" />
        </motion.div>
      ))}
      <div className="absolute inset-0 bg-background/70" />
      <motion.div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6" style={{ opacity }}>
        <motion.p initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.3 }} className="font-body text-xs tracking-[0.4em] uppercase text-muted-foreground mb-6">
          Affordable Art, Authentic Stories
        </motion.p>
        <motion.h1 initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.2, delay: 0.5 }} className="font-display text-5xl md:text-7xl lg:text-8xl text-gradient-elegant mb-8">
          Pintaterra
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.7 }} className="font-body text-sm text-muted-foreground max-w-md mb-12 leading-relaxed">
          Discover hand-crafted paintings that transform spaces. Each piece tells a story, crafted with passion and precision.
        </motion.p>
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1 }}
          onClick={() => document.getElementById("gallery")?.scrollIntoView({ behavior: "smooth" })}
          className="font-body text-xs tracking-[0.3em] uppercase px-14 py-5 bg-foreground text-background hover:bg-foreground/90 transition-all duration-700 rounded-none"
        >
          View Collection
        </motion.button>
      </motion.div>
    </section>
  );
};

export default HeroSection;
