import { motion } from "framer-motion";
import { Mail, Phone, MapPin } from "lucide-react";
import NewsletterForm from "@/components/NewsletterForm";
import { useLocale } from "@/contexts/LocaleContext";

const ContactSection = () => {
  const { t } = useLocale();
  return (
    <section
      id="contact"
      className="py-16 sm:py-24 md:py-32 px-4 sm:px-6 md:px-12 max-w-4xl mx-auto"
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="text-center mb-12"
      >
        <p className="font-body text-xs tracking-[0.4em] uppercase text-muted-foreground mb-4">
          {t("contact.title")}
        </p>
        <h2 className="font-display text-3xl md:text-4xl text-gradient-elegant">
          {t("contact.heading")}
        </h2>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 md:gap-8"
      >
        {[
          { icon: Mail, label: "Email", value: "pintaterra@gmail.com" },
          { icon: Phone, label: "Phone", value: "+63 956 468 5351" },
          { icon: MapPin, label: "Studio", value: "Bagong Silang, Caloocan" },
        ].map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="text-center p-5 sm:p-6 bg-card border border-border/10 rounded-sm"
          >
            <Icon className="w-6 h-6 mx-auto mb-3 text-muted-foreground" />
            <p className="font-body text-xs tracking-wider uppercase text-muted-foreground mb-1">
              {label}
            </p>
            <p className="font-body text-sm text-foreground">{value}</p>
          </div>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="mt-16 md:mt-24 border-t border-border/30 pt-12 flex flex-col items-center text-center"
      >
        <p className="font-body text-xs tracking-[0.4em] uppercase text-muted-foreground mb-3">
          {t("newsletter.title")}
        </p>
        <h3 className="font-display text-2xl md:text-3xl text-foreground mb-4 max-w-md">
          {t("newsletter.subtitle")}
        </h3>
        <NewsletterForm source="footer" />
      </motion.div>
    </section>
  );
};

export default ContactSection;
