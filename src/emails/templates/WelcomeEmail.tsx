import {
  Column,
  Heading,
  Img,
  Link,
  Row,
  Section,
  Text,
} from "@react-email/components";
import ActionButton from "../components/ActionButton";
import BaseEmail from "../components/BaseEmail";
import Divider from "../components/Divider";
import {
  DISPLAY_FONT_STACK,
  MONO_FONT_STACK,
  palette,
  resolveBodyFont,
  safeColor,
} from "../lib/styles";
import {
  formatPHP,
  isSafeImageUrl,
  PUBLIC_SITE_ORIGIN,
  substituteTemplate,
} from "../lib/template-vars";
import type {
  WelcomeDiscountResolved,
  WelcomeEmailConfig,
  WelcomeProductRow,
  WelcomeUser,
} from "../types";

export interface WelcomeEmailProps {
  config: WelcomeEmailConfig;
  user: WelcomeUser;
  /** Resolved discount block (from linked promo or inline draft). */
  discount?: WelcomeDiscountResolved | null;
  /** Resolved product picks (already filtered + sliced upstream). */
  products?: WelcomeProductRow[];
}

const formatExpiryLabel = (raw: string | undefined): string => {
  if (!raw) return "";
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

/**
 * Welcome email for new accounts (signup + Google OAuth). Renders:
 *   - Greeting + body paragraphs (admin-edited, supports {{name}} / {{email}})
 *   - Discount banner (when promo / inline draft attached)
 *   - Products grid (4 thumbnails by default)
 *   - CTA button
 *   - Optional avatar block + signature
 */
export default function WelcomeEmail({
  config,
  user,
  discount,
  products,
}: WelcomeEmailProps) {
  const cfg = config || ({} as WelcomeEmailConfig);
  const primary = safeColor(cfg.primaryColor, palette.light.bodyText);
  const accent = safeColor(cfg.accentColor, palette.light.mutedText);
  const bodyFont = resolveBodyFont(cfg.bodyFont);

  const fullName = (user?.name || "").trim() || "there";
  const firstName = fullName.split(/\s+/)[0] || fullName;
  const vars: Record<string, string> = {
    name: fullName,
    firstName,
    email: user?.email || "",
  };
  const subject = substituteTemplate(
    cfg.subject || "Welcome to Canvas Hub",
    vars,
  );
  const bodyText = substituteTemplate(cfg.body || "", vars);
  const signature = String(cfg.signature || "").trim();

  const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const sigLines = signature.split(/\n+/).map(normalize).filter(Boolean);
  const bodyLines = bodyText.split(/\n+/).map(normalize).filter(Boolean);
  const signatureDuplicatesBody =
    sigLines.length > 0 && sigLines.every((l) => bodyLines.includes(l));

  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const showAvatar = cfg.showAvatar !== false && isSafeImageUrl(cfg.avatarUrl);
  const avatarName = (cfg.avatarName || "Sam").trim();

  const productsCfg = cfg.products;
  const productList =
    productsCfg && productsCfg.enabled !== false
      ? (products || []).slice(0, productsCfg.count || 4)
      : [];

  const showDiscount = !!(discount && discount.code);

  const ctaLabel = (cfg.ctaLabel || "").trim();
  const ctaUrl = (cfg.ctaUrl || "").trim();

  return (
    <BaseEmail
      config={cfg}
      preview={subject || `Welcome to ${cfg.fromName || "Canvas Hub"}`}
      logoSlot="welcome-logo"
      bannerSlot="welcome-banner"
      compactHeaderSpacing
    >
      <Heading
        as="h1"
        className="email-text"
        style={{
          margin: "0 0 16px",
          fontFamily: DISPLAY_FONT_STACK,
          fontWeight: 500,
          fontSize: "28px",
          lineHeight: 1.25,
          letterSpacing: "0.01em",
          color: primary,
        }}
      >
        Welcome, {firstName}.
      </Heading>

      {paragraphs.map((p, idx) => (
        <Text
          key={idx}
          className="email-text"
          style={{
            margin: "0 0 14px",
            fontSize: "15px",
            lineHeight: 1.65,
            color: primary,
            fontFamily: bodyFont,
            whiteSpace: "pre-line",
          }}
        >
          {p}
        </Text>
      ))}

      {showDiscount && (
        <>
          <Divider style={cfg.dividerStyle} accent={palette.light.accent} />
          <Section
            className="email-soft-bg"
            style={{
              margin: "12px 0",
              padding: "20px 22px",
              background: palette.light.softBg,
              border: `1px dashed ${palette.light.accent}`,
              borderRadius: "10px",
              textAlign: "center",
            }}
          >
            <Text
              style={{
                margin: 0,
                fontSize: "11px",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: accent,
              }}
            >
              {discount?.headline || "Your welcome gift"}
            </Text>
            {discount?.description && (
              <Text
                className="email-text"
                style={{
                  margin: "6px 0 14px",
                  fontSize: "14px",
                  color: primary,
                  lineHeight: 1.5,
                }}
              >
                {discount.description}
              </Text>
            )}
            <Text
              style={{
                display: "inline-block",
                margin: "8px 0 0",
                padding: "10px 22px",
                background: palette.light.cardBg,
                border: `1px dashed ${palette.light.accent}`,
                borderRadius: "4px",
                fontFamily: MONO_FONT_STACK,
                fontSize: "20px",
                letterSpacing: "0.18em",
                color: primary,
              }}
            >
              {discount?.code}
            </Text>
            {discount?.expiresAt && formatExpiryLabel(discount.expiresAt) && (
              <Text
                className="email-muted"
                style={{
                  margin: "10px 0 0",
                  fontSize: "11.5px",
                  color: accent,
                  letterSpacing: "0.04em",
                }}
              >
                Use before {formatExpiryLabel(discount.expiresAt)}.
              </Text>
            )}
          </Section>
        </>
      )}

      {productList.length > 0 && (
        <>
          <Divider style={cfg.dividerStyle} accent={palette.light.accent} />
          <Text
            className="email-muted"
            style={{
              margin: "12px 0 14px",
              fontSize: "12px",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: accent,
            }}
          >
            {productsCfg?.sectionTitle ||
              productsCfg?.heading ||
              "A small glimpse"}
          </Text>
          {(() => {
            // Chunk products into pairs so each Row holds 2 columns at
            // 50% width; tables in email HTML can't auto-wrap, so we
            // emit multiple <Row>s rather than one wide Row.
            const list = productList.slice(0, 4);
            const rows: (typeof list)[] = [];
            for (let i = 0; i < list.length; i += 2) {
              rows.push(list.slice(i, i + 2));
            }
            return (
              <Section style={{ margin: "0 -6px 8px" }}>
                {rows.map((rowItems, rowIdx) => (
                  <Row key={rowIdx}>
                    {rowItems.map((p, idx) => {
                      // Storefront route is `/product/$id` (singular) — the
                      // TanStack file route is `src/routes/product.$id.tsx`.
                      // Until now the welcome template emitted the plural
                      // `/products/<id>`, which 404s, so clicking a suggested
                      // product card in the email opened the SPA's not-found
                      // page instead of the actual painting overview.
                      const href = p.__custom
                        ? `${PUBLIC_SITE_ORIGIN}/preview/${encodeURIComponent(p.id || "")}`
                        : `${PUBLIC_SITE_ORIGIN}/product/${encodeURIComponent(p.id || "")}`;
                      const showImg = isSafeImageUrl(p.imageUrl);
                      return (
                        <Column
                          key={p.id || `${rowIdx}-${idx}`}
                          style={{
                            width: "50%",
                            padding: "6px",
                            verticalAlign: "top",
                          }}
                        >
                          <Link href={href} style={{ textDecoration: "none" }}>
                            {showImg ? (
                              <Img
                                src={p.imageUrl as string}
                                alt={p.title || "Product"}
                                className="email-thumbnail"
                                style={{
                                  width: "100%",
                                  height: "150px",
                                  objectFit: "cover",
                                  borderRadius: "6px",
                                  background: palette.light.softBg,
                                  border: `1px solid ${palette.light.cardBorder}`,
                                  display: "block",
                                }}
                              />
                            ) : (
                              <div
                                className="email-thumbnail email-soft-bg"
                                style={{
                                  width: "100%",
                                  height: "150px",
                                  borderRadius: "6px",
                                  background: palette.light.softBg,
                                  border: `1px solid ${palette.light.cardBorder}`,
                                }}
                              />
                            )}
                            <Text
                              className="email-text"
                              style={{
                                margin: "8px 0 2px",
                                fontSize: "13px",
                                color: primary,
                                fontWeight: 500,
                                lineHeight: 1.3,
                              }}
                            >
                              {p.title || "Untitled"}
                            </Text>
                            {productsCfg?.showPrice !== false &&
                              typeof p.price === "number" &&
                              p.price > 0 && (
                                <Text
                                  className="email-muted"
                                  style={{
                                    margin: 0,
                                    fontSize: "12px",
                                    color: accent,
                                  }}
                                >
                                  {formatPHP(p.price)}
                                </Text>
                              )}
                          </Link>
                        </Column>
                      );
                    })}
                    {rowItems.length === 1 && (
                      <Column style={{ width: "50%", padding: "6px" }} />
                    )}
                  </Row>
                ))}
              </Section>
            );
          })()}
        </>
      )}

      {ctaLabel && ctaUrl && (
        <>
          <Divider style={cfg.dividerStyle} accent={palette.light.accent} />
          <Section style={{ margin: "16px 0 0", textAlign: "left" }}>
            <ActionButton
              label={ctaLabel}
              url={ctaUrl}
              primary={primary}
              style={cfg.buttonStyle}
            />
          </Section>
        </>
      )}

      {showAvatar && (
        <Section style={{ margin: "32px 0 0" }}>
          <Row>
            <Column style={{ width: "60px", verticalAlign: "middle" }}>
              <Img
                src={cfg.avatarUrl as string}
                alt={avatarName}
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  objectFit: "cover",
                  display: "block",
                  border: `2px solid ${palette.light.cardBorder}`,
                }}
              />
            </Column>
            <Column style={{ verticalAlign: "middle", paddingLeft: "12px" }}>
              <Text
                className="email-text"
                style={{
                  margin: 0,
                  fontSize: "13px",
                  fontWeight: 600,
                  color: primary,
                }}
              >
                {avatarName}
              </Text>
              <Text
                className="email-muted"
                style={{
                  margin: 0,
                  fontSize: "11.5px",
                  color: accent,
                  fontStyle: "italic",
                }}
              >
                {cfg.fromName || "Canvas Hub"}
              </Text>
            </Column>
          </Row>
        </Section>
      )}

      {signature && !signatureDuplicatesBody && (
        <Text
          className="email-muted"
          style={{
            margin: "20px 0 0",
            fontSize: "13px",
            color: accent,
            whiteSpace: "pre-line",
            lineHeight: 1.55,
          }}
        >
          {signature}
        </Text>
      )}
    </BaseEmail>
  );
}

export const buildWelcomeEmailMeta = (
  props: WelcomeEmailProps,
): { subject: string; text: string } => {
  const { config, user, discount, products } = props;
  const fullName = (user?.name || "").trim() || "there";
  const firstName = fullName.split(/\s+/)[0] || fullName;
  const vars = { name: fullName, firstName, email: user?.email || "" };
  const subject = substituteTemplate(
    config?.subject || "Welcome to Canvas Hub",
    vars,
  ).slice(0, 240);
  const bodyText = substituteTemplate(config?.body || "", vars);
  const signature = String(config?.signature || "").trim();
  let text = bodyText;
  if (discount?.code) {
    text += `\n\n${discount.headline || "Your welcome gift"}\nCode: ${discount.code}`;
    if (discount.description) text += `\n${discount.description}`;
  }
  if (config?.products?.enabled !== false && products && products.length > 0) {
    const productsCfg = config?.products;
    const sectionTitle =
      productsCfg?.sectionTitle || productsCfg?.heading || "A small glimpse";
    text += `\n\n${sectionTitle}:\n`;
    products.slice(0, productsCfg?.count || 4).forEach((p) => {
      const showPrice = productsCfg?.showPrice !== false && Boolean(p.price);
      text += `- ${p.title || "Untitled"}${
        showPrice ? ` (${formatPHP(p.price as number)})` : ""
      }\n`;
    });
  }
  if (signature) {
    text += `\n\n${signature}`;
  }
  return { subject, text };
};
