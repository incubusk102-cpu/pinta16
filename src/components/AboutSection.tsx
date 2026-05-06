import { motion } from "framer-motion";
import SectionReveal from "@/components/motion/SectionReveal";
import SplitText from "@/components/motion/SplitText";
import { useStorefrontConfig } from "@/contexts/StorefrontConfigContext";

const AboutSection = () => {
  const { config } = useStorefrontConfig();
  const { eyebrow, title, body } = config.siteCopy.about;
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
      <SplitText
        as="h2"
        by="word"
        stagger={0.07}
        duration={0.85}
        yFrom={28}
        className="font-display text-3xl md:text-4xl text-gradient-elegant mb-8"
      >
        {title}
      </SplitText>
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
