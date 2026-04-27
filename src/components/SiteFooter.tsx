import type { ReactElement } from "react";
import { Link } from "@tanstack/react-router";
import { Facebook, Instagram, Mail, MapPin, Phone } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import {
  POLICY_SLUGS,
  type PolicySlug,
  usePolicies,
} from "@/contexts/PoliciesContext";

const SLUG_LABEL_KEYS: Record<
  PolicySlug,
  "footer.terms" | "footer.refund" | "footer.shipping" | "footer.privacy"
> = {
  terms: "footer.terms",
  refund: "footer.refund",
  shipping: "footer.shipping",
  privacy: "footer.privacy",
};

const PAYMENT_METHODS: { name: string; svg: ReactElement }[] = [
  {
    name: "GCash",
    svg: (
      <text
        x="50%"
        y="64%"
        textAnchor="middle"
        fontFamily="Inter, sans-serif"
        fontWeight="700"
        fontSize="14"
        fill="currentColor"
      >
        GCash
      </text>
    ),
  },
  {
    name: "Maya",
    svg: (
      <text
        x="50%"
        y="64%"
        textAnchor="middle"
        fontFamily="Inter, sans-serif"
        fontWeight="700"
        fontSize="14"
        fill="currentColor"
      >
        Maya
      </text>
    ),
  },
  {
    name: "BPI",
    svg: (
      <text
        x="50%"
        y="64%"
        textAnchor="middle"
        fontFamily="Inter, sans-serif"
        fontWeight="700"
        fontSize="14"
        fill="currentColor"
      >
        BPI
      </text>
    ),
  },
  {
    name: "BDO",
    svg: (
      <text
        x="50%"
        y="64%"
        textAnchor="middle"
        fontFamily="Inter, sans-serif"
        fontWeight="700"
        fontSize="14"
        fill="currentColor"
      >
        BDO
      </text>
    ),
  },
  {
    name: "Visa",
    svg: (
      <text
        x="50%"
        y="64%"
        textAnchor="middle"
        fontFamily="Inter, sans-serif"
        fontWeight="700"
        fontSize="14"
        fontStyle="italic"
        fill="currentColor"
      >
        VISA
      </text>
    ),
  },
  {
    name: "Mastercard",
    svg: (
      <g>
        <circle cx="22" cy="20" r="10" fill="currentColor" opacity="0.85" />
        <circle cx="38" cy="20" r="10" fill="currentColor" opacity="0.5" />
      </g>
    ),
  },
];

const PaymentBadge = ({
  name,
  children,
}: {
  name: string;
  children: ReactElement;
}) => (
  <span
    aria-label={name}
    title={name}
    className="inline-flex items-center justify-center h-8 w-14 rounded border border-border/40 bg-card/60 text-foreground/80"
  >
    <svg viewBox="0 0 60 40" className="w-12 h-7">
      {children}
    </svg>
  </span>
);

const SiteFooter = () => {
  const { t } = useLocale();
  const { policies } = usePolicies();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/30 mt-16 sm:mt-24 px-4 sm:px-6 md:px-12 py-10 sm:py-14 bg-card/30">
      <div className="max-w-6xl mx-auto grid gap-10 sm:gap-12 sm:grid-cols-2 md:grid-cols-4 text-sm">
        {/* Brand + tagline */}
        <div className="md:col-span-2">
          <div className="flex items-center gap-3 mb-4">
            <span
              aria-hidden
              className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-foreground text-background"
            >
              <svg viewBox="0 0 40 40" className="w-5 h-5">
                <text
                  x="20"
                  y="26"
                  textAnchor="middle"
                  fontFamily="Georgia, 'Playfair Display', serif"
                  fontSize="26"
                  fontStyle="italic"
                  fill="currentColor"
                >
                  P
                </text>
                <rect
                  x="6"
                  y="30"
                  width="28"
                  height="1.5"
                  fill="currentColor"
                />
              </svg>
            </span>
            <p className="font-display text-lg tracking-[0.25em] uppercase text-gradient-elegant">
              Pintaterra
            </p>
          </div>
          <p className="text-muted-foreground leading-relaxed max-w-md">
            Hand-crafted oil and acrylic paintings from independent Filipino
            artists. Every piece is one of one — never reproduced, signed and
            shipped with a Certificate of Authenticity.
          </p>

          {/* Socials */}
          <div className="mt-5 flex items-center gap-3">
            <a
              href="https://www.facebook.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Pintaterra on Facebook"
              className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-border/40 text-foreground/80 hover:text-foreground hover:border-foreground/60 transition-colors"
            >
              <Facebook className="w-4 h-4" />
            </a>
            <a
              href="https://www.instagram.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Pintaterra on Instagram"
              className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-border/40 text-foreground/80 hover:text-foreground hover:border-foreground/60 transition-colors"
            >
              <Instagram className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Policies */}
        <nav aria-label={t("footer.policies")}>
          <p className="font-body text-xs tracking-[0.3em] uppercase text-muted-foreground mb-3">
            {t("footer.policies")}
          </p>
          <ul className="space-y-2">
            {POLICY_SLUGS.map((slug) => (
              <li key={slug}>
                <Link
                  to="/policy/$slug"
                  params={{ slug }}
                  className="text-foreground/80 hover:text-foreground transition-colors"
                >
                  {policies[slug]?.title || t(SLUG_LABEL_KEYS[slug])}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Contact */}
        <div>
          <p className="font-body text-xs tracking-[0.3em] uppercase text-muted-foreground mb-3">
            {t("contact.heading")}
          </p>
          <ul className="space-y-2 text-foreground/80">
            <li>
              <a
                href="mailto:pintaterra@gmail.com"
                className="inline-flex items-center gap-2 hover:text-foreground transition-colors"
              >
                <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                pintaterra@gmail.com
              </a>
            </li>
            <li>
              <a
                href="tel:+639564685351"
                className="inline-flex items-center gap-2 hover:text-foreground transition-colors"
              >
                <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                +63 956 468 5351
              </a>
            </li>
            <li className="text-muted-foreground inline-flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5" />
              Bagong Silang, Caloocan
            </li>
          </ul>
        </div>
      </div>

      {/* Payment methods */}
      <div className="max-w-6xl mx-auto mt-10 pt-6 border-t border-border/20">
        <p className="font-body text-[11px] tracking-[0.3em] uppercase text-muted-foreground mb-3 text-center sm:text-left">
          We accept
        </p>
        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
          {PAYMENT_METHODS.map((m) => (
            <PaymentBadge key={m.name} name={m.name}>
              {m.svg}
            </PaymentBadge>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto mt-8 pt-5 border-t border-border/20 text-xs text-muted-foreground flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>{t("footer.copyright").replace("{year}", String(year))}</span>
        <span className="text-muted-foreground/80">
          Hand-crafted in the Philippines.
        </span>
      </div>
    </footer>
  );
};

export default SiteFooter;
