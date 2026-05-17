import { Link } from "@tanstack/react-router";
import {
  Facebook,
  Instagram,
  Mail,
  MapPin,
  Package,
  Phone,
} from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import {
  POLICY_SLUGS,
  type PolicySlug,
  usePolicies,
} from "@/contexts/PoliciesContext";

// Set these to your actual Canvas Hub profile URLs to render the social
// links. Left empty so we don't ship misleading aria-labels that point at
// generic facebook.com / instagram.com homepages.
const FACEBOOK_URL = "https://www.facebook.com/canvashubph";
const INSTAGRAM_URL = "https://www.instagram.com/canvashubph";
const TIKTOK_URL = "https://www.tiktok.com/@canvashubph";

const SLUG_LABEL_KEYS: Record<
  PolicySlug,
  "footer.terms" | "footer.refund" | "footer.shipping" | "footer.privacy"
> = {
  terms: "footer.terms",
  refund: "footer.refund",
  shipping: "footer.shipping",
  privacy: "footer.privacy",
};

const QrPhBadge = () => (
  <span
    aria-label="QR Ph"
    title="QR Ph"
    className="inline-flex items-center justify-center h-8 px-3 rounded border border-border/40 bg-card/60 text-foreground/80"
  >
    <svg viewBox="0 0 80 40" className="w-16 h-7">
      <text
        x="50%"
        y="64%"
        textAnchor="middle"
        fontFamily="Inter, sans-serif"
        fontWeight="700"
        fontSize="14"
        fill="currentColor"
      >
        QR Ph
      </text>
    </svg>
  </span>
);

const SiteFooter = () => {
  const { t } = useLocale();
  const { policies } = usePolicies();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/30 mt-16 sm:mt-24 px-4 sm:px-6 md:px-12 py-10 sm:py-14 bg-card/30">
      <div className="max-w-6xl mx-auto grid gap-10 sm:gap-12 sm:grid-cols-3 text-sm">
        {/* Socials — only render when a real profile URL is configured.
              Brand wordmark moved out: 'Canvas Hub' now lives only on the
              homepage hero (and meta tab titles), not in the footer of
              every page. */}
        {(FACEBOOK_URL || INSTAGRAM_URL || TIKTOK_URL) && (
          <div className="sm:col-span-3 flex items-center gap-3">
            {FACEBOOK_URL && (
              <a
                href={FACEBOOK_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-border/40 text-foreground/80 hover:text-foreground hover:border-foreground/60 transition-colors"
              >
                <Facebook className="w-4 h-4" />
              </a>
            )}
            {INSTAGRAM_URL && (
              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-border/40 text-foreground/80 hover:text-foreground hover:border-foreground/60 transition-colors"
              >
                <Instagram className="w-4 h-4" />
              </a>
            )}
            {TIKTOK_URL && (
              <a
                href={TIKTOK_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="TikTok"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-border/40 text-foreground/80 hover:text-foreground hover:border-foreground/60 transition-colors"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-4 h-4"
                  aria-hidden="true"
                >
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.73a8.19 8.19 0 0 0 4.76 1.52v-3.4a4.85 4.85 0 0 1-1-.16Z" />
                </svg>
              </a>
            )}
          </div>
        )}

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

        {/* Help — discoverable entry point for guests who checked out
              without an account and need to look up their order again
              later. The /track page accepts an ORD-XXXX number and
              hits the same public lookup endpoint as the signed-in
              tracker. */}
        <nav aria-label={t("footer.help")}>
          <p className="font-body text-xs tracking-[0.3em] uppercase text-muted-foreground mb-3">
            {t("footer.help")}
          </p>
          <ul className="space-y-2">
            <li>
              <Link
                to="/collection"
                className="inline-flex items-center gap-2 text-foreground/80 hover:text-foreground transition-colors"
              >
                Shop the Collection
              </Link>
            </li>
            <li>
              <Link
                to="/about"
                className="inline-flex items-center gap-2 text-foreground/80 hover:text-foreground transition-colors"
              >
                About
              </Link>
            </li>
            <li>
              <Link
                to="/contact"
                className="inline-flex items-center gap-2 text-foreground/80 hover:text-foreground transition-colors"
              >
                Contact
              </Link>
            </li>
            <li>
              <Link
                to="/resources"
                className="inline-flex items-center gap-2 text-foreground/80 hover:text-foreground transition-colors"
              >
                Resources
              </Link>
            </li>
            <li>
              <Link
                to="/track"
                className="inline-flex items-center gap-2 text-foreground/80 hover:text-foreground transition-colors"
              >
                <Package className="w-3.5 h-3.5 text-muted-foreground" />
                {t("footer.trackOrder")}
              </Link>
            </li>
            <li>
              <a
                href="mailto:support@canvhub.com"
                className="inline-flex items-center gap-2 text-foreground/80 hover:text-foreground transition-colors"
              >
                <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                {t("footer.contactSupport")}
              </a>
            </li>
            <li>
              <a
                href="/sitemap.xml"
                className="text-foreground/80 hover:text-foreground transition-colors"
              >
                Sitemap
              </a>
            </li>
          </ul>
        </nav>

        {/* Contact */}
        <address className="not-italic">
          <p className="font-body text-xs tracking-[0.3em] uppercase text-muted-foreground mb-3">
            {t("contact.heading")}
          </p>
          <ul className="space-y-2 text-foreground/80">
            <li>
              <a
                href="mailto:support@canvhub.com"
                className="inline-flex items-center gap-2 hover:text-foreground transition-colors"
              >
                <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                support@canvhub.com
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
            <li>
              <a
                href="https://maps.google.com/?q=Bagong+Silang,+Caloocan,+Philippines"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <MapPin className="w-3.5 h-3.5" />
                Bagong Silang, Caloocan
              </a>
            </li>
          </ul>
        </address>
      </div>

      {/* Payment methods */}
      <div className="max-w-6xl mx-auto mt-10 pt-6 border-t border-border/20">
        <p className="font-body text-[11px] tracking-[0.3em] uppercase text-muted-foreground mb-3 text-center sm:text-left">
          {t("footer.weAccept")}
        </p>
        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
          <QrPhBadge />
        </div>
      </div>

      <div className="max-w-6xl mx-auto mt-8 pt-5 border-t border-border/20 text-xs text-muted-foreground flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>{t("footer.copyright").replace("{year}", String(year))}</span>
        <span className="text-muted-foreground/80">{t("footer.tagline")}</span>
      </div>
    </footer>
  );
};

export default SiteFooter;
