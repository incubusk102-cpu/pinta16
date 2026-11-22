import { Link } from "@tanstack/react-router";
import { Mail, MapPin, Package, Phone } from "lucide-react";

// Brand glyphs are inline SVGs rather than `lucide-react` icons because
// `lucide-react@^1` dropped all brand-trademarked icons (Instagram,
// TikTok, Pinterest, …). Matches the existing TikTok glyph pattern.
const InstagramGlyph = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-4 h-4"
    aria-hidden="true"
  >
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);
import { useLocale } from "@/contexts/LocaleContext";
import {
  POLICY_SLUGS,
  type PolicySlug,
  usePolicies,
} from "@/contexts/PoliciesContext";

// Set these to your actual Canvas Hub profile URLs to render the social
// links. Left empty so we don't ship misleading aria-labels that point at
// generic instagram.com / tiktok.com / pinterest.com homepages.
const INSTAGRAM_URL = "https://www.instagram.com/canvashubph";
const TIKTOK_URL = "https://www.tiktok.com/@canvas9656";
const PINTEREST_URL = "https://www.pinterest.com/canvashub2026";

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
        {(INSTAGRAM_URL || TIKTOK_URL || PINTEREST_URL) && (
          <div className="sm:col-span-3 flex items-center gap-3">
            {INSTAGRAM_URL && (
              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-border/40 text-foreground/80 hover:text-foreground hover:border-foreground/60 transition-colors"
              >
                <InstagramGlyph />
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
            {PINTEREST_URL && (
              <a
                href={PINTEREST_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Pinterest"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-border/40 text-foreground/80 hover:text-foreground hover:border-foreground/60 transition-colors"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-4 h-4"
                  aria-hidden="true"
                >
                  <path d="M12 2C6.48 2 2 6.48 2 12c0 4.24 2.65 7.86 6.39 9.31-.09-.79-.17-2 .04-2.86.19-.78 1.22-4.97 1.22-4.97s-.31-.62-.31-1.54c0-1.44.83-2.51 1.87-2.51.88 0 1.31.66 1.31 1.46 0 .89-.57 2.22-.86 3.46-.25 1.03.52 1.88 1.54 1.88 1.85 0 3.27-1.95 3.27-4.77 0-2.49-1.79-4.24-4.35-4.24-2.96 0-4.7 2.22-4.7 4.52 0 .9.34 1.86.78 2.39.09.1.1.2.07.3-.08.32-.26 1.03-.29 1.17-.05.19-.15.23-.34.14-1.25-.58-2.03-2.4-2.03-3.87 0-3.15 2.29-6.04 6.6-6.04 3.46 0 6.15 2.47 6.15 5.77 0 3.44-2.17 6.21-5.18 6.21-1.01 0-1.96-.52-2.29-1.14l-.62 2.37c-.22.87-.83 1.96-1.24 2.62.93.29 1.91.44 2.94.44 5.52 0 10-4.48 10-10S17.52 2 12 2z" />
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
