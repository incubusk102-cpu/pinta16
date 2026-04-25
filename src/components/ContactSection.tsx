import { motion } from "framer-motion";
import { Mail, Phone, MapPin } from "lucide-react";

const ContactSection = () => {
  return (
    <section
      id="contact"
      className="py-24 md:py-32 px-6 md:px-12 max-w-4xl mx-auto"
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="text-center mb-12"
      >
        <p className="font-body text-xs tracking-[0.4em] uppercase text-muted-foreground mb-4">
          Get in Touch
        </p>
        <h2 className="font-display text-3xl md:text-4xl text-gradient-elegant">
          Contact Us
        </h2>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="grid md:grid-cols-3 gap-8"
      >
        {[
          { icon: Mail, label: "Email", value: "pintaterra@gmail.com" },
          { icon: Phone, label: "Phone", value: "+63 956 468 5351" },
          { icon: MapPin, label: "Studio", value: "Bagong Silang, Caloocan" },
        ].map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="text-center p-6 bg-card border border-border/10 rounded-sm"
          >
            <Icon className="w-6 h-6 mx-auto mb-3 text-muted-foreground" />
            <p className="font-body text-xs tracking-wider uppercase text-muted-foreground mb-1">
              {label}
            </p>
            <p className="font-body text-sm text-foreground">{value}</p>
          </div>
        ))}
      </motion.div>
    </section>
  );
};

export default ContactSection;
