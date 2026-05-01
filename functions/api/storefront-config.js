// /api/storefront-config — public read of announcement / free shipping /
import { setCloudflareContext } from "./_lib/context.js";
// promo codes / chat config; admin write of all of the above.
// KV namespace: STOREFRONT_CONFIG (single key "config" → JSON object).
//
// Cloudflare Pages Function port of netlify/functions/storefront-config.js.

import { makeStore } from "./_lib/kv-store.js";
import { isAuthenticated } from "./_lib/admin-auth.js";
import { buildLambdaEvent } from "./_lib/lambda-event.js";
import {
  isEmailConfigured,
  sendWelcomeEmail,
  sendOrderTestEmail,
  ORDER_EMAIL_KINDS,
  DEFAULT_ORDER_EMAIL_KINDS,
} from "./_lib/email.js";
import { isValidEmail, normalizeEmail } from "./_lib/user-auth.js";

const CONFIG_KEY = "config";
const jsonHeaders = { "Content-Type": "application/json" };

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

const parseBody = (body) => {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
};

const CHAT_FAQ_MAX = 12;
const CHAT_FAQ_QUESTION_MAX = 80;
const CHAT_FAQ_ANSWER_MAX = 1200;
const CHAT_WELCOME_MAX = 200;

const DEFAULT_CHAT_WELCOME =
  "Hi! Pick a topic below, or talk to a live agent for anything else.";

const DEFAULT_CHAT_FAQS = [
  {
    id: "shipping",
    question: "Shipping & delivery",
    answer:
      "We ship nationwide via LBC or J&T Express. Orders are packed within 2\u20133 business days and usually arrive within 5\u20137 business days. You'll get a tracking number by email as soon as it ships.",
  },
  {
    id: "returns",
    question: "Returns & refunds",
    answer:
      "Because each piece is an original hand-painted artwork, we only accept returns if the painting arrives damaged. Email us within 48 hours of delivery with a clear photo and we'll arrange a refund or replacement right away.",
  },
  {
    id: "payment",
    question: "Payment methods",
    answer:
      "We accept GCash, Maya, bank transfer, and major credit / debit cards via our secure checkout. Full payment is required before the artwork ships.",
  },
  {
    id: "sizing",
    question: "Sizing & dimensions",
    answer:
      "Each artwork's detail page lists the exact width \u00d7 height in inches and centimeters. Need a custom size? Tap 'Custom orders' below or talk to a live agent.",
  },
  {
    id: "custom",
    question: "Custom orders",
    answer:
      "Yes, we take commissioned pieces! Tap 'Talk to a live agent' and share the subject, preferred size, color palette, and deadline. We'll reply with a quote and timeline.",
  },
  {
    id: "authenticity",
    question: "Authenticity",
    answer:
      "Every painting ships with a signed certificate of authenticity from the artist. All works are original \u2014 no prints, no reproductions.",
  },
];

const slugifyFaqId = (value) => {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || `faq-${Math.random().toString(36).slice(2, 8)}`;
};

const sanitizeChatFaqs = (raw) => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const question = String(entry.question ?? "")
      .trim()
      .slice(0, CHAT_FAQ_QUESTION_MAX);
    const answer = String(entry.answer ?? "")
      .trim()
      .slice(0, CHAT_FAQ_ANSWER_MAX);
    if (!question || !answer) continue;
    let id = String(entry.id ?? "")
      .trim()
      .slice(0, 40);
    if (!id) id = slugifyFaqId(question);
    while (seen.has(id)) id = `${id}-${out.length}`;
    seen.add(id);
    out.push({ id, question, answer });
    if (out.length >= CHAT_FAQ_MAX) break;
  }
  return out;
};

// Site-copy defaults match the strings hard-coded in the React components.
// When admin saves a blank field we fall back to these so the storefront
// never shows an empty heading.
const SITE_COPY_DEFAULTS = {
  gallery: {
    eyebrow: "The Collection",
    title: "Our Collection",
  },
  about: {
    eyebrow: "Our Story",
    title: "About Canvas Hub",
    body: "Every painting has a soul \u2014 a story waiting to be told. We bring affordable, hand-crafted art to homes and spaces that deserve beauty. Each piece is made to order, ensuring that what you receive is as unique as your vision.",
  },
  reviews: {
    eyebrow: "What customers say",
    title: "Reviews from our collectors",
  },
  contact: {
    eyebrow: "Get in touch",
    title: "Contact us",
  },
};

const SITE_COPY_FIELD_MAX = 280;
const SITE_COPY_BODY_MAX = 1500;

const sanitizeSiteCopyField = (value, fallback, max = SITE_COPY_FIELD_MAX) => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, max);
};

// Welcome email — sent to a user the first time they sign up (email/password)
// or sign in with Google. The template + assets are admin-only; nothing here
// is included in the public storefront-config read.
const DEFAULT_WELCOME_EMAIL = {
  enabled: false,
  fromName: "Canvas Hub",
  fromEmail: "account@canvhub.com",
  replyTo: "account@canvhub.com",
  subject: "Welcome to Canvas Hub, {{firstName}}!",
  body:
    "Hi {{firstName}},\n\n" +
    "Thanks for joining Canvas Hub — we're glad to have you. " +
    "Every painting on the storefront is original, hand-painted, and shipped from the artist's studio.\n\n" +
    "Take your time exploring the collection. If a piece speaks to you, just tap it to see the full details and sizes.\n\n" +
    "If you have any questions, reply to this email and the team will get back to you.\n\n" +
    "— The Canvas Hub team",
  signature: "— The Canvas Hub team",
  primaryColor: "#1c1c1c",
  accentColor: "#7a7468",
  logoUrl: "",
  bannerUrl: "",
  avatarUrl: "",
  avatarName: "Canvas Hub team",
  ctaLabel: "Browse the collection",
  ctaUrl: "https://canvhub.com",
  showLogo: true,
  showBanner: false,
  showAvatar: false,
  // Font for the email body copy. The brand wordmark + section headers
  // stay in their gallery-style serifs; this only swaps the running
  // paragraphs and signature.
  bodyFont: "inter",
  // Named layout preset. "classic" preserves the original Canvas Hub
  // look; the other presets adjust spacing, alignment, dividers, and
  // background to feel editorial / minimal / gallery-dark. Individual
  // controls below still override per-template defaults.
  template: "classic",
  // Header (logo + greeting) horizontal alignment.
  headerAlign: "left",
  // Section divider between body / discount / products / footer.
  // "line" = single hairline rule, "brush" = the storefront brush
  // stroke art, "none" = nothing between sections.
  dividerStyle: "line",
  // CTA button visual treatment in the discount + products blocks.
  // "filled" = solid dark background (current default),
  // "outline" = bordered transparent button,
  // "underline" = inline text link with underline.
  buttonStyle: "filled",
  // Replaces the previously hardcoded footer caption so admins can edit
  // or translate the line that follows the wordmark.
  footerTagline: "original Filipino paintings",
  // Footer link rows. Each renders as a clickable icon + label
  // (Instagram, Facebook, Contact support, …).
  footerLinks: [],
  products: {
    enabled: true,
    // "auto"   = newest products from the storefront
    // "manual" = explicit picks from the storefront
    // "custom" = email-only uploads (image + title + price + description),
    //           each links to /preview/<id> on the storefront
    mode: "auto",
    count: 4,
    manualIds: [],
    customItems: [],
    sectionTitle: "A glimpse of the collection",
    showPrice: true,
  },
  discount: {
    enabled: false,
    source: "linked", // "linked" = pull from /admin → Storefront promo codes | "inline" = type it here
    linkedCode: "",
    inlineHeadline: "Your welcome gift",
    inlineCode: "WELCOME10",
    inlineDescription: "10% off your first painting.",
    inlineExpiresAt: "",
  },
};

const WELCOME_EMAIL_SUBJECT_MAX = 200;
const WELCOME_EMAIL_BODY_MAX = 8000;
const WELCOME_EMAIL_FIELD_MAX = 200;
const WELCOME_EMAIL_IMAGE_MAX = 3_500_000; // ~3.5 MB encoded data URL

const sanitizeWelcomeEmailString = (value, fallback, max) => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, max);
};

const sanitizeWelcomeEmailImage = (value) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length > WELCOME_EMAIL_IMAGE_MAX) return "";
  // Accept either an absolute URL or a data: URL. Reject anything else
  // (relative paths, javascript: URIs, etc.) so we never inject something
  // unexpected into an outbound email.
  if (/^data:image\//i.test(trimmed)) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed.slice(0, 2000);
  return "";
};

const sanitizeWelcomeEmail = (raw) => {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    enabled: Boolean(data.enabled),
    fromName: sanitizeWelcomeEmailString(
      data.fromName,
      DEFAULT_WELCOME_EMAIL.fromName,
      WELCOME_EMAIL_FIELD_MAX,
    ),
    fromEmail: sanitizeWelcomeEmailString(
      data.fromEmail,
      DEFAULT_WELCOME_EMAIL.fromEmail,
      WELCOME_EMAIL_FIELD_MAX,
    ),
    replyTo: sanitizeWelcomeEmailString(
      data.replyTo,
      DEFAULT_WELCOME_EMAIL.replyTo,
      WELCOME_EMAIL_FIELD_MAX,
    ),
    subject: sanitizeWelcomeEmailString(
      data.subject,
      DEFAULT_WELCOME_EMAIL.subject,
      WELCOME_EMAIL_SUBJECT_MAX,
    ),
    body: sanitizeWelcomeEmailString(
      data.body,
      DEFAULT_WELCOME_EMAIL.body,
      WELCOME_EMAIL_BODY_MAX,
    ),
    signature: sanitizeWelcomeEmailString(
      data.signature,
      DEFAULT_WELCOME_EMAIL.signature,
      WELCOME_EMAIL_FIELD_MAX,
    ),
    primaryColor: sanitizeWelcomeEmailString(
      data.primaryColor,
      DEFAULT_WELCOME_EMAIL.primaryColor,
      30,
    ),
    accentColor: sanitizeWelcomeEmailString(
      data.accentColor,
      DEFAULT_WELCOME_EMAIL.accentColor,
      30,
    ),
    logoUrl: sanitizeWelcomeEmailImage(data.logoUrl),
    bannerUrl: sanitizeWelcomeEmailImage(data.bannerUrl),
    avatarUrl: sanitizeWelcomeEmailImage(data.avatarUrl),
    avatarName: sanitizeWelcomeEmailString(
      data.avatarName,
      DEFAULT_WELCOME_EMAIL.avatarName,
      80,
    ),
    ctaLabel: sanitizeWelcomeEmailString(
      data.ctaLabel,
      DEFAULT_WELCOME_EMAIL.ctaLabel,
      80,
    ),
    ctaUrl: sanitizeWelcomeEmailString(
      data.ctaUrl,
      DEFAULT_WELCOME_EMAIL.ctaUrl,
      500,
    ),
    showLogo: data.showLogo !== false,
    showBanner: Boolean(data.showBanner),
    showAvatar: Boolean(data.showAvatar),
    bodyFont: sanitizeBodyFont(data.bodyFont),
    template: sanitizeWelcomeTemplate(data.template),
    headerAlign: sanitizeHeaderAlign(data.headerAlign),
    dividerStyle: sanitizeDividerStyle(data.dividerStyle),
    buttonStyle: sanitizeButtonStyle(data.buttonStyle),
    footerTagline: sanitizeWelcomeEmailString(
      data.footerTagline,
      DEFAULT_WELCOME_EMAIL.footerTagline,
      WELCOME_EMAIL_FIELD_MAX,
    ),
    footerLinks: sanitizeFooterLinks(data.footerLinks),
    products: sanitizeWelcomeProducts(data.products),
    discount: sanitizeWelcomeDiscount(data.discount),
  };
};

// Allow only the four curated body fonts. Anything else falls back to the
// system Inter sans we use as the storefront default.
const ALLOWED_BODY_FONTS = new Set([
  "inter",
  "playfair",
  "garamond",
  "georgia",
]);

const sanitizeBodyFont = (value) => {
  if (typeof value !== "string") return DEFAULT_WELCOME_EMAIL.bodyFont;
  const normalized = value.trim().toLowerCase();
  return ALLOWED_BODY_FONTS.has(normalized)
    ? normalized
    : DEFAULT_WELCOME_EMAIL.bodyFont;
};

// Layout presets. "classic" is the original Canvas Hub look; the other
// three are opinionated bundles of font/alignment/divider/button
// defaults that the email renderer reads as fallbacks when individual
// controls aren't set.
const ALLOWED_TEMPLATES = new Set([
  "classic",
  "editorial",
  "minimal",
  "gallery",
]);

const sanitizeWelcomeTemplate = (value) => {
  if (typeof value !== "string") return DEFAULT_WELCOME_EMAIL.template;
  const normalized = value.trim().toLowerCase();
  return ALLOWED_TEMPLATES.has(normalized)
    ? normalized
    : DEFAULT_WELCOME_EMAIL.template;
};

const ALLOWED_HEADER_ALIGNS = new Set(["left", "center"]);

const sanitizeHeaderAlign = (value) => {
  if (typeof value !== "string") return DEFAULT_WELCOME_EMAIL.headerAlign;
  const normalized = value.trim().toLowerCase();
  return ALLOWED_HEADER_ALIGNS.has(normalized)
    ? normalized
    : DEFAULT_WELCOME_EMAIL.headerAlign;
};

const ALLOWED_DIVIDER_STYLES = new Set(["none", "line", "brush"]);

const sanitizeDividerStyle = (value) => {
  if (typeof value !== "string") return DEFAULT_WELCOME_EMAIL.dividerStyle;
  const normalized = value.trim().toLowerCase();
  return ALLOWED_DIVIDER_STYLES.has(normalized)
    ? normalized
    : DEFAULT_WELCOME_EMAIL.dividerStyle;
};

const ALLOWED_BUTTON_STYLES = new Set(["filled", "outline", "underline"]);

const sanitizeButtonStyle = (value) => {
  if (typeof value !== "string") return DEFAULT_WELCOME_EMAIL.buttonStyle;
  const normalized = value.trim().toLowerCase();
  return ALLOWED_BUTTON_STYLES.has(normalized)
    ? normalized
    : DEFAULT_WELCOME_EMAIL.buttonStyle;
};

// Footer link rows shown above the wordmark + tagline. Each row is one
// of a fixed set of "kinds" (instagram, facebook, …) so the email can
// render the right icon. URL must be http(s), mailto:, or tel:.
const ALLOWED_FOOTER_LINK_KINDS = new Set([
  "instagram",
  "facebook",
  "tiktok",
  "x",
  "twitter",
  "youtube",
  "pinterest",
  "threads",
  "mail",
  "phone",
  "globe",
  "headphones",
  "custom",
]);

const FOOTER_LINK_LABEL_MAX = 60;
const FOOTER_LINK_URL_MAX = 500;
const FOOTER_LINKS_MAX = 8;

const sanitizeFooterLinkUrl = (value) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().slice(0, FOOTER_LINK_URL_MAX);
  if (!trimmed) return "";
  if (/^(https?:\/\/|mailto:|tel:)/i.test(trimmed)) return trimmed;
  return "";
};

const sanitizeFooterLink = (raw) => {
  const data = raw && typeof raw === "object" ? raw : {};
  const kind =
    typeof data.kind === "string" &&
    ALLOWED_FOOTER_LINK_KINDS.has(data.kind.toLowerCase())
      ? data.kind.toLowerCase()
      : "custom";
  const label = sanitizeWelcomeEmailString(
    data.label,
    "",
    FOOTER_LINK_LABEL_MAX,
  );
  const url = sanitizeFooterLinkUrl(data.url);
  // Drop entirely empty rows so admins can leave blanks in the editor
  // without polluting the rendered email.
  if (!url && !label) return null;
  const id =
    typeof data.id === "string" && data.id.trim()
      ? data.id.trim().slice(0, 60)
      : `link-${Math.random().toString(36).slice(2, 10)}`;
  return { id, kind, label, url };
};

const sanitizeFooterLinks = (raw) => {
  if (!Array.isArray(raw)) return [];
  return raw.map(sanitizeFooterLink).filter(Boolean).slice(0, FOOTER_LINKS_MAX);
};

const WELCOME_CUSTOM_DESCRIPTION_MAX = 600;

const sanitizeWelcomeCustomItem = (raw) => {
  const data = raw && typeof raw === "object" ? raw : {};
  const id =
    typeof data.id === "string" && data.id.trim()
      ? data.id.trim().slice(0, 60)
      : `item-${Math.random().toString(36).slice(2, 10)}`;
  const title = sanitizeWelcomeEmailString(
    data.title,
    "",
    WELCOME_EMAIL_FIELD_MAX,
  );
  const description = sanitizeWelcomeEmailString(
    data.description,
    "",
    WELCOME_CUSTOM_DESCRIPTION_MAX,
  );
  const rawPrice = Number(data.price);
  const price =
    Number.isFinite(rawPrice) && rawPrice > 0 ? Math.round(rawPrice) : 0;
  return {
    id,
    imageUrl: sanitizeWelcomeEmailImage(data.imageUrl),
    title,
    price,
    description,
  };
};

const sanitizeWelcomeProducts = (raw) => {
  const data = raw && typeof raw === "object" ? raw : {};
  const mode =
    data.mode === "manual"
      ? "manual"
      : data.mode === "custom"
        ? "custom"
        : "auto";
  const rawCount = Number(data.count);
  const count = Number.isFinite(rawCount)
    ? Math.max(1, Math.min(8, Math.round(rawCount)))
    : DEFAULT_WELCOME_EMAIL.products.count;
  const manualIds = Array.isArray(data.manualIds)
    ? data.manualIds
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const customItems = Array.isArray(data.customItems)
    ? data.customItems
        .map(sanitizeWelcomeCustomItem)
        // Drop empty rows (no image AND no title) so we never render blank
        // teaser cards in an email.
        .filter((item) => item.imageUrl || item.title)
        .slice(0, 8)
    : [];
  return {
    enabled: data.enabled !== false,
    mode,
    count,
    manualIds,
    customItems,
    sectionTitle: sanitizeWelcomeEmailString(
      data.sectionTitle,
      DEFAULT_WELCOME_EMAIL.products.sectionTitle,
      WELCOME_EMAIL_FIELD_MAX,
    ),
    showPrice: data.showPrice !== false,
  };
};

const sanitizeWelcomeDiscount = (raw) => {
  const data = raw && typeof raw === "object" ? raw : {};
  const source = data.source === "inline" ? "inline" : "linked";
  let inlineExpiresAt = "";
  if (typeof data.inlineExpiresAt === "string" && data.inlineExpiresAt.trim()) {
    const t = Date.parse(data.inlineExpiresAt);
    if (Number.isFinite(t)) inlineExpiresAt = new Date(t).toISOString();
  }
  return {
    enabled: Boolean(data.enabled),
    source,
    linkedCode: sanitizeWelcomeEmailString(
      data.linkedCode,
      "",
      60,
    ).toUpperCase(),
    inlineHeadline: sanitizeWelcomeEmailString(
      data.inlineHeadline,
      DEFAULT_WELCOME_EMAIL.discount.inlineHeadline,
      WELCOME_EMAIL_FIELD_MAX,
    ),
    inlineCode: sanitizeWelcomeEmailString(
      data.inlineCode,
      DEFAULT_WELCOME_EMAIL.discount.inlineCode,
      60,
    ).toUpperCase(),
    inlineDescription: sanitizeWelcomeEmailString(
      data.inlineDescription,
      DEFAULT_WELCOME_EMAIL.discount.inlineDescription,
      400,
    ),
    inlineExpiresAt,
  };
};

// Order-confirmation email — sent to customers on every order lifecycle
// transition (placed → confirmed, in_progress, out_for_delivery,
// received) plus the three refund states. The chrome (template / fonts
// / palette / logo / banner / footer) is shared across all 7 kinds;
// per-kind subject + heading + intro are independently editable so
// admins can tune voice per stage.
//
// The transport "purpose" is wired separately via #161 — sendOrderEmail
// passes purpose: "order" so the renderer prefers EMAIL_FROM_ORDER /
// EMAIL_REPLY_TO_ORDER when those env vars are set.
const DEFAULT_ORDER_EMAIL = {
  enabled: true,
  fromName: "Canvas Hub",
  fromEmail: "order@canvhub.com",
  replyTo: "order@canvhub.com",
  // Optional: when set, the server fires a separate "new order" alert
  // to this address every time a guest places an order. Empty string
  // disables the alert. Falls back to the ADMIN_ORDER_RECIPIENT env var
  // when blank in config.
  adminRecipient: "",
  primaryColor: "#1c1c1c",
  accentColor: "#7a7468",
  logoUrl: "",
  bannerUrl: "",
  showLogo: true,
  showBanner: false,
  bodyFont: "inter",
  template: "classic",
  headerAlign: "left",
  dividerStyle: "line",
  buttonStyle: "filled",
  footerTagline: "original Filipino paintings",
  footerLinks: [],
  trackButtonText: "Track shipment",
  reviewButtonText: "Write a review",
  // Per-kind overrides (subject / heading / intro). Each kind can be
  // muted independently via its `enabled` flag without disabling the
  // whole channel.
  kinds: Object.fromEntries(
    ORDER_EMAIL_KINDS.map((k) => [
      k,
      { enabled: true, ...DEFAULT_ORDER_EMAIL_KINDS[k] },
    ]),
  ),
};

const ORDER_EMAIL_SUBJECT_MAX = 200;
const ORDER_EMAIL_HEADING_MAX = 200;
const ORDER_EMAIL_INTRO_MAX = 4000;
const ORDER_EMAIL_FIELD_MAX = WELCOME_EMAIL_FIELD_MAX;

const sanitizeOrderEmailKind = (raw, key) => {
  const data = raw && typeof raw === "object" ? raw : {};
  const def = DEFAULT_ORDER_EMAIL_KINDS[key];
  return {
    enabled: data.enabled !== false,
    subject: sanitizeWelcomeEmailString(
      data.subject,
      def.subject,
      ORDER_EMAIL_SUBJECT_MAX,
    ),
    heading: sanitizeWelcomeEmailString(
      data.heading,
      def.heading,
      ORDER_EMAIL_HEADING_MAX,
    ),
    intro: sanitizeWelcomeEmailString(
      data.intro,
      def.intro,
      ORDER_EMAIL_INTRO_MAX,
    ),
  };
};

const sanitizeOrderEmailKinds = (raw) => {
  const data = raw && typeof raw === "object" ? raw : {};
  return Object.fromEntries(
    ORDER_EMAIL_KINDS.map((k) => [k, sanitizeOrderEmailKind(data[k], k)]),
  );
};

const sanitizeOrderEmail = (raw) => {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    enabled: data.enabled !== false,
    fromName: sanitizeWelcomeEmailString(
      data.fromName,
      DEFAULT_ORDER_EMAIL.fromName,
      ORDER_EMAIL_FIELD_MAX,
    ),
    fromEmail: sanitizeWelcomeEmailString(
      data.fromEmail,
      DEFAULT_ORDER_EMAIL.fromEmail,
      ORDER_EMAIL_FIELD_MAX,
    ),
    replyTo: sanitizeWelcomeEmailString(
      data.replyTo,
      DEFAULT_ORDER_EMAIL.replyTo,
      ORDER_EMAIL_FIELD_MAX,
    ),
    adminRecipient: sanitizeWelcomeEmailString(
      data.adminRecipient,
      DEFAULT_ORDER_EMAIL.adminRecipient,
      ORDER_EMAIL_FIELD_MAX,
    ),
    primaryColor: sanitizeWelcomeEmailString(
      data.primaryColor,
      DEFAULT_ORDER_EMAIL.primaryColor,
      30,
    ),
    accentColor: sanitizeWelcomeEmailString(
      data.accentColor,
      DEFAULT_ORDER_EMAIL.accentColor,
      30,
    ),
    logoUrl: sanitizeWelcomeEmailImage(data.logoUrl),
    bannerUrl: sanitizeWelcomeEmailImage(data.bannerUrl),
    showLogo: data.showLogo !== false,
    showBanner: Boolean(data.showBanner),
    bodyFont: sanitizeBodyFont(data.bodyFont),
    template: sanitizeWelcomeTemplate(data.template),
    headerAlign: sanitizeHeaderAlign(data.headerAlign),
    dividerStyle: sanitizeDividerStyle(data.dividerStyle),
    buttonStyle: sanitizeButtonStyle(data.buttonStyle),
    footerTagline: sanitizeWelcomeEmailString(
      data.footerTagline,
      DEFAULT_ORDER_EMAIL.footerTagline,
      ORDER_EMAIL_FIELD_MAX,
    ),
    footerLinks: sanitizeFooterLinks(data.footerLinks),
    trackButtonText: sanitizeWelcomeEmailString(
      data.trackButtonText,
      DEFAULT_ORDER_EMAIL.trackButtonText,
      80,
    ),
    reviewButtonText: sanitizeWelcomeEmailString(
      data.reviewButtonText,
      DEFAULT_ORDER_EMAIL.reviewButtonText,
      80,
    ),
    kinds: sanitizeOrderEmailKinds(data.kinds),
  };
};

const sanitizeSiteCopy = (raw) => {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    gallery: {
      eyebrow: sanitizeSiteCopyField(
        data.gallery?.eyebrow,
        SITE_COPY_DEFAULTS.gallery.eyebrow,
      ),
      title: sanitizeSiteCopyField(
        data.gallery?.title,
        SITE_COPY_DEFAULTS.gallery.title,
      ),
    },
    about: {
      eyebrow: sanitizeSiteCopyField(
        data.about?.eyebrow,
        SITE_COPY_DEFAULTS.about.eyebrow,
      ),
      title: sanitizeSiteCopyField(
        data.about?.title,
        SITE_COPY_DEFAULTS.about.title,
      ),
      body: sanitizeSiteCopyField(
        data.about?.body,
        SITE_COPY_DEFAULTS.about.body,
        SITE_COPY_BODY_MAX,
      ),
    },
    reviews: {
      eyebrow: sanitizeSiteCopyField(
        data.reviews?.eyebrow,
        SITE_COPY_DEFAULTS.reviews.eyebrow,
      ),
      title: sanitizeSiteCopyField(
        data.reviews?.title,
        SITE_COPY_DEFAULTS.reviews.title,
      ),
    },
    contact: {
      eyebrow: sanitizeSiteCopyField(
        data.contact?.eyebrow,
        SITE_COPY_DEFAULTS.contact.eyebrow,
      ),
      title: sanitizeSiteCopyField(
        data.contact?.title,
        SITE_COPY_DEFAULTS.contact.title,
      ),
    },
  };
};

// New-user modal defaults. All three triggers ship enabled so the
// modal pops up on first visit; admins can mute any individually
// from /admin → New-user modal. `voucherCode` is the promo (managed
// in Storefront → Promo codes / Marketing) the modal advertises;
// when blank the modal still opens but with no code attached.
// `emailCaptureEnabled` is OFF by default so launching the modal
// doesn't accidentally start a newsletter list — admins flip it on
// once they're ready to collect emails for the voucher.
const DEFAULT_NEW_USER_MODAL = {
  enabled: true,
  triggers: {
    time: true,
    scroll: true,
    exitIntent: true,
  },
  timeSeconds: 8,
  scrollPercent: 30,
  voucherCode: "WELCOME10",
  emailCaptureEnabled: false,
  headline: "Welcome to Canvas Hub",
  body:
    "First time here? Sign up with Google to keep your favourites, " +
    "or grab your welcome discount before you browse.",
};

// Default WELCOME10 promo seeded on first read. Idempotent — only added
// if no WELCOME10 already exists in the admin's promo list.
const WELCOME10_PROMO_DEFAULT = {
  code: "WELCOME10",
  type: "percent",
  value: 10,
  freeShipping: false,
  minSpend: 0,
  usageLimit: null,
  usageCount: 0,
  expiresAt: null,
  enabled: true,
  description: "Welcome offer for new visitors",
};

const DEFAULT_CONFIG = {
  announcement: {
    enabled: false,
    message: "",
    link: "",
    backgroundColor: "#1f2937",
    textColor: "#ffffff",
    showFreeShipping: true,
    showPromoCodes: true,
    promoTemplate: "Use code {code} for {discount} off{minSpend}",
    rotateSeconds: 5,
    size: "normal",
    bold: true,
    animation: "fade",
    marqueeSpeedSeconds: 18,
    marqueeDirection: "left",
    gradientEnabled: false,
    gradientFrom: "#1f2937",
    gradientTo: "#0ea5e9",
    iconPrefix: "",
    dismissable: false,
  },
  freeShipping: {
    enabled: true,
    threshold: 8000,
    shippingFee: 500,
  },
  promoCodes: [],
  chat: {
    enabled: true,
    welcome: DEFAULT_CHAT_WELCOME,
    agentHandoff: true,
    faqs: DEFAULT_CHAT_FAQS,
  },
  siteCopy: SITE_COPY_DEFAULTS,
  welcomeEmail: DEFAULT_WELCOME_EMAIL,
  orderEmail: DEFAULT_ORDER_EMAIL,
  newUserModal: DEFAULT_NEW_USER_MODAL,
};

const sanitizeNewUserModal = (raw) => {
  const data = raw && typeof raw === "object" ? raw : {};
  const triggersRaw =
    data.triggers && typeof data.triggers === "object" ? data.triggers : {};
  return {
    enabled: data.enabled !== false,
    triggers: {
      time: triggersRaw.time !== false,
      scroll: triggersRaw.scroll !== false,
      exitIntent: triggersRaw.exitIntent !== false,
    },
    timeSeconds: Math.min(
      120,
      Math.max(
        1,
        Math.floor(
          Number(data.timeSeconds) || DEFAULT_NEW_USER_MODAL.timeSeconds,
        ),
      ),
    ),
    scrollPercent: Math.min(
      95,
      Math.max(
        5,
        Math.floor(
          Number(data.scrollPercent) || DEFAULT_NEW_USER_MODAL.scrollPercent,
        ),
      ),
    ),
    voucherCode: String(data.voucherCode ?? "")
      .trim()
      .toUpperCase()
      .slice(0, 30),
    emailCaptureEnabled: data.emailCaptureEnabled === true,
    headline: String(data.headline ?? DEFAULT_NEW_USER_MODAL.headline).slice(
      0,
      120,
    ),
    body: String(data.body ?? DEFAULT_NEW_USER_MODAL.body).slice(0, 400),
  };
};

const sanitizeConfig = (raw) => {
  const data = raw && typeof raw === "object" ? raw : {};
  const announcement =
    data.announcement && typeof data.announcement === "object"
      ? data.announcement
      : {};
  const freeShipping =
    data.freeShipping && typeof data.freeShipping === "object"
      ? data.freeShipping
      : {};
  const promoCodes = Array.isArray(data.promoCodes) ? data.promoCodes : [];
  const chatRaw = data.chat && typeof data.chat === "object" ? data.chat : {};
  const faqsExplicit = Array.isArray(chatRaw.faqs);
  const sanitizedFaqs = sanitizeChatFaqs(chatRaw.faqs);

  return {
    announcement: {
      enabled: Boolean(announcement.enabled),
      message: String(announcement.message ?? "").slice(0, 240),
      link: String(announcement.link ?? "").slice(0, 500),
      backgroundColor: String(
        announcement.backgroundColor ??
          DEFAULT_CONFIG.announcement.backgroundColor,
      ).slice(0, 30),
      textColor: String(
        announcement.textColor ?? DEFAULT_CONFIG.announcement.textColor,
      ).slice(0, 30),
      showFreeShipping: announcement.showFreeShipping !== false,
      showPromoCodes: announcement.showPromoCodes !== false,
      promoTemplate: String(
        announcement.promoTemplate ?? DEFAULT_CONFIG.announcement.promoTemplate,
      ).slice(0, 200),
      rotateSeconds: Math.min(
        60,
        Math.max(0, Math.floor(Number(announcement.rotateSeconds) || 0)),
      ),
      size: ["compact", "normal", "large"].includes(announcement.size)
        ? announcement.size
        : "normal",
      bold: announcement.bold !== false,
      animation: ["fade", "marquee", "slide", "typewriter", "pulse"].includes(
        announcement.animation,
      )
        ? announcement.animation
        : "fade",
      marqueeSpeedSeconds: Math.min(
        120,
        Math.max(3, Math.floor(Number(announcement.marqueeSpeedSeconds) || 18)),
      ),
      marqueeDirection:
        announcement.marqueeDirection === "right" ? "right" : "left",
      gradientEnabled: Boolean(announcement.gradientEnabled),
      gradientFrom: String(
        announcement.gradientFrom ?? DEFAULT_CONFIG.announcement.gradientFrom,
      ).slice(0, 30),
      gradientTo: String(
        announcement.gradientTo ?? DEFAULT_CONFIG.announcement.gradientTo,
      ).slice(0, 30),
      iconPrefix: String(announcement.iconPrefix ?? "").slice(0, 8),
      dismissable: Boolean(announcement.dismissable),
    },
    freeShipping: {
      enabled: freeShipping.enabled !== false,
      threshold: Math.max(0, Math.floor(Number(freeShipping.threshold) || 0)),
      shippingFee: Math.max(
        0,
        Math.floor(Number(freeShipping.shippingFee) || 0),
      ),
    },
    chat: {
      enabled: chatRaw.enabled !== false,
      welcome: (typeof chatRaw.welcome === "string" && chatRaw.welcome.trim()
        ? chatRaw.welcome
        : DEFAULT_CHAT_WELCOME
      ).slice(0, CHAT_WELCOME_MAX),
      agentHandoff: chatRaw.agentHandoff !== false,
      faqs: faqsExplicit ? sanitizedFaqs : DEFAULT_CHAT_FAQS,
    },
    siteCopy: sanitizeSiteCopy(data.siteCopy),
    welcomeEmail: sanitizeWelcomeEmail(data.welcomeEmail),
    orderEmail: sanitizeOrderEmail(data.orderEmail),
    promoCodes: promoCodes
      .map((p) => {
        if (!p || typeof p !== "object") return null;
        const code = String(p.code ?? "")
          .trim()
          .toUpperCase()
          .slice(0, 30);
        if (!code) return null;
        const allowedTypes = new Set([
          "percent",
          "fixed",
          "flat",
          "free_shipping",
        ]);
        const type = allowedTypes.has(p.type) ? p.type : "percent";
        const rawValue = Math.max(0, Math.floor(Number(p.value) || 0));
        // For free_shipping the value field is unused (always 0).
        // For flat/fixed/percent, the value must be > 0; percent capped at 100.
        let value = rawValue;
        if (type === "free_shipping") {
          value = 0;
        } else {
          if (value <= 0) return null;
          if (type === "percent" && value > 100) return null;
        }
        return {
          code,
          type,
          value,
          freeShipping:
            type === "free_shipping" ? true : Boolean(p.freeShipping),
          minSpend: Math.max(0, Math.floor(Number(p.minSpend) || 0)),
          usageLimit:
            p.usageLimit === null || p.usageLimit === undefined
              ? null
              : Math.max(0, Math.floor(Number(p.usageLimit) || 0)) || null,
          usageCount: Math.max(0, Math.floor(Number(p.usageCount) || 0)),
          expiresAt:
            typeof p.expiresAt === "string" && p.expiresAt ? p.expiresAt : null,
          enabled: p.enabled !== false,
          description: String(p.description ?? "").slice(0, 200),
          // `personal: true` marks per-user reward codes minted by the
          // birthday/anniversary/referral flow. They live in the same
          // promoCodes array so checkout validation works, but they
          // must not leak into publicView() (would expose other
          // customers' codes to every visitor).
          personal: p.personal === true,
        };
      })
      .filter(Boolean),
    newUserModal: sanitizeNewUserModal(data.newUserModal),
    // Persisted internal map of one-time migrations applied to this
    // config — not exposed publicly. Keys here mark a migration as done
    // so we don't re-run it on every read.
    _seedMigrations:
      data._seedMigrations && typeof data._seedMigrations === "object"
        ? { ...data._seedMigrations }
        : {},
  };
};

const readConfig = async (store) => {
  const raw = await store.get(CONFIG_KEY, { type: "json" });
  return sanitizeConfig(raw || DEFAULT_CONFIG);
};

// One-shot bootstrap so the new-user modal pops with a working voucher
// the very first time it's served on an existing config. Adds WELCOME10
// to promo codes if missing, attaches it to the modal if no other
// voucher is set, and stamps `_seedMigrations.welcome10v1` so this only
// runs once. Safe to call on every read — no-ops once the flag is set.
const ensureWelcome10Bootstrap = async (store, config) => {
  if (config._seedMigrations?.welcome10v1) return config;
  const code = WELCOME10_PROMO_DEFAULT.code;
  const hasWelcome10 = config.promoCodes.some((p) => p.code === code);
  const promoCodes = hasWelcome10
    ? config.promoCodes
    : [...config.promoCodes, WELCOME10_PROMO_DEFAULT];
  const voucherCode = config.newUserModal.voucherCode || code;
  const next = sanitizeConfig({
    ...config,
    promoCodes,
    newUserModal: { ...config.newUserModal, voucherCode },
    _seedMigrations: { ...config._seedMigrations, welcome10v1: true },
  });
  try {
    await store.setJSON(CONFIG_KEY, next);
  } catch {
    // If the write fails (rare KV edge case), still return the seeded
    // shape so this request renders correctly — next read will retry.
  }
  return next;
};

// Strip out everything but the bits the public /preview/<id> landing page
// needs so we never leak the welcome email's transport config (api keys,
// reply-to, draft body, etc.) on the public storefront-config endpoint.
const publicWelcomePreview = (welcome) => {
  if (!welcome || welcome.products?.mode !== "custom") {
    return { customItems: [] };
  }
  const customItems = Array.isArray(welcome.products.customItems)
    ? welcome.products.customItems.map((it) => ({
        id: String(it.id || ""),
        imageUrl: String(it.imageUrl || ""),
        title: String(it.title || ""),
        price: Number(it.price) || 0,
        description: String(it.description || ""),
      }))
    : [];
  return {
    customItems,
    showPrice: welcome.products.showPrice !== false,
    ctaLabel: String(welcome.ctaLabel || "Browse the collection"),
    ctaUrl: String(welcome.ctaUrl || ""),
    primaryColor: String(welcome.primaryColor || "#1c1c1c"),
    accentColor: String(welcome.accentColor || "#7a7468"),
  };
};

const publicView = (config) => ({
  announcement: config.announcement,
  freeShipping: config.freeShipping,
  siteCopy: config.siteCopy,
  promoCodes: config.promoCodes
    .filter((p) => p.enabled)
    .filter((p) => p.personal !== true)
    .filter((p) => p.usageLimit === null || p.usageCount < p.usageLimit)
    .filter(
      (p) => !p.expiresAt || new Date(p.expiresAt).getTime() >= Date.now(),
    )
    .map((p) => ({
      code: p.code,
      type: p.type,
      value: p.value,
      freeShipping: Boolean(p.freeShipping),
      minSpend: p.minSpend,
      expiresAt: p.expiresAt,
      description: p.description,
    })),
  chat: config.chat,
  welcomeEmailPreview: publicWelcomePreview(config.welcomeEmail),
  newUserModal: {
    enabled: config.newUserModal.enabled,
    triggers: { ...config.newUserModal.triggers },
    timeSeconds: config.newUserModal.timeSeconds,
    scrollPercent: config.newUserModal.scrollPercent,
    voucherCode: config.newUserModal.voucherCode,
    emailCaptureEnabled: config.newUserModal.emailCaptureEnabled,
    headline: config.newUserModal.headline,
    body: config.newUserModal.body,
  },
});

const handle = async ({ request, env }) => {
  setCloudflareContext(env);
  if (!env.STOREFRONT_CONFIG) {
    return json(500, { error: "STOREFRONT_CONFIG KV binding missing" });
  }
  const store = makeStore(env.STOREFRONT_CONFIG);
  const event = await buildLambdaEvent(request);
  const method = request.method;

  try {
    if (method === "GET") {
      const params = event.queryStringParameters || {};
      const initial = await readConfig(store);
      const config = await ensureWelcome10Bootstrap(store, initial);
      if (params.admin === "1") {
        if (!(await isAuthenticated(event))) {
          return json(401, { error: "Not authenticated" });
        }
        return json(200, { config });
      }
      return json(200, { config: publicView(config) });
    }

    if (method === "POST") {
      if (!(await isAuthenticated(event))) {
        return json(401, { error: "Not authenticated" });
      }
      const body = parseBody(event.body);
      const action = body.action;
      const existing = await readConfig(store);

      if (action === "update-announcement") {
        const next = sanitizeConfig({
          ...existing,
          announcement: { ...existing.announcement, ...body.announcement },
        });
        await store.setJSON(CONFIG_KEY, next);
        return json(200, { config: next });
      }

      if (action === "update-chat") {
        const next = sanitizeConfig({
          ...existing,
          chat: { ...existing.chat, ...body.chat },
        });
        await store.setJSON(CONFIG_KEY, next);
        return json(200, { config: next });
      }

      if (action === "send-welcome-test") {
        if (!isEmailConfigured()) {
          return json(400, {
            error:
              "Email transport not configured. Set RESEND_API_KEY (or BREVO_API_KEY) and EMAIL_FROM (or EMAIL_FROM_<PURPOSE>) in Cloudflare Pages env vars.",
          });
        }
        const to = normalizeEmail(body.to);
        if (!isValidEmail(to)) {
          return json(400, { error: "Enter a valid recipient email" });
        }
        // Use the draft welcomeEmail from the body if provided, otherwise the
        // currently-saved one. Always force-enable for a test send so admins
        // can preview the template even before flipping the toggle on.
        const draft =
          body.welcomeEmail && typeof body.welcomeEmail === "object"
            ? sanitizeWelcomeEmail({
                ...existing.welcomeEmail,
                ...body.welcomeEmail,
              })
            : existing.welcomeEmail;
        const result = await sendWelcomeEmail({
          welcome: { ...draft, enabled: true },
          user: {
            email: to,
            name: String(body.name || "Test collector").slice(0, 80),
          },
          override: { subjectPrefix: "[Test] " },
        });
        if (result?.delivered) {
          return json(200, { ok: true, provider: result.provider });
        }
        return json(502, {
          error:
            result?.error ||
            result?.reason ||
            "Could not send test email (unknown error)",
        });
      }

      if (action === "update-welcome-email") {
        const incoming =
          body.welcomeEmail && typeof body.welcomeEmail === "object"
            ? body.welcomeEmail
            : {};
        const next = sanitizeConfig({
          ...existing,
          welcomeEmail: { ...existing.welcomeEmail, ...incoming },
        });
        await store.setJSON(CONFIG_KEY, next);
        return json(200, { config: next });
      }

      if (action === "update-order-email") {
        const incoming =
          body.orderEmail && typeof body.orderEmail === "object"
            ? body.orderEmail
            : {};
        // Deep-merge the kinds map so a partial update (e.g. "just the
        // refund_failed intro") doesn't reset the other six kinds back to
        // their hard-coded defaults.
        const mergedKinds = { ...(existing.orderEmail.kinds || {}) };
        if (incoming.kinds && typeof incoming.kinds === "object") {
          for (const [k, v] of Object.entries(incoming.kinds)) {
            mergedKinds[k] = {
              ...(existing.orderEmail.kinds?.[k] || {}),
              ...(v && typeof v === "object" ? v : {}),
            };
          }
        }
        const next = sanitizeConfig({
          ...existing,
          orderEmail: {
            ...existing.orderEmail,
            ...incoming,
            kinds: mergedKinds,
          },
        });
        await store.setJSON(CONFIG_KEY, next);
        return json(200, { config: next });
      }

      if (action === "send-order-test") {
        if (!isEmailConfigured("order")) {
          return json(400, {
            error:
              "Email transport not configured. Set RESEND_API_KEY (or BREVO_API_KEY) and EMAIL_FROM_ORDER (or EMAIL_FROM) in Cloudflare Pages env vars.",
          });
        }
        const to = normalizeEmail(body.to);
        if (!isValidEmail(to)) {
          return json(400, { error: "Enter a valid recipient email" });
        }
        const kind = ORDER_EMAIL_KINDS.includes(body.kind)
          ? body.kind
          : "confirmed";
        // Use the draft orderEmail from the body when provided, otherwise
        // the currently-saved one. Always force-enable for a test send.
        const draft =
          body.orderEmail && typeof body.orderEmail === "object"
            ? sanitizeOrderEmail({
                ...existing.orderEmail,
                ...body.orderEmail,
                kinds: {
                  ...existing.orderEmail.kinds,
                  ...(body.orderEmail.kinds || {}),
                },
              })
            : existing.orderEmail;
        const result = await sendOrderTestEmail({
          kind,
          to,
          name: String(body.name || "Test collector").slice(0, 80),
          orderEmail: draft,
        });
        if (result?.delivered) {
          return json(200, { ok: true, result });
        }
        return json(500, {
          error:
            result?.error ||
            result?.reason ||
            "Could not send test email. Check the Cloudflare logs.",
        });
      }

      if (action === "update-site-copy") {
        // Merge with existing so a partial / malformed body doesn't wipe
        // previously-saved admin customisations \u2014 same pattern the other
        // update-* actions use.
        const incoming =
          body.siteCopy && typeof body.siteCopy === "object"
            ? body.siteCopy
            : {};
        const next = sanitizeConfig({
          ...existing,
          siteCopy: {
            gallery: {
              ...existing.siteCopy.gallery,
              ...(incoming.gallery ?? {}),
            },
            about: { ...existing.siteCopy.about, ...(incoming.about ?? {}) },
            reviews: {
              ...existing.siteCopy.reviews,
              ...(incoming.reviews ?? {}),
            },
            contact: {
              ...existing.siteCopy.contact,
              ...(incoming.contact ?? {}),
            },
          },
        });
        await store.setJSON(CONFIG_KEY, next);
        return json(200, { config: next });
      }

      if (action === "update-free-shipping") {
        const next = sanitizeConfig({
          ...existing,
          freeShipping: { ...existing.freeShipping, ...body.freeShipping },
        });
        await store.setJSON(CONFIG_KEY, next);
        return json(200, { config: next });
      }

      if (action === "upsert-promo") {
        const incoming = body.promo;
        if (!incoming || typeof incoming !== "object") {
          return json(400, { error: "Invalid promo" });
        }
        const code = String(incoming.code ?? "")
          .trim()
          .toUpperCase();
        if (!code) return json(400, { error: "Code required" });
        const others = existing.promoCodes.filter((p) => p.code !== code);
        const previous =
          existing.promoCodes.find((p) => p.code === code) || null;
        const merged = {
          code,
          type: incoming.type ?? previous?.type ?? "percent",
          value: incoming.value ?? previous?.value ?? 0,
          freeShipping:
            incoming.freeShipping === undefined
              ? Boolean(previous?.freeShipping)
              : Boolean(incoming.freeShipping),
          minSpend: incoming.minSpend ?? previous?.minSpend ?? 0,
          usageLimit:
            incoming.usageLimit === undefined
              ? (previous?.usageLimit ?? null)
              : incoming.usageLimit,
          usageCount: previous?.usageCount ?? 0,
          expiresAt:
            incoming.expiresAt === undefined
              ? (previous?.expiresAt ?? null)
              : incoming.expiresAt,
          enabled:
            incoming.enabled === undefined
              ? (previous?.enabled ?? true)
              : Boolean(incoming.enabled),
          description: incoming.description ?? previous?.description ?? "",
        };
        const next = sanitizeConfig({
          ...existing,
          promoCodes: [...others, merged],
        });
        await store.setJSON(CONFIG_KEY, next);
        return json(200, { config: next });
      }

      if (action === "delete-promo") {
        const code = String(body.code ?? "")
          .trim()
          .toUpperCase();
        if (!code) return json(400, { error: "Code required" });
        const next = sanitizeConfig({
          ...existing,
          promoCodes: existing.promoCodes.filter((p) => p.code !== code),
        });
        await store.setJSON(CONFIG_KEY, next);
        return json(200, { config: next });
      }

      if (action === "update-newuser-modal") {
        const incoming =
          body.newUserModal && typeof body.newUserModal === "object"
            ? body.newUserModal
            : {};
        const merged = {
          ...existing.newUserModal,
          ...incoming,
          triggers: {
            ...existing.newUserModal.triggers,
            ...(incoming.triggers && typeof incoming.triggers === "object"
              ? incoming.triggers
              : {}),
          },
        };
        const next = sanitizeConfig({
          ...existing,
          newUserModal: merged,
        });
        await store.setJSON(CONFIG_KEY, next);
        return json(200, { config: next });
      }

      if (action === "auto-create-welcome10") {
        // One-shot helper for the New-user modal admin page: idempotently
        // creates the WELCOME10 promo (10% off, no min spend) and attaches
        // it to the modal. If WELCOME10 already exists, only the modal's
        // `voucherCode` is updated — we don't touch the promo's existing
        // discount / limits in case the admin tuned them.
        const code = "WELCOME10";
        const previous =
          existing.promoCodes.find((p) => p.code === code) || null;
        const merged = previous
          ? previous
          : {
              code,
              type: "percent",
              value: 10,
              freeShipping: false,
              minSpend: 0,
              usageLimit: null,
              usageCount: 0,
              expiresAt: null,
              enabled: true,
              description: "Welcome offer for new visitors",
            };
        const others = existing.promoCodes.filter((p) => p.code !== code);
        const next = sanitizeConfig({
          ...existing,
          promoCodes: [...others, merged],
          newUserModal: {
            ...existing.newUserModal,
            voucherCode: code,
          },
        });
        await store.setJSON(CONFIG_KEY, next);
        return json(200, { config: next, created: !previous });
      }

      if (action === "increment-usage") {
        const code = String(body.code ?? "")
          .trim()
          .toUpperCase();
        if (!code) return json(400, { error: "Code required" });
        const idx = existing.promoCodes.findIndex((p) => p.code === code);
        if (idx === -1) return json(404, { error: "Promo not found" });
        existing.promoCodes[idx] = {
          ...existing.promoCodes[idx],
          usageCount: existing.promoCodes[idx].usageCount + 1,
        };
        await store.setJSON(CONFIG_KEY, existing);
        return json(200, { config: existing });
      }

      return json(400, { error: "Unknown action" });
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    console.error("storefront-config error:", error);
    return json(500, { error: "Could not manage storefront config" });
  }
};

export const onRequestGet = handle;
export const onRequestPost = handle;
