/**
 * Shared types for the React Email templates. Mirrors (a subset of) the
 * shapes stored in the storefront-config KV doc so the templates can be
 * rendered both:
 *   - server-side from Cloudflare Pages Functions (via `render()`)
 *   - client-side at design-time via `react-email dev`
 */

export type OrderEmailKind =
  | "confirmed"
  | "in_progress"
  | "out_for_delivery"
  | "received"
  | "refund_requested"
  | "refund_succeeded"
  | "refund_failed";

export type BodyFont = "inter" | "playfair" | "garamond" | "georgia";

export type Template = "classic" | "editorial" | "minimal" | "gallery";

export type HeaderAlign = "left" | "center";

export type DividerStyle = "none" | "line" | "brush";

export type ButtonStyle = "filled" | "outline" | "underline";

export type FooterLinkKind =
  | "instagram"
  | "facebook"
  | "tiktok"
  | "x"
  | "twitter"
  | "youtube"
  | "pinterest"
  | "threads"
  | "mail"
  | "phone"
  | "globe"
  | "headphones"
  | "custom";

export interface FooterLink {
  id: string;
  kind: FooterLinkKind;
  label: string;
  url: string;
}

/**
 * Subset of the OrderEmailConfig / WelcomeEmailConfig shapes that the
 * email templates actually consume. Defined permissively (every field
 * optional with a default) so the templates render fine even when no
 * admin config has been saved yet.
 */
export interface EmailChromeConfig {
  fromName?: string;
  primaryColor?: string;
  accentColor?: string;
  logoUrl?: string;
  bannerUrl?: string;
  showLogo?: boolean;
  showBanner?: boolean;
  bodyFont?: BodyFont;
  template?: Template;
  headerAlign?: HeaderAlign;
  dividerStyle?: DividerStyle;
  buttonStyle?: ButtonStyle;
  footerTagline?: string;
  footerLinks?: FooterLink[];
}

export interface OrderItem {
  id?: string;
  title?: string;
  quantity?: number;
  price?: number;
  image?: string;
}

export interface OrderRecord {
  id?: string;
  status?: string;
  items?: OrderItem[];
  subtotal?: number;
  shippingFee?: number;
  discount?: number;
  total?: number;
  voucherCode?: string;
  orderInfo?: {
    fullName?: string;
    email?: string;
    phone?: string;
  };
}

export interface OrderEmailExtra {
  trackingUrl?: string;
  trackingNumber?: string;
  courier?: string;
  shippedAt?: string;
  refundAmount?: number;
  refundFailureMessage?: string;
}

export interface OrderEmailKindCopy {
  /** Template string (supports {{name}}, {{orderId}}, {{total}}, etc.) */
  subject: string;
  heading: string;
  /** Multi-paragraph body. Newlines preserved. */
  intro: string;
}

export interface OrderEmailConfig extends EmailChromeConfig {
  /** Per-kind copy overrides. Falls back to module-level DEFAULT_KIND_COPY. */
  kinds?: Partial<Record<OrderEmailKind, Partial<OrderEmailKindCopy>>>;
  trackButtonText?: string;
  reviewButtonText?: string;
}

export interface WelcomeProductRow {
  id?: string;
  title?: string;
  price?: number;
  imageUrl?: string;
  __custom?: boolean;
}

export interface WelcomeProductsConfig {
  enabled?: boolean;
  mode?: "auto" | "manual" | "custom";
  count?: number;
  manualIds?: string[];
  customItems?: WelcomeProductRow[];
  /**
   * Section title shown above the products grid in the welcome email. The
   * admin form writes this field; older configs that only set `heading`
   * remain readable through the fallback chain in the React Email
   * template.
   */
  sectionTitle?: string;
  /** Legacy alias for `sectionTitle`. Preserved for back-compat. */
  heading?: string;
  /** When false, prices are hidden under each product thumbnail. */
  showPrice?: boolean;
}

export interface WelcomeDiscountResolved {
  headline?: string;
  description?: string;
  code?: string;
  expiresAt?: string;
}

export interface WelcomeEmailConfig extends EmailChromeConfig {
  subject?: string;
  body?: string;
  signature?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  avatarUrl?: string;
  avatarName?: string;
  showAvatar?: boolean;
  products?: WelcomeProductsConfig;
}

export interface WelcomeUser {
  name?: string;
  email?: string;
}
