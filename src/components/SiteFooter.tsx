import { Link } from "@tanstack/react-router";
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

const SiteFooter = () => {
  const { t } = useLocale();
  const { policies } = usePolicies();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/30 mt-24 px-6 md:px-12 py-12">
      <div className="max-w-5xl mx-auto grid gap-10 md:grid-cols-3 text-sm">
        <div>
          <p className="font-display text-lg text-foreground mb-3">
            Pintaterra
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Hand-crafted oil and acrylic paintings from independent Filipino
            artists. Every piece is one of one — never reproduced.
          </p>
        </div>

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

        <div>
          <p className="font-body text-xs tracking-[0.3em] uppercase text-muted-foreground mb-3">
            {t("contact.heading")}
          </p>
          <ul className="space-y-2 text-foreground/80">
            <li>
              <a
                href="mailto:pintaterra@gmail.com"
                className="hover:text-foreground transition-colors"
              >
                pintaterra@gmail.com
              </a>
            </li>
            <li>
              <a
                href="tel:+639564685351"
                className="hover:text-foreground transition-colors"
              >
                +63 956 468 5351
              </a>
            </li>
            <li className="text-muted-foreground">Bagong Silang, Caloocan</li>
          </ul>
        </div>
      </div>

      <div className="max-w-5xl mx-auto mt-10 pt-6 border-t border-border/20 text-xs text-muted-foreground text-center">
        {t("footer.copyright").replace("{year}", String(year))}
      </div>
    </footer>
  );
};

export default SiteFooter;
