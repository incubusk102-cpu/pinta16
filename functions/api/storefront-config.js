// /api/storefront-config — public read of announcement / free shipping /
import { setCloudflareContext } from "./_lib/context.js";
// promo codes / chat config; admin write of all of the above.
// KV namespace: STOREFRONT_CONFIG (single key "config" → JSON object).
//
// Cloudflare Pages Function port of netlify/functions/storefront-config.js.

import { makeStore } from "./_lib/kv-store.js";
import { isAuthenticated } from "./_lib/admin-auth.js";
import { buildLambdaEvent } from "./_lib/lambda-event.js";

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
        };
      })
      .filter(Boolean),
  };
};

const readConfig = async (store) => {
  const raw = await store.get(CONFIG_KEY, { type: "json" });
  return sanitizeConfig(raw || DEFAULT_CONFIG);
};

const publicView = (config) => ({
  announcement: config.announcement,
  freeShipping: config.freeShipping,
  siteCopy: config.siteCopy,
  promoCodes: config.promoCodes
    .filter((p) => p.enabled)
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
      const config = await readConfig(store);
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

      if (action === "update-site-copy") {
        const next = sanitizeConfig({
          ...existing,
          siteCopy: body.siteCopy,
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
