/**
 * Curated hero-slide content presets surfaced in the admin editor as a
 * "Use template" dropdown. Picking one fills eyebrow / headline /
 * subtext / ctaLabel / ctaHref / align in a single click — image stays
 * admin-uploaded since every slide carries its own art.
 *
 * The "custom" preset is the implicit default (blank fields) and is
 * what every newly added slide starts on.
 */
import type { HeroAlign } from "@/contexts/HeroSlidesContext";

export type HeroTemplateId =
  | "custom"
  | "new-collection"
  | "featured"
  | "sale"
  | "free-shipping"
  | "commission"
  | "gift"
  | "newsletter"
  | "story";

export interface HeroTemplate {
  id: HeroTemplateId;
  /** Human-readable name shown in the dropdown. */
  label: string;
  /** One-line hint shown below the dropdown when this template is active. */
  hint: string;
  /** Optional built-in background image shown/applied by the admin editor. */
  image?: string;
  /** Field values applied when the template is selected. Any field set to
   *  `""` clears the corresponding slide field. */
  fields: {
    eyebrow: string;
    headline: string;
    subtext: string;
    ctaLabel: string;
    ctaHref: string;
    align: HeroAlign;
  };
}

export const HERO_TEMPLATES: HeroTemplate[] = [
  {
    id: "custom",
    label: "Custom (blank)",
    hint: "Start from scratch — fill the fields yourself.",
    fields: {
      eyebrow: "",
      headline: "",
      subtext: "",
      ctaLabel: "",
      ctaHref: "",
      align: "center",
    },
  },
  {
    id: "new-collection",
    label: "New collection",
    hint: "Applies a built-in campaign image plus launch copy for a fresh drop.",
    image: "/hero-templates/new-collection.webp",
    fields: {
      eyebrow: "Just dropped",
      headline: "Fresh works, newly released",
      subtext: "Explore the latest originals before they’re gone.",
      ctaLabel: "See new arrivals",
      ctaHref: "/collection",
      align: "left",
    },
  },
  {
    id: "featured",
    label: "Featured artwork",
    hint: "Applies a built-in spotlight image, price-led copy, and right-aligned overlay.",
    image: "/hero-templates/featured-artwork.webp",
    fields: {
      eyebrow: "Featured artwork",
      headline: "Golden Harvest Kin",
      subtext: "A one-of-a-kind original, available now.",
      ctaLabel: "View artwork",
      ctaHref: "/collection",
      align: "right",
    },
  },
  {
    id: "sale",
    label: "Sale / promo",
    hint: "Applies a built-in promo image, code-led copy, and left-aligned text.",
    image: "/hero-templates/sale-promo.webp",
    fields: {
      eyebrow: "Limited offer",
      headline: "10% off your first painting",
      subtext: "Use code WELCOME10 on your first order.",
      ctaLabel: "Shop now",
      ctaHref: "/collection",
      align: "left",
    },
  },
  {
    id: "free-shipping",
    label: "Free shipping",
    hint: "Applies a built-in delivery-focused image and centered trust-banner copy.",
    image: "/hero-templates/free-shipping.webp",
    fields: {
      eyebrow: "Free shipping",
      headline: "Every painting ships free across PH",
      subtext: "Packed, insured, and delivered with care.",
      ctaLabel: "Explore paintings",
      ctaHref: "/collection",
      align: "center",
    },
  },
  {
    id: "commission",
    label: "Made-to-order / commission",
    hint: "Lead with a portrait or process shot to feel personal. CTA jumps to the contact form.",
    fields: {
      eyebrow: "Commissions open",
      headline: "Commission a painting that's just yours",
      subtext: "Tell us a story, a place, a feeling — we'll paint it.",
      ctaLabel: "Start a commission",
      ctaHref: "#contact",
      align: "right",
    },
  },
  {
    id: "gift",
    label: "Gift",
    hint: "Holiday / occasion slot — pairs well with a wrapped-painting photo.",
    fields: {
      eyebrow: "Give the gift",
      headline: "A painting they'll keep for life",
      subtext: "Gift cards available — printable or emailed instantly.",
      ctaLabel: "Browse gifts",
      ctaHref: "/collection",
      align: "center",
    },
  },
  {
    id: "newsletter",
    label: "Newsletter",
    hint: "Captures emails — anchors to the subscribe form in the contact section.",
    fields: {
      eyebrow: "Stay close",
      headline: "Be first to see new work",
      subtext: "We mail every new collection to subscribers two days early.",
      ctaLabel: "Subscribe",
      ctaHref: "#contact",
      align: "center",
    },
  },
  {
    id: "story",
    label: "Story / about",
    hint: "Brand storytelling — pair with an artist portrait.",
    fields: {
      eyebrow: "Our story",
      headline: "Painted in Manila, shipped worldwide",
      subtext: "Meet the artists behind every canvas.",
      ctaLabel: "Read the story",
      ctaHref: "#about",
      align: "left",
    },
  },
];

export const HERO_TEMPLATE_BY_ID: Record<HeroTemplateId, HeroTemplate> =
  HERO_TEMPLATES.reduce(
    (acc, tpl) => {
      acc[tpl.id] = tpl;
      return acc;
    },
    {} as Record<HeroTemplateId, HeroTemplate>,
  );
