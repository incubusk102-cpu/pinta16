import { motion } from "framer-motion";
import { Mail, Phone, MapPin } from "lucide-react";
import NewsletterForm from "@/components/NewsletterForm";
import SectionReveal from "@/components/motion/SectionReveal";
import SplitText from "@/components/motion/SplitText";
import { useLocale } from "@/contexts/LocaleContext";
import {
  DEFAULT_SITE_COPY,
  useStorefrontConfig,
} from "@/contexts/StorefrontConfigContext";

const ContactSection = () => {
  const { t } = useLocale();
  const { config } = useStorefrontConfig();
  const contactCopy = config.siteCopy.contact;
  const newsletterCopy = config.siteCopy.newsletter;
  // Preserve i18n for Contact when the admin hasn't customised the copy.
  // The other sections were already English-only before this PR; Contact
  // was the only one wired to the locale-aware translations, so we fall
  // back to t() while the saved values still match the English defaults.
  const eyebrowText =
    contactCopy.eyebrow === DEFAULT_SITE_COPY.contact.eyebrow
      ? t("contact.title")
      : contactCopy.eyebrow;
  const titleText =
    contactCopy.title === DEFAULT_SITE_COPY.contact.title
      ? t("contact.heading")
      : contactCopy.title;
  // Same fallback shape for the newsletter strap — when the admin still
  // has the default English copy saved, render the locale-aware string
  // so Tagalog visitors keep the translated version. Once the admin
  // customises either field, that override wins across locales.
  const newsletterEyebrow =
    newsletterCopy.eyebrow === DEFAULT_SITE_COPY.newsletter.eyebrow
      ? t("newsletter.title")
      : newsletterCopy.eyebrow;
  const newsletterTitle =
    newsletterCopy.title === DEFAULT_SITE_COPY.newsletter.title
      ? t("newsletter.subtitle")
      : newsletterCopy.title;
  return (
    <SectionReveal
      as="section"
      id="contact"
      from="bottom"
      distance={50}
      duration={0.95}
      staggerChildren={0.12}
      className="py-16 sm:py-24 md:py-32 px-4 sm:px-6 md:px-12 max-w-4xl mx-auto"
    >
      <motion.div
        variants={{
          hidden: { opacity: 0, y: 24 },
          visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] },
          },
        }}
        className="text-center mb-12"
      >
        <p className="font-body text-xs tracking-[0.4em] uppercase text-muted-foreground mb-4">
          {eyebrowText}
        </p>
        <SplitText
          as="h2"
          by="word"
          stagger={0.07}
          duration={0.85}
          yFrom={28}
          className="font-display text-3xl md:text-4xl text-gradient-elegant"
        >
          {titleText}
        </SplitText>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 md:gap-8"
      >
        {[
          { icon: Mail, label: "Email", value: "support@canvhub.com" },
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
          {newsletterEyebrow}
        </p>
        <h3 className="font-display text-2xl md:text-3xl text-foreground mb-4 max-w-md">
          {newsletterTitle}
        </h3>
        <NewsletterForm source="footer" />
      </motion.div>
    </SectionReveal>
  );
};

export default ContactSection;
