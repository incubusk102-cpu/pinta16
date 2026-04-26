import { connectLambda, getStore } from "@netlify/blobs";
import { isAuthenticated } from "../lib/admin-auth.js";

const STORE_NAME = "storefront-config";
const CONFIG_KEY = "config";

const jsonHeaders = { "Content-Type": "application/json" };

const json = (statusCode, body) => ({
  statusCode,
  headers: jsonHeaders,
  body: JSON.stringify(body),
});

const parseBody = (body) => {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
};

const getConfigStore = (event) => {
  connectLambda(event);
  return getStore(STORE_NAME);
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
  },
  freeShipping: {
    enabled: true,
    threshold: 8000,
    shippingFee: 500,
  },
  promoCodes: [],
  hero: {
    enabled: true,
    eyebrow: "Affordable Art, Authentic Stories",
    headline: "Pintaterra",
    subhead:
      "Discover hand-crafted paintings that transform spaces. Each piece tells a story, crafted with passion and precision.",
    ctaLabel: "View Collection",
    ctaHref: "#gallery",
    backgroundImages: [],
  },
  collections: [],
};

const HERO_BG_LIMIT = 3;
const COLLECTION_LIMIT = 8;
const COLLECTION_PRODUCT_LIMIT = 24;

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
  const hero = data.hero && typeof data.hero === "object" ? data.hero : {};
  const collections = Array.isArray(data.collections) ? data.collections : [];

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
    },
    freeShipping: {
      enabled: freeShipping.enabled !== false,
      threshold: Math.max(0, Math.floor(Number(freeShipping.threshold) || 0)),
      shippingFee: Math.max(
        0,
        Math.floor(Number(freeShipping.shippingFee) || 0),
      ),
    },
    promoCodes: promoCodes
      .map((p) => {
        if (!p || typeof p !== "object") return null;
        const code = String(p.code ?? "")
          .trim()
          .toUpperCase()
          .slice(0, 30);
        if (!code) return null;
        const type = p.type === "fixed" ? "fixed" : "percent";
        const value = Math.max(0, Math.floor(Number(p.value) || 0));
        if (value <= 0) return null;
        if (type === "percent" && value > 100) return null;
        return {
          code,
          type,
          value,
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
    hero: {
      enabled: hero.enabled !== false,
      eyebrow: String(hero.eyebrow ?? DEFAULT_CONFIG.hero.eyebrow).slice(
        0,
        120,
      ),
      headline: String(hero.headline ?? DEFAULT_CONFIG.hero.headline).slice(
        0,
        80,
      ),
      subhead: String(hero.subhead ?? DEFAULT_CONFIG.hero.subhead).slice(
        0,
        320,
      ),
      ctaLabel: String(hero.ctaLabel ?? DEFAULT_CONFIG.hero.ctaLabel).slice(
        0,
        40,
      ),
      ctaHref: String(hero.ctaHref ?? DEFAULT_CONFIG.hero.ctaHref).slice(
        0,
        500,
      ),
      backgroundImages: (Array.isArray(hero.backgroundImages)
        ? hero.backgroundImages
        : []
      )
        .map((url) =>
          String(url ?? "")
            .trim()
            .slice(0, 2000),
        )
        .filter(Boolean)
        .slice(0, HERO_BG_LIMIT),
    },
    collections: collections
      .map((c) => {
        if (!c || typeof c !== "object") return null;
        const id = String(c.id ?? "")
          .trim()
          .slice(0, 60);
        if (!id) return null;
        const productIds = (Array.isArray(c.productIds) ? c.productIds : [])
          .map((pid) =>
            String(pid ?? "")
              .trim()
              .slice(0, 100),
          )
          .filter(Boolean)
          .slice(0, COLLECTION_PRODUCT_LIMIT);
        return {
          id,
          title: String(c.title ?? "").slice(0, 80),
          description: String(c.description ?? "").slice(0, 240),
          productIds,
          enabled: c.enabled !== false,
        };
      })
      .filter(Boolean)
      .slice(0, COLLECTION_LIMIT),
  };
};

const readConfig = async (store) => {
  const raw = await store.get(CONFIG_KEY, { type: "json" });
  return sanitizeConfig(raw || DEFAULT_CONFIG);
};

const publicView = (config) => ({
  announcement: config.announcement,
  freeShipping: config.freeShipping,
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
      minSpend: p.minSpend,
      expiresAt: p.expiresAt,
      description: p.description,
    })),
  hero: config.hero,
  collections: config.collections.filter((c) => c.enabled),
});

export const handler = async (event) => {
  const method = event.httpMethod;
  try {
    const store = getConfigStore(event);

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

      if (action === "update-hero") {
        const next = sanitizeConfig({
          ...existing,
          hero: { ...existing.hero, ...body.hero },
        });
        await store.setJSON(CONFIG_KEY, next);
        return json(200, { config: next });
      }

      if (action === "set-collections") {
        const incoming = Array.isArray(body.collections)
          ? body.collections
          : [];
        const next = sanitizeConfig({ ...existing, collections: incoming });
        await store.setJSON(CONFIG_KEY, next);
        return json(200, { config: next });
      }

      return json(400, { error: "Unknown action" });
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    console.error("storefront-config error:", error);
    return json(500, { error: "Could not manage storefront config" });
  }
};
