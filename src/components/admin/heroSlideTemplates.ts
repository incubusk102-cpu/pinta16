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
  /** Field values applied when the template is selected. `image` and
   *  `enabled` are intentionally not in this set — admins keep full
   *  control of those. Any field set to `""` clears the corresponding
   *  slide field; omitted fields are left untouched. */
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
    hint: "Announces a fresh drop — best with a wide studio / collection photo.",
    fields: {
      eyebrow: "Just dropped",
      headline: "New paintings, fresh from the studio",
      subtext:
        "Original Filipino works on canvas — only a handful made of each.",
      ctaLabel: "Browse the collection",
      ctaHref: "/gallery",
      align: "left",
    },
  },
  {
    id: "featured",
    label: "Featured artwork",
    hint: "Spotlights one painting — replace {{title}} and link to /product/<id>.",
    fields: {
      eyebrow: "Featured this week",
      headline: "{{title}}",
      subtext: "One-of-a-kind original. Once it's gone, it's gone.",
      ctaLabel: "View the painting",
      ctaHref: "/gallery",
      align: "left",
    },
  },
  {
    id: "sale",
    label: "Sale / promo",
    hint: "Time-limited discount — edit the code + end date in the subtext.",
    fields: {
      eyebrow: "Limited offer",
      headline: "10% off your first painting",
      subtext: "Use code WELCOME10 at checkout. Ends Sunday.",
      ctaLabel: "Shop the sale",
      ctaHref: "/gallery",
      align: "center",
    },
  },
  {
    id: "free-shipping",
    label: "Free shipping",
    hint: "Trust signal that pairs well with a packaging / studio photo.",
    fields: {
      eyebrow: "Free shipping",
      headline: "We ship every painting free across PH",
      subtext: "Carefully crated, fully insured, tracked end-to-end.",
      ctaLabel: "Start shopping",
      ctaHref: "/gallery",
      align: "center",
    },
  },
  {
    id: "commission",
    label: "Made-to-order / commission",
    hint: "Lead with a portrait or process shot to feel personal.",
    fields: {
      eyebrow: "Commissions open",
      headline: "Commission a painting that's just yours",
      subtext: "Tell us a story, a place, a feeling — we'll paint it.",
      ctaLabel: "Start a commission",
      ctaHref: "/commission",
      align: "right",
    },
  },
  {
    id: "gift",
    label: "Gift",
    hint: "Holiday / occasion slot — switch the link to /gallery?gift=1.",
    fields: {
      eyebrow: "Give the gift",
      headline: "A painting they'll keep for life",
      subtext: "Gift cards available — printable or emailed instantly.",
      ctaLabel: "Browse gifts",
      ctaHref: "/gallery?gift=1",
      align: "center",
    },
  },
  {
    id: "newsletter",
    label: "Newsletter",
    hint: "Captures emails — link should anchor to your subscribe form.",
    fields: {
      eyebrow: "Stay close",
      headline: "Be first to see new work",
      subtext: "We mail every new collection to subscribers two days early.",
      ctaLabel: "Subscribe",
      ctaHref: "/#newsletter",
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
      ctaHref: "/about",
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
