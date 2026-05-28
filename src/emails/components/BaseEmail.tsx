import {
  Body,
  Container,
  Font,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";
import type { EmailChromeConfig, FooterLink } from "../types";
import {
  buildDarkModeCss,
  DISPLAY_FONT_STACK,
  isSafeUrl,
  palette,
  resolveBodyFont,
  resolveHeaderAlign,
  resolveTemplate,
  safeColor,
} from "../lib/styles";

interface BaseEmailProps {
  config: EmailChromeConfig;
  /** Inbox preview line (Gmail/Apple Mail show this next to the subject) */
  preview: string;
  /** Title element shown in <head>; defaults to fromName + " — " + preview */
  title?: string;
  children: React.ReactNode;
  /**
   * Slot identifiers used by the host renderer to rehost admin-uploaded
   * logo / banner images through `/api/welcome-asset/...` so the email
   * client doesn't fetch from a private storage URL.
   */
  logoSlot?: string;
  bannerSlot?: string;
  /**
   * Pull the content section closer to the logo by trimming the header's
   * bottom padding and the content's top padding by ~12px each. Used by
   * shorter emails (welcome, voucher) where the default ~52px gap reads
   * as empty space; the long transactional emails keep the full gap.
   */
  compactHeaderSpacing?: boolean;
}

/**
 * Default brand monogram shown when no logo is uploaded. Renders a
 * single "C" (or the first letter of the configured fromName) in the
 * editorial display face so it reads as a brand mark, not a heading.
 * SVG-free so every email client (Outlook, Gmail, Apple Mail) renders
 * it consistently without needing image hosting.
 */
const MonogramFallback: React.FC<{
  fromName: string;
  color: string;
  accent: string;
  align: "left" | "center";
}> = ({ fromName, color, accent, align }) => {
  const letter = (
    String(fromName || "C")
      .trim()
      .charAt(0) || "C"
  ).toUpperCase();
  return (
    <Text
      style={{
        display: "inline-block",
        margin: 0,
        marginLeft: align === "center" ? "auto" : 0,
        marginRight: align === "center" ? "auto" : 0,
        width: "44px",
        height: "44px",
        lineHeight: "44px",
        textAlign: "center",
        fontFamily: DISPLAY_FONT_STACK,
        fontSize: "26px",
        fontWeight: 500,
        letterSpacing: 0,
        color,
        background: "transparent",
        border: `1.5px solid ${accent}`,
        borderRadius: "50%",
      }}
    >
      {letter}
    </Text>
  );
};

const FooterLinks: React.FC<{
  links: FooterLink[];
  align: "left" | "center";
  accent: string;
}> = ({ links, align, accent }) => {
  const visible = (links || []).filter((l) => l && l.url && isSafeUrl(l.url));
  if (!visible.length) return null;
  return (
    <Text
      className="email-muted"
      style={{
        margin: "0 0 8px",
        fontSize: "12px",
        color: accent,
        textAlign: align,
        lineHeight: 1.6,
      }}
    >
      {visible.map((link, idx) => (
        <React.Fragment key={link.id || idx}>
          <Link
            href={link.url}
            style={{
              color: accent,
              textDecoration: "underline",
              marginRight: idx < visible.length - 1 ? "12px" : 0,
            }}
          >
            {link.label || link.kind}
          </Link>
          {idx < visible.length - 1 && (
            <span style={{ color: accent, marginRight: "12px" }}>·</span>
          )}
        </React.Fragment>
      ))}
    </Text>
  );
};

// Trim a fixed delta off the matching axis of a 3-or-4-token CSS padding
// string. `tpl.headerPad` / `tpl.contentPad` follow the standard CSS
// shorthand (e.g. "28px 32px 20px") so we parse, clamp the target token
// to a non-negative integer, and reassemble. Keeps the side padding
// intact so the email body still aligns with the header.
const trimPaddingAxis = (
  pad: string,
  axis: "top" | "bottom",
  delta: number,
): string => {
  const tokens = pad.trim().split(/\s+/);
  if (tokens.length < 1 || tokens.length > 4) return pad;
  const idxMap: Record<typeof axis, Record<number, number>> = {
    top: { 1: 0, 2: 0, 3: 0, 4: 0 },
    bottom: { 1: 0, 2: 0, 3: 2, 4: 2 },
  };
  const idx = idxMap[axis][tokens.length];
  if (idx === undefined) return pad;
  const token = tokens[idx];
  const match = token && token.match(/^(-?\d+(?:\.\d+)?)(px|rem|em)?$/);
  if (!match) return pad;
  const value = parseFloat(match[1] || "0");
  const unit = match[2] || "px";
  const next = Math.max(0, value - delta);
  tokens[idx] = `${next}${unit}`;
  return tokens.join(" ");
};

/**
 * The single shared chrome used by every transactional email — welcome,
 * order x7, admin alert, voucher, inactive deletion. Renders:
 *   - <Head> with charset / viewport / Google Fonts / dark-mode CSS
 *   - Optional banner hero
 *   - Header with logo (or wordmark fallback)
 *   - Children (the email-specific body)
 *   - Footer with links + tagline + brand
 */
export default function BaseEmail({
  config,
  preview,
  title,
  children,
  logoSlot,
  bannerSlot,
  compactHeaderSpacing,
}: BaseEmailProps) {
  const fromName = (config.fromName || "Canvas Hub").trim();
  const tpl = resolveTemplate(config.template);
  const align = resolveHeaderAlign(config.headerAlign);
  const headerPad = compactHeaderSpacing
    ? trimPaddingAxis(tpl.headerPad, "bottom", 12)
    : tpl.headerPad;
  const contentPad = compactHeaderSpacing
    ? trimPaddingAxis(tpl.contentPad, "top", 12)
    : tpl.contentPad;
  const bodyFont = resolveBodyFont(config.bodyFont);
  const accent = safeColor(config.accentColor, palette.light.mutedText);
  const primary = safeColor(config.primaryColor, palette.light.bodyText);

  const showLogo = config.showLogo !== false && isSafeUrl(config.logoUrl);
  const showBanner = Boolean(config.showBanner) && isSafeUrl(config.bannerUrl);

  // Render the admin's logo when uploaded, otherwise show a clean
  // C monogram (NOT a full "Canvas Hub" wordmark) so every email
  // shares the same compact brand mark on the left.
  const headerNode = showBanner ? null : showLogo ? (
    <Img
      src={config.logoUrl as string}
      alt={fromName}
      data-slot={logoSlot || "logo"}
      style={{
        maxHeight: "48px",
        maxWidth: "160px",
        display: align === "center" ? "inline-block" : "block",
        margin: align === "center" ? "0 auto" : 0,
      }}
    />
  ) : (
    <MonogramFallback
      fromName={fromName}
      color={primary}
      accent={palette.light.accent}
      align={align}
    />
  );

  return (
    <Html lang="en">
      <Head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <meta name="x-apple-disable-message-reformatting" />
        <title>{title || `${fromName} — ${preview}`}</title>
        <Font
          fontFamily="Inter"
          fallbackFontFamily={["Helvetica", "Arial", "sans-serif"]}
          webFont={{
            url: "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMa1ZL7.woff2",
            format: "woff2",
          }}
          fontWeight={400}
          fontStyle="normal"
        />
        <Font
          fontFamily="Playfair Display"
          fallbackFontFamily={["Georgia", "Times New Roman", "serif"]}
          webFont={{
            url: "https://fonts.gstatic.com/s/playfairdisplay/v37/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKdFvUDQ.woff2",
            format: "woff2",
          }}
          fontWeight={500}
          fontStyle="normal"
        />
        <style
          dangerouslySetInnerHTML={{
            __html: buildDarkModeCss(primary, accent),
          }}
        />
      </Head>
      <Preview>{preview}</Preview>
      <Body
        className="email-body"
        style={{
          margin: 0,
          padding: "24px 0",
          background: palette.light.pageBg,
          fontFamily: bodyFont,
          color: palette.light.bodyText,
        }}
      >
        <Container
          className="email-card"
          style={{
            maxWidth: "600px",
            margin: "0 auto",
            background: palette.light.cardBg,
            border: `1px solid ${palette.light.cardBorder}`,
            borderRadius: tpl.cardRadius,
            boxShadow: tpl.cardShadow,
            overflow: "hidden",
          }}
        >
          {showBanner && (
            <Section style={{ padding: 0, margin: 0 }}>
              <Img
                src={config.bannerUrl as string}
                alt={fromName}
                data-slot={bannerSlot || "banner"}
                style={{
                  display: "block",
                  width: "100%",
                  maxWidth: "600px",
                  height: "auto",
                  margin: 0,
                }}
              />
            </Section>
          )}
          <Section
            className="email-header-padded"
            style={{
              padding: headerPad,
              borderBottom: showBanner
                ? "none"
                : `1px solid ${palette.light.cardBorder}`,
              textAlign: align,
            }}
          >
            {headerNode}
          </Section>
          <Section
            className="email-content-padded email-text"
            style={{
              padding: contentPad,
              fontSize: "15px",
              lineHeight: 1.65,
              color: palette.light.bodyText,
              fontFamily: bodyFont,
            }}
          >
            {children}
          </Section>
          <Hr
            className="email-divider"
            style={{
              border: "none",
              height: "1px",
              background: palette.light.cardBorder,
              margin: 0,
            }}
          />
          <Section
            className="email-footer-padded email-muted"
            style={{
              padding: tpl.footerPad,
              fontSize: "11.5px",
              lineHeight: 1.6,
              color: accent,
              textAlign: align,
            }}
          >
            <FooterLinks
              links={config.footerLinks || []}
              align={align}
              accent={accent}
            />
            <Text
              className="email-accent"
              style={{
                margin: 0,
                fontFamily: DISPLAY_FONT_STACK,
                fontStyle: "italic",
                fontSize: "14px",
                letterSpacing: "0.02em",
                color: palette.light.accent,
              }}
            >
              {fromName}
              {config.footerTagline ? (
                <span
                  className="email-muted"
                  style={{
                    color: accent,
                    fontStyle: "normal",
                    fontFamily: bodyFont,
                    fontSize: "11.5px",
                    marginLeft: "6px",
                  }}
                >
                  — {config.footerTagline}
                </span>
              ) : null}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
