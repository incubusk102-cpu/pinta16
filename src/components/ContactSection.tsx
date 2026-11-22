import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Mail, Phone, MapPin, type LucideIcon } from "lucide-react";
import gsap from "gsap";
import NewsletterForm from "@/components/NewsletterForm";
import SectionReveal from "@/components/motion/SectionReveal";
import SplitText from "@/components/motion/SplitText";
import { useLocale } from "@/contexts/LocaleContext";
import {
  DEFAULT_SITE_COPY,
  useStorefrontConfig,
} from "@/contexts/StorefrontConfigContext";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type IconPreset = "envelope" | "phone" | "pin";

// Build a GSAP idle timeline tuned for the given icon preset. Each
// timeline repeats forever (`repeat: -1`) and `yoyo` is used where
// the motion is symmetric (envelope bob, pin bob) to avoid having to
// hand-write the reverse half. The phone timeline is asymmetric (a
// ring-shake followed by a long pause), so we author the keyframes
// explicitly via `.to(...)` chained calls.
//
// Timings are deliberately desynchronised across the three icons so
// the row never lands in a stiff "everyone hops on the same beat"
// rhythm — they should feel alive but not choreographed.
const buildTimeline = (target: HTMLElement, preset: IconPreset) => {
  const tl = gsap.timeline({ repeat: -1 });

  if (preset === "envelope") {
    // Letter being plucked off the top of a stack — a small lift and
    // gentle tilt. `yoyo` mirrors the keyframes on the way back so
    // we only have to specify the up-phase.
    tl.to(target, {
      y: -3,
      rotate: -3,
      duration: 1,
      ease: "sine.inOut",
    })
      .to(target, {
        y: -1,
        rotate: 2,
        duration: 1,
        ease: "sine.inOut",
      })
      .to(target, {
        y: 0,
        rotate: 0,
        duration: 1,
        ease: "sine.inOut",
      })
      .to(target, { duration: 1.6 });
    return tl;
  }

  if (preset === "phone") {
    // Periodic ring-shake. The handset rocks off its base
    // (`transformOrigin` set on the element), settles, and then
    // pauses for ~2s before the next ring so it doesn't feel like
    // constant vibration.
    tl.to(target, { rotate: -14, duration: 0.08, ease: "sine.out" })
      .to(target, { rotate: 14, duration: 0.12, ease: "sine.inOut" })
      .to(target, { rotate: -10, duration: 0.12, ease: "sine.inOut" })
      .to(target, { rotate: 10, duration: 0.12, ease: "sine.inOut" })
      .to(target, { rotate: -6, duration: 0.12, ease: "sine.inOut" })
      .to(target, { rotate: 0, duration: 0.16, ease: "sine.out" })
      .to(target, { duration: 2.2 });
    return tl;
  }

  // preset === "pin": hovering map marker. Slow weighted bob with a
  // hair of scale pulse on the down phase to suggest "dropping".
  tl.to(target, {
    y: -6,
    scale: 1,
    duration: 1.1,
    ease: "sine.out",
  })
    .to(target, {
      y: 0,
      scale: 1.04,
      duration: 0.9,
      ease: "sine.in",
    })
    .to(target, { scale: 1, duration: 0.4, ease: "sine.out" });
  return tl;
};

interface AnimatedContactIconProps {
  Icon: LucideIcon;
  preset: IconPreset;
}

// Renders a lucide icon wrapped in a span that GSAP can transform.
// We register/teardown the timeline inside an effect so React strict
// mode double-invoke doesn't leave a dangling tween. The span is
// `inline-flex` so it lays out exactly like the bare icon did before
// (centred via the parent card's `text-center` + `mx-auto mb-3`).
const AnimatedContactIcon = ({ Icon, preset }: AnimatedContactIconProps) => {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      buildTimeline(el, preset);
    }, el);
    return () => {
      ctx.revert();
    };
  }, [preset]);

  return (
    <span
      ref={ref}
      aria-hidden="true"
      className="inline-flex w-6 h-6 mx-auto mb-3 text-muted-foreground will-change-transform"
      style={{
        // Origin nudge so the phone's ring-shake pivots near the
        // base of the handset rather than dead-centre.
        transformOrigin: preset === "phone" ? "50% 90%" : "50% 50%",
      }}
    >
      <Icon className="w-6 h-6" aria-hidden="true" />
    </span>
  );
};

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
        {(
          [
            {
              icon: Mail,
              preset: "envelope",
              label: "Email",
              value: "support@canvhub.com",
            },
            {
              icon: Phone,
              preset: "phone",
              label: "Phone",
              value: "+63 956 468 5351",
            },
            {
              icon: MapPin,
              preset: "pin",
              label: "Studio",
              value: "Bagong Silang, Caloocan",
            },
          ] as const
        ).map(({ icon: Icon, preset, label, value }) => (
          <div
            key={label}
            className="text-center p-5 sm:p-6 bg-card border border-border/10 rounded-sm"
          >
            <AnimatedContactIcon Icon={Icon} preset={preset} />
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
