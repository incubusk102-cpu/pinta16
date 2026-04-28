import { motion } from "framer-motion";

const AboutSection = () => {
  return (
    <section
      id="about"
      className="py-16 sm:py-24 md:py-32 px-4 sm:px-6 md:px-12 max-w-4xl mx-auto text-center"
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
      >
        <p className="font-body text-xs tracking-[0.4em] uppercase text-muted-foreground mb-4">
          Our Story
        </p>
        <h2 className="font-display text-3xl md:text-4xl text-gradient-elegant mb-8">
          About Canvas Hub
        </h2>
        <p className="font-body text-sm text-muted-foreground leading-relaxed max-w-2xl mx-auto">
          Every painting has a soul — a story waiting to be told. We bring
          affordable, hand-crafted art to homes and spaces that deserve beauty.
          Each piece is made to order, ensuring that what you receive is as
          unique as your vision.
        </p>
      </motion.div>
    </section>
  );
};

export default AboutSection;
