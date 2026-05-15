import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_CHAT_FAQS,
  DEFAULT_CHAT_WELCOME,
  sanitizeChatFaqs,
  type ChatFaqItem,
} from "@/lib/chat-faqs";
import {
  DEFAULT_SHIPPING_RATES,
  DEFAULT_LALAMOVE_FARE,
  type ShippingRate,
  type LalamoveFareConfig,
} from "@/lib/shipment";
import type { ShippingZone } from "@/lib/ph-regions";

export type AnnouncementSize = "compact" | "normal" | "large";
export type AnnouncementAnimation =
  | "fade"
  | "marquee"
  | "slide"
  | "typewriter"
  | "pulse";
export type AnnouncementMarqueeDirection = "left" | "right";

export interface AnnouncementConfig {
  enabled: boolean;
  message: string;
  link: string;
  backgroundColor: string;
  textColor: string;
  showFreeShipping: boolean;
  showPromoCodes: boolean;
  promoTemplate: string;
  rotateSeconds: number;
  size: AnnouncementSize;
  bold: boolean;
  animation: AnnouncementAnimation;
  marqueeSpeedSeconds: number;
  marqueeDirection: AnnouncementMarqueeDirection;
  gradientEnabled: boolean;
  gradientFrom: string;
  gradientTo: string;
  iconPrefix: string;
  dismissable: boolean;
}

export interface FreeShippingConfig {
  enabled: boolean;
  threshold: number;
  shippingFee: number;
}

export type PromoCodeType = "percent" | "fixed" | "flat" | "free_shipping";

export interface PromoCodePublic {
  code: string;
  type: PromoCodeType;
  value: number;
  freeShipping: boolean;
  minSpend: number;
  expiresAt: string | null;
  description: string;
  // 0 means unlimited per customer (back-compat with codes that pre-date
  // the per-customer cap). Surfaced publicly so the cart can warn the
  // shopper before they hit the wall at checkout.
  maxRedemptionsPerCustomer?: number;
}

export interface ChatConfig {
  enabled: boolean;
  welcome: string;
  agentHandoff: boolean;
  faqs: ChatFaqItem[];
}

// Section-level copy that the admin can override from /admin → Site copy.
// Default values match the strings hard-coded in the React components so
// the storefront falls back gracefully when the admin hasn't customised
// anything yet.
export interface SiteCopySectionTwo {
  eyebrow: string;
  title: string;
}

export interface SiteCopyAbout {
  eyebrow: string;
  title: string;
  body: string;
}

export interface SiteCopyMadeToOrder {
  heading: string;
  body: string;
}

export interface SiteCopyProductInfo {
  shippingLabel: string;
  shippingBody: string;
  careLabel: string;
  careBody: string;
}

export interface SiteCopy {
  gallery: SiteCopySectionTwo;
  about: SiteCopyAbout;
  reviews: SiteCopySectionTwo;
  contact: SiteCopySectionTwo;
  newsletter: SiteCopySectionTwo;
  madeToOrderNotice: SiteCopyMadeToOrder;
  productInfo: SiteCopyProductInfo;
}

export const DEFAULT_SITE_COPY: SiteCopy = {
  gallery: {
    eyebrow: "The Collection",
    title: "Our Collection",
  },
  about: {
    eyebrow: "Our Story",
    title: "About Canvas Hub",
    body: "Every painting has a soul — a story waiting to be told. We bring affordable, hand-crafted art to homes and spaces that deserve beauty. Each piece is made to order, ensuring that what you receive is as unique as your vision.",
  },
  reviews: {
    eyebrow: "What customers say",
    title: "Reviews from our collectors",
  },
  contact: {
    eyebrow: "Get in touch",
    title: "Contact us",
  },
  newsletter: {
    eyebrow: "Get updates",
    title:
      "New drops, restocks, and the occasional studio update \u2014 straight to your inbox.",
  },
  madeToOrderNotice: {
    heading: "Made to order",
    body: "This piece is painted to order. Place your order today and the artist will start once payment is confirmed — typical turnaround is 2–4 weeks before it ships.",
  },
  productInfo: {
    shippingLabel: "Shipping",
    shippingBody:
      "Lalamove courier within Luzon — live tracking, fare paid to the rider on delivery.",
    careLabel: "Care",
    careBody: "Keep out of direct sunlight and humid spaces for longevity.",
  },
};

export interface NewUserModalTriggers {
  time: boolean;
  scroll: boolean;
  exitIntent: boolean;
}

// Legacy 2-variant treatment kept for back-compat with KV blobs written
// before the N-variant builder shipped. New code should use
// `variants: NewUserModalVariant[]` instead.
export interface NewUserModalVariantB {
  enabled: boolean;
  weight: number;
  headline: string;
  body: string;
  voucherCode: string;
}

// One leaf in the N-way A/B/C/… split. Defaults render as variants A and
// B so existing localStorage `canvhub:newuser-modal:variant` assignments
// stay valid after the rollout.
export interface NewUserModalVariant {
  id: string;
  label: string;
  weight: number;
  headline: string;
  body: string;
  voucherCode: string;
}

export interface NewUserModalConfig {
  enabled: boolean;
  triggers: NewUserModalTriggers;
  timeSeconds: number;
  scrollPercent: number;
  voucherCode: string;
  emailCaptureEnabled: boolean;
  headline: string;
  body: string;
  variantB: NewUserModalVariantB;
  // Authoritative list when present. variants[0] mirrors the top-level
  // headline/body/voucherCode (variant A); variants[1] (when it exists)
  // mirrors `variantB`. Up to 8 entries.
  variants: NewUserModalVariant[];
  // When false (the default) every visitor sees variants[0]. When true
  // the modal hashes the visitor id and buckets by cumulative weight.
  variantsEnabled: boolean;
}

export const DEFAULT_NEW_USER_MODAL_VARIANT_B: NewUserModalVariantB = {
  enabled: false,
  weight: 50,
  headline: "Your welcome gift inside",
  body:
    "New here? Drop your email and we'll send a discount code you can " +
    "use on your first piece.",
  voucherCode: "",
};

// Default A/B leaf — used as the seed when an admin first turns on the
// builder and as the fallback shape when an incoming `variants[i]` is
// missing fields.
export const DEFAULT_NEW_USER_MODAL_VARIANT: NewUserModalVariant = {
  id: "a",
  label: "Variant A",
  weight: 100,
  headline: "Welcome to Canvas Hub",
  body:
    "First time here? Sign up with Google to keep your favourites, " +
    "or grab your welcome discount before you browse.",
  voucherCode: "",
};

// Maximum variants the admin can configure. Two is the historical
// minimum (A/B); 8 keeps the picker UI manageable and the cumulative
// weight math trivially correct.
export const NEW_USER_MODAL_MAX_VARIANTS = 8;

// Display labels for new variants spun up by the admin. Reads as
// `Variant A`, `Variant B`, … and wraps for ids beyond Z.
export const newUserModalVariantLabel = (index: number): string => {
  const letter = String.fromCharCode(65 + (index % 26));
  return `Variant ${letter}`;
};

export const newUserModalVariantId = (index: number): string =>
  String.fromCharCode(97 + (index % 26));

export const DEFAULT_NEW_USER_MODAL: NewUserModalConfig = {
  enabled: true,
  triggers: {
    time: true,
    scroll: true,
    exitIntent: true,
  },
  timeSeconds: 8,
  scrollPercent: 30,
  voucherCode: "",
  emailCaptureEnabled: false,
  headline: "Welcome to Canvas Hub",
  body:
    "First time here? Sign up with Google to keep your favourites, " +
    "or grab your welcome discount before you browse.",
  variantB: DEFAULT_NEW_USER_MODAL_VARIANT_B,
  variants: [
    {
      id: "a",
      label: "Variant A",
      weight: 100,
      headline: "Welcome to Canvas Hub",
      body:
        "First time here? Sign up with Google to keep your favourites, " +
        "or grab your welcome discount before you browse.",
      voucherCode: "",
    },
  ],
  variantsEnabled: false,
};

export interface DailyFeatureConfig {
  enabled: boolean;
  productId: string;
  percent: number;
  headline: string;
}

export const DEFAULT_DAILY_FEATURE: DailyFeatureConfig = {
  enabled: false,
  productId: "",
  percent: 5,
  headline: "Piece of the day",
};

/**
 * Today's auto-generated daily-feature promo. Derived server-side based on
 * the active dailyFeature config + UTC date so customers see the same code
 * worldwide for the same calendar day.
 */
export interface DailyFeatureToday {
  code: string;
  productId: string;
  percent: number;
  expiresAt: string;
}

export type ThankYouAssetType = "image" | "video";

export interface ThankYouConfig {
  enabled: boolean;
  assetUrl: string;
  assetType: ThankYouAssetType;
  message: string;
}

export const DEFAULT_THANK_YOU: ThankYouConfig = {
  enabled: false,
  assetUrl: "",
  assetType: "image",
  message: "Thank you for being one of the first to support Canvas Hub.",
};

export interface VacationModeConfig {
  enabled: boolean;
  // ISO YYYY-MM-DD or "" for "no return date set yet".
  returnDate: string;
  // Optional admin override for the customer-facing banner text. When
  // empty, the storefront falls back to a default phrasing built from
  // returnDate.
  message: string;
}

export const DEFAULT_VACATION_MODE: VacationModeConfig = {
  enabled: false,
  returnDate: "",
  message: "",
};

// Optional cinematic landing-page video. Rendered as a full-bleed
// "montage" section between the daily-feature carousel and the
// collection scene on the homepage. When `videoUrl` is empty (or
// `enabled` is false) the section renders nothing — the homepage
// degrades gracefully so this can ship before the admin uploads a
// final asset.
export interface LandingVideoConfig {
  enabled: boolean;
  videoUrl: string;
  posterUrl: string;
  eyebrow: string;
  headline: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
}

export const DEFAULT_LANDING_VIDEO: LandingVideoConfig = {
  enabled: false,
  videoUrl: "",
  posterUrl: "",
  eyebrow: "Behind the brush",
  headline: "Watch the studio in motion.",
  description:
    "A short montage of every painting coming to life — from blank canvas to the wall it was made for.",
  ctaLabel: "Browse the collection",
  ctaHref: "/collection",
};

export interface StorefrontConfig {
  announcement: AnnouncementConfig;
  freeShipping: FreeShippingConfig;
  lalamoveFare: LalamoveFareConfig;
  shippingRates: ShippingRate[];
  promoCodes: PromoCodePublic[];
  chat: ChatConfig;
  siteCopy: SiteCopy;
  newUserModal: NewUserModalConfig;
  dailyFeature: DailyFeatureConfig;
  dailyFeatureToday: DailyFeatureToday | null;
  thankYou: ThankYouConfig;
  vacationMode: VacationModeConfig;
  landingVideo: LandingVideoConfig;
}

const DEFAULT_CONFIG: StorefrontConfig = {
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
  lalamoveFare: DEFAULT_LALAMOVE_FARE,
  shippingRates: DEFAULT_SHIPPING_RATES,
  promoCodes: [],
  chat: {
    enabled: true,
    welcome: DEFAULT_CHAT_WELCOME,
    agentHandoff: true,
    faqs: DEFAULT_CHAT_FAQS,
  },
  siteCopy: DEFAULT_SITE_COPY,
  newUserModal: DEFAULT_NEW_USER_MODAL,
  dailyFeature: DEFAULT_DAILY_FEATURE,
  dailyFeatureToday: null,
  thankYou: DEFAULT_THANK_YOU,
  vacationMode: DEFAULT_VACATION_MODE,
  landingVideo: DEFAULT_LANDING_VIDEO,
};

const mergeDailyFeature = (raw: unknown): DailyFeatureConfig => {
  const data = (
    raw && typeof raw === "object" ? raw : {}
  ) as Partial<DailyFeatureConfig>;
  return {
    enabled: data.enabled === true,
    productId: typeof data.productId === "string" ? data.productId : "",
    percent: Number.isFinite(data.percent)
      ? Math.min(50, Math.max(1, Math.floor(Number(data.percent))))
      : DEFAULT_DAILY_FEATURE.percent,
    headline:
      typeof data.headline === "string" && data.headline.trim()
        ? data.headline.trim().slice(0, 80)
        : DEFAULT_DAILY_FEATURE.headline,
  };
};

const mergeDailyFeatureToday = (raw: unknown): DailyFeatureToday | null => {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<DailyFeatureToday>;
  if (!data.code || !data.productId || !data.expiresAt) return null;
  return {
    code: String(data.code),
    productId: String(data.productId),
    percent: Number(data.percent) || 0,
    expiresAt: String(data.expiresAt),
  };
};

const mergeVacationMode = (raw: unknown): VacationModeConfig => {
  const data = (
    raw && typeof raw === "object" ? raw : {}
  ) as Partial<VacationModeConfig>;
  const dateRaw = String(data.returnDate ?? "").trim();
  const returnDate = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : "";
  return {
    enabled: data.enabled === true,
    returnDate,
    message:
      typeof data.message === "string" ? data.message.trim().slice(0, 280) : "",
  };
};

// Only allow http(s) URLs (or empty) so admin pastes can't slip a
// `javascript:` / `data:` URI through into a video element.
const sanitizeMediaUrl = (raw: unknown, max = 2000): string => {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) return "";
  return trimmed.slice(0, max);
};

const mergeLandingVideo = (raw: unknown): LandingVideoConfig => {
  const data = (
    raw && typeof raw === "object" ? raw : {}
  ) as Partial<LandingVideoConfig>;
  const trimmedString = (value: unknown, fallback: string, max: number) => {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    return trimmed.slice(0, max);
  };
  return {
    enabled: data.enabled === true,
    videoUrl: sanitizeMediaUrl(data.videoUrl),
    posterUrl: sanitizeMediaUrl(data.posterUrl),
    eyebrow: trimmedString(data.eyebrow, DEFAULT_LANDING_VIDEO.eyebrow, 80),
    headline: trimmedString(data.headline, DEFAULT_LANDING_VIDEO.headline, 120),
    description: trimmedString(
      data.description,
      DEFAULT_LANDING_VIDEO.description,
      280,
    ),
    ctaLabel: trimmedString(data.ctaLabel, DEFAULT_LANDING_VIDEO.ctaLabel, 40),
    ctaHref: trimmedString(data.ctaHref, DEFAULT_LANDING_VIDEO.ctaHref, 500),
  };
};

const mergeThankYou = (raw: unknown): ThankYouConfig => {
  const data = (
    raw && typeof raw === "object" ? raw : {}
  ) as Partial<ThankYouConfig>;
  return {
    enabled: data.enabled === true,
    assetUrl: typeof data.assetUrl === "string" ? data.assetUrl : "",
    assetType: data.assetType === "video" ? "video" : "image",
    message:
      typeof data.message === "string" && data.message.trim()
        ? data.message.slice(0, 600)
        : DEFAULT_THANK_YOU.message,
  };
};

const mergeNewUserModalVariantB = (raw: unknown): NewUserModalVariantB => {
  const data = (raw && typeof raw === "object" ? raw : {}) as Partial<{
    enabled: boolean;
    weight: number;
    headline: string;
    body: string;
    voucherCode: string;
  }>;
  const weight = Number(data.weight);
  return {
    enabled: data.enabled === true,
    weight: Number.isFinite(weight)
      ? Math.min(100, Math.max(0, Math.floor(weight)))
      : DEFAULT_NEW_USER_MODAL_VARIANT_B.weight,
    headline: String(
      data.headline ?? DEFAULT_NEW_USER_MODAL_VARIANT_B.headline,
    ),
    body: String(data.body ?? DEFAULT_NEW_USER_MODAL_VARIANT_B.body),
    voucherCode: String(data.voucherCode ?? "")
      .trim()
      .toUpperCase(),
  };
};

// Variant-id allow-list (lowercase alphanumeric + `_-`, 1\u201332 chars). Kept
// in sync with the resolver lib + server sanitizer.
const NEW_USER_MODAL_VARIANT_ID_RE = /^[a-z0-9_-]{1,32}$/;

const mergeNewUserModalVariant = (
  raw: unknown,
  index: number,
): NewUserModalVariant | null => {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<NewUserModalVariant>;
  const fallbackId = String.fromCharCode(97 + (index % 26));
  let id = String(data.id ?? fallbackId)
    .trim()
    .toLowerCase();
  if (!NEW_USER_MODAL_VARIANT_ID_RE.test(id)) id = fallbackId;
  const weight = Math.floor(Number(data.weight));
  return {
    id,
    label:
      typeof data.label === "string" && data.label.trim()
        ? data.label.trim().slice(0, 60)
        : `Variant ${String.fromCharCode(65 + (index % 26))}`,
    weight: Number.isFinite(weight) ? Math.min(100, Math.max(0, weight)) : 0,
    headline: String(data.headline ?? ""),
    body: String(data.body ?? ""),
    voucherCode: String(data.voucherCode ?? "")
      .trim()
      .toUpperCase(),
  };
};

const mergeNewUserModalVariants = (
  raw: unknown,
  fallback: {
    headline: string;
    body: string;
    voucherCode: string;
    variantB: NewUserModalVariantB;
  },
): NewUserModalVariant[] => {
  if (Array.isArray(raw) && raw.length > 0) {
    const taken = new Set<string>();
    const out: NewUserModalVariant[] = [];
    for (
      let i = 0;
      i < raw.length && out.length < NEW_USER_MODAL_MAX_VARIANTS;
      i++
    ) {
      const v = mergeNewUserModalVariant(raw[i], i);
      if (!v) continue;
      let id = v.id;
      if (taken.has(id)) {
        let suffix = 2;
        while (taken.has(`${id}${suffix}`)) suffix += 1;
        id = `${id}${suffix}`.slice(0, 32);
      }
      taken.add(id);
      out.push({ ...v, id });
    }
    if (out.length > 0) return out;
  }
  // Synthesise from the legacy top-level + variantB fields so old KV
  // blobs surface as the equivalent variants array client-side.
  const a: NewUserModalVariant = {
    id: "a",
    label: "Variant A",
    weight: fallback.variantB.enabled
      ? Math.max(0, 100 - fallback.variantB.weight)
      : 100,
    headline: fallback.headline,
    body: fallback.body,
    voucherCode: fallback.voucherCode,
  };
  if (!fallback.variantB.enabled) return [a];
  return [
    a,
    {
      id: "b",
      label: "Variant B",
      weight: fallback.variantB.weight,
      headline: fallback.variantB.headline,
      body: fallback.variantB.body,
      voucherCode: fallback.variantB.voucherCode || fallback.voucherCode,
    },
  ];
};

const mergeNewUserModal = (raw: unknown): NewUserModalConfig => {
  const data = (raw && typeof raw === "object" ? raw : {}) as Partial<{
    enabled: boolean;
    triggers: Partial<NewUserModalTriggers>;
    timeSeconds: number;
    scrollPercent: number;
    voucherCode: string;
    emailCaptureEnabled: boolean;
    headline: string;
    body: string;
    variantB: unknown;
    variants: unknown;
    variantsEnabled: boolean;
  }>;
  const triggersRaw = (data.triggers ?? {}) as Partial<NewUserModalTriggers>;
  const variantB = mergeNewUserModalVariantB(data.variantB);
  const headline = String(data.headline ?? DEFAULT_NEW_USER_MODAL.headline);
  const body = String(data.body ?? DEFAULT_NEW_USER_MODAL.body);
  const voucherCode = String(data.voucherCode ?? "")
    .trim()
    .toUpperCase();
  const variants = mergeNewUserModalVariants(data.variants, {
    headline,
    body,
    voucherCode,
    variantB,
  });
  // Keep the test \u201Cdisabled\u201D unless explicitly on AND we have something
  // to test against; the resolver still falls back to variants[0].
  const variantsEnabled = data.variantsEnabled === true && variants.length >= 2;
  return {
    enabled: data.enabled !== false,
    triggers: {
      time: triggersRaw.time !== false,
      scroll: triggersRaw.scroll !== false,
      exitIntent: triggersRaw.exitIntent !== false,
    },
    timeSeconds: Number.isFinite(data.timeSeconds)
      ? Math.min(120, Math.max(1, Math.floor(Number(data.timeSeconds))))
      : DEFAULT_NEW_USER_MODAL.timeSeconds,
    scrollPercent: Number.isFinite(data.scrollPercent)
      ? Math.min(95, Math.max(5, Math.floor(Number(data.scrollPercent))))
      : DEFAULT_NEW_USER_MODAL.scrollPercent,
    voucherCode: variants[0]?.voucherCode || voucherCode,
    emailCaptureEnabled: data.emailCaptureEnabled === true,
    headline: variants[0]?.headline || headline,
    body: variants[0]?.body || body,
    variantB,
    variants,
    variantsEnabled,
  };
};

const SHIPPING_ZONE_KEYS: ShippingZone[] = [
  "metro_manila",
  "luzon",
  "visayas",
  "mindanao",
];

const sanitizeShippingRates = (raw: unknown): ShippingRate[] => {
  if (!Array.isArray(raw)) return DEFAULT_SHIPPING_RATES;
  const out: ShippingRate[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as {
      courierId?: unknown;
      courierLabel?: unknown;
      fees?: unknown;
    };
    const courierId = String(e.courierId ?? "").trim();
    if (!courierId) continue;
    const key = courierId.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const courierLabel = String(e.courierLabel ?? courierId);
    const feesRaw =
      e.fees && typeof e.fees === "object"
        ? (e.fees as Record<string, unknown>)
        : {};
    const fees = SHIPPING_ZONE_KEYS.reduce(
      (acc, z) => {
        const n = Math.floor(Number(feesRaw[z]) || 0);
        acc[z] = n < 0 ? 0 : n;
        return acc;
      },
      {} as Record<ShippingZone, number>,
    );
    out.push({ courierId, courierLabel, fees });
  }
  // If admin saved an empty list, respect that — don't silently re-seed.
  return out;
};

const mergeLalamoveFare = (raw: unknown): LalamoveFareConfig => {
  const data = (raw && typeof raw === "object" ? raw : {}) as Partial<
    Record<keyof LalamoveFareConfig, unknown>
  >;
  const num = (v: unknown, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    enabled: data.enabled === false ? false : true,
    warehouseLat: num(data.warehouseLat, DEFAULT_LALAMOVE_FARE.warehouseLat),
    warehouseLng: num(data.warehouseLng, DEFAULT_LALAMOVE_FARE.warehouseLng),
    warehouseLabel:
      typeof data.warehouseLabel === "string" && data.warehouseLabel.trim()
        ? data.warehouseLabel.trim().slice(0, 80)
        : DEFAULT_LALAMOVE_FARE.warehouseLabel,
    perKmRate: Math.max(
      0,
      num(data.perKmRate, DEFAULT_LALAMOVE_FARE.perKmRate),
    ),
    baseFee: Math.max(0, num(data.baseFee, DEFAULT_LALAMOVE_FARE.baseFee)),
    minFare: Math.max(0, num(data.minFare, DEFAULT_LALAMOVE_FARE.minFare)),
  };
};

const mergeSiteCopy = (raw: unknown): SiteCopy => {
  const data = (raw && typeof raw === "object" ? raw : {}) as Partial<{
    gallery: Partial<SiteCopySectionTwo>;
    about: Partial<SiteCopyAbout>;
    reviews: Partial<SiteCopySectionTwo>;
    contact: Partial<SiteCopySectionTwo>;
    newsletter: Partial<SiteCopySectionTwo>;
    madeToOrderNotice: Partial<SiteCopyMadeToOrder>;
    productInfo: Partial<SiteCopyProductInfo>;
  }>;
  return {
    gallery: { ...DEFAULT_SITE_COPY.gallery, ...(data.gallery ?? {}) },
    about: { ...DEFAULT_SITE_COPY.about, ...(data.about ?? {}) },
    reviews: { ...DEFAULT_SITE_COPY.reviews, ...(data.reviews ?? {}) },
    contact: { ...DEFAULT_SITE_COPY.contact, ...(data.contact ?? {}) },
    newsletter: {
      ...DEFAULT_SITE_COPY.newsletter,
      ...(data.newsletter ?? {}),
    },
    madeToOrderNotice: {
      ...DEFAULT_SITE_COPY.madeToOrderNotice,
      ...(data.madeToOrderNotice ?? {}),
    },
    productInfo: {
      ...DEFAULT_SITE_COPY.productInfo,
      ...(data.productInfo ?? {}),
    },
  };
};

interface ContextType {
  config: StorefrontConfig;
  loading: boolean;
  refresh: () => Promise<void>;
}

const StorefrontConfigContext = createContext<ContextType | undefined>(
  undefined,
);

export const StorefrontConfigProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [config, setConfig] = useState<StorefrontConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/storefront-config");
      if (!res.ok) return;
      const data = await res.json();
      if (data?.config) {
        const rawChat =
          data.config.chat && typeof data.config.chat === "object"
            ? data.config.chat
            : {};
        // Respect an explicitly-empty FAQ array; only re-seed defaults when
        // the server didn't return a `faqs` field at all.
        const faqsExplicit = Array.isArray(rawChat.faqs);
        const sanitizedFaqs = sanitizeChatFaqs(rawChat.faqs);
        setConfig({
          announcement: {
            ...DEFAULT_CONFIG.announcement,
            ...data.config.announcement,
          },
          freeShipping: {
            ...DEFAULT_CONFIG.freeShipping,
            ...data.config.freeShipping,
          },
          lalamoveFare: mergeLalamoveFare(data.config.lalamoveFare),
          shippingRates: sanitizeShippingRates(data.config.shippingRates),
          promoCodes: Array.isArray(data.config.promoCodes)
            ? data.config.promoCodes
            : [],
          chat: {
            enabled: rawChat.enabled !== false,
            welcome:
              typeof rawChat.welcome === "string" && rawChat.welcome.trim()
                ? rawChat.welcome
                : DEFAULT_CHAT_WELCOME,
            agentHandoff: rawChat.agentHandoff !== false,
            faqs: faqsExplicit ? sanitizedFaqs : DEFAULT_CHAT_FAQS,
          },
          siteCopy: mergeSiteCopy(data.config.siteCopy),
          newUserModal: mergeNewUserModal(data.config.newUserModal),
          dailyFeature: mergeDailyFeature(data.config.dailyFeature),
          dailyFeatureToday: mergeDailyFeatureToday(
            data.config.dailyFeatureToday,
          ),
          thankYou: mergeThankYou(data.config.thankYou),
          vacationMode: mergeVacationMode(data.config.vacationMode),
          landingVideo: mergeLandingVideo(data.config.landingVideo),
        });
      }
    } catch {
      // keep defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <StorefrontConfigContext.Provider value={{ config, loading, refresh }}>
      {children}
    </StorefrontConfigContext.Provider>
  );
};

export const useStorefrontConfig = () => {
  const ctx = useContext(StorefrontConfigContext);
  if (!ctx) {
    throw new Error(
      "useStorefrontConfig must be used within StorefrontConfigProvider",
    );
  }
  return ctx;
};
