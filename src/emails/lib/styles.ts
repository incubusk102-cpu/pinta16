/**
 * Design tokens for the React Email templates. Centralised so every
 * email (welcome / order x7 / admin alert / voucher / inactive
 * deletion) renders with one consistent visual language.
 *
 * Colors are layered in pairs (light/dark) so we can ship CSS media
 * queries in <Head> for clients that honour `prefers-color-scheme`
 * (Apple Mail, iOS Mail, Outlook 365 Mac). Outlook Windows + Gmail
 * desktop ignore the dark variant and stay on light.
 *
 * The design language is gallery-editorial: classical serifs for
 * display, neutral parchment background, warm gold accents on CTAs.
 * Mobile width caps at 600px; below 480px the layout collapses to a
 * single column.
 */

import type {
  BodyFont,
  ButtonStyle,
  DividerStyle,
  HeaderAlign,
  Template,
} from "../types";

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

export const palette = {
  light: {
    pageBg: "#f5f3ee",
    cardBg: "#ffffff",
    cardBorder: "#e9e3d6",
    bodyText: "#1c1c1c",
    mutedText: "#7a7468",
    softBg: "#faf8f3",
    accent: "#c4a86a", // warm gold, used on dividers / status pill
    success: "#3f6d3a",
    warn: "#a25b1f",
    danger: "#9a2a2a",
  },
  dark: {
    pageBg: "#161413",
    cardBg: "#1f1c1a",
    cardBorder: "#2e2925",
    bodyText: "#f0ebe1",
    mutedText: "#a89e8e",
    softBg: "#262220",
    accent: "#d6b977",
    success: "#7eb579",
    warn: "#d99354",
    danger: "#e08585",
  },
} as const;

// ---------------------------------------------------------------------------
// Font stacks
// ---------------------------------------------------------------------------

export const FONT_STACKS: Record<BodyFont, string> = {
  inter: "'Inter','Helvetica Neue',Helvetica,Arial,sans-serif",
  playfair: "'Playfair Display',Georgia,'Times New Roman',serif",
  garamond: "'EB Garamond',Garamond,Georgia,'Times New Roman',serif",
  georgia: "Georgia,'Times New Roman',serif",
};

export const DISPLAY_FONT_STACK =
  "'Playfair Display','EB Garamond',Georgia,'Times New Roman',serif";

export const MONO_FONT_STACK =
  "'JetBrains Mono','Roboto Mono','Courier New',monospace";

export const resolveBodyFont = (font: BodyFont | undefined): string =>
  FONT_STACKS[font ?? "inter"] ?? FONT_STACKS.inter;

// ---------------------------------------------------------------------------
// Template variants — control header/footer paddings and weights so the
// admin can pick a flavour without changing component code.
// ---------------------------------------------------------------------------

export interface TemplateTokens {
  contentPad: string;
  headerPad: string;
  footerPad: string;
  cardRadius: string;
  cardShadow: string;
  headerWordmarkSize: string;
  headerWordmarkLetterSpacing: string;
}

export const TEMPLATE_TOKENS: Record<Template, TemplateTokens> = {
  classic: {
    contentPad: "32px 32px 24px",
    headerPad: "28px 32px 20px",
    footerPad: "20px 32px 28px",
    cardRadius: "10px",
    cardShadow: "0 1px 0 rgba(0,0,0,0.04)",
    headerWordmarkSize: "26px",
    headerWordmarkLetterSpacing: "0.02em",
  },
  editorial: {
    contentPad: "40px 40px 28px",
    headerPad: "36px 40px 24px",
    footerPad: "24px 40px 32px",
    cardRadius: "4px",
    cardShadow: "none",
    headerWordmarkSize: "30px",
    headerWordmarkLetterSpacing: "0.04em",
  },
  minimal: {
    contentPad: "28px 28px 20px",
    headerPad: "24px 28px 16px",
    footerPad: "16px 28px 24px",
    cardRadius: "6px",
    cardShadow: "none",
    headerWordmarkSize: "22px",
    headerWordmarkLetterSpacing: "0.02em",
  },
  gallery: {
    contentPad: "36px 32px 24px",
    headerPad: "32px 32px 20px",
    footerPad: "24px 32px 32px",
    cardRadius: "0px",
    cardShadow: "0 1px 0 rgba(0,0,0,0.05)",
    headerWordmarkSize: "28px",
    headerWordmarkLetterSpacing: "0.06em",
  },
};

export const resolveTemplate = (
  template: Template | undefined,
): TemplateTokens => TEMPLATE_TOKENS[template ?? "classic"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const isSafeColor = (value: string | undefined): value is string =>
  typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value.trim());

export const safeColor = (
  value: string | undefined,
  fallback: string,
): string => (isSafeColor(value) ? (value as string) : fallback);

export const isSafeUrl = (value: string | undefined): value is string =>
  typeof value === "string" &&
  /^(https?:\/\/|mailto:|data:image\/)/i.test(value.trim());

export const resolveHeaderAlign = (
  align: HeaderAlign | undefined,
): HeaderAlign => (align === "center" ? "center" : "left");

// ---------------------------------------------------------------------------
// Dark-mode-aware media-query CSS injected into every email's <Head>.
// Email clients that don't honour @media (prefers-color-scheme: dark)
// silently ignore it and stay on the inline-styled light palette.
// Clients that DO honour it (Apple Mail, iOS Mail, Outlook 365 Mac, modern
// Gmail web on dark themes) will swap palettes at render time.
// ---------------------------------------------------------------------------

export const buildDarkModeCss = (primary: string, accent: string): string => `
  @media (prefers-color-scheme: dark) {
    body, .email-body { background: ${palette.dark.pageBg} !important; color: ${palette.dark.bodyText} !important; }
    .email-card { background: ${palette.dark.cardBg} !important; border-color: ${palette.dark.cardBorder} !important; }
    .email-text { color: ${palette.dark.bodyText} !important; }
    .email-muted { color: ${palette.dark.mutedText} !important; }
    .email-soft-bg { background: ${palette.dark.softBg} !important; }
    .email-divider { background: ${palette.dark.cardBorder} !important; border-color: ${palette.dark.cardBorder} !important; }
    .email-accent { color: ${palette.dark.accent} !important; }
    .email-button-filled { background: ${primary} !important; color: ${palette.dark.bodyText} !important; }
    .email-status-pill-active { background: ${accent} !important; color: #1c1c1c !important; }
    .email-status-pill-done { background: ${palette.dark.cardBorder} !important; color: ${palette.dark.bodyText} !important; }
    .email-status-pill-future { background: transparent !important; border-color: ${palette.dark.cardBorder} !important; color: ${palette.dark.mutedText} !important; }
    .email-thumbnail { background: ${palette.dark.softBg} !important; border-color: ${palette.dark.cardBorder} !important; }
  }
  @media only screen and (max-width: 480px) {
    .email-card { width: 100% !important; border-radius: 0 !important; }
    .email-content-padded { padding-left: 20px !important; padding-right: 20px !important; }
    .email-header-padded { padding-left: 20px !important; padding-right: 20px !important; }
    .email-footer-padded { padding-left: 20px !important; padding-right: 20px !important; }
    .email-status-progress { font-size: 11px !important; }
    .email-status-pill { padding: 6px 8px !important; font-size: 10px !important; }
    .email-thumbnail-cell { display: block !important; width: 100% !important; padding-bottom: 8px !important; }
    .email-item-cell { display: block !important; width: 100% !important; padding-left: 0 !important; }
    .email-item-price-cell { display: block !important; width: 100% !important; text-align: left !important; padding-left: 0 !important; padding-top: 4px !important; }
    .email-hide-mobile { display: none !important; }
  }
`;

// ---------------------------------------------------------------------------
// Divider rendering — style controlled by admin.
// ---------------------------------------------------------------------------

export const buildDividerStyle = (
  style: DividerStyle | undefined,
  accent: string,
): React.CSSProperties => {
  if (style === "none") return { display: "none" };
  if (style === "brush")
    return {
      height: "10px",
      width: "60px",
      background: accent,
      border: "none",
      borderRadius: "5px",
      margin: "20px 0",
    };
  return {
    height: "1px",
    width: "100%",
    background: "#e9e3d6",
    border: "none",
    margin: "24px 0",
  };
};

// ---------------------------------------------------------------------------
// Action / button styling — admin-tunable.
// ---------------------------------------------------------------------------

export interface ActionLinkOptions {
  label: string;
  url: string;
  primary: string;
  style?: ButtonStyle;
  className?: string;
}

export const buildActionStyle = (
  style: ButtonStyle | undefined,
  primary: string,
): React.CSSProperties => {
  if (style === "outline") {
    return {
      display: "inline-block",
      padding: "12px 22px",
      border: `1.5px solid ${primary}`,
      borderRadius: "999px",
      color: primary,
      textDecoration: "none",
      fontFamily: FONT_STACKS.inter,
      fontSize: "13px",
      fontWeight: 500,
      letterSpacing: "0.05em",
      textTransform: "uppercase",
      background: "transparent",
    };
  }
  if (style === "underline") {
    return {
      display: "inline-block",
      padding: "4px 0",
      borderBottom: `2px solid ${primary}`,
      color: primary,
      textDecoration: "none",
      fontFamily: FONT_STACKS.inter,
      fontSize: "13px",
      fontWeight: 600,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
    };
  }
  return {
    display: "inline-block",
    padding: "13px 26px",
    background: primary,
    borderRadius: "999px",
    color: "#ffffff",
    textDecoration: "none",
    fontFamily: FONT_STACKS.inter,
    fontSize: "13px",
    fontWeight: 500,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  };
};
