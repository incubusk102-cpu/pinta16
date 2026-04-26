// Editable homepage hero slider. Each slide carries a base64 data URL for
// the image plus optional eyebrow / headline / subtext / CTA fields. Stored
// as a single JSON blob in the `hero-slides` store under the fixed key
// `slides`. CAS-protected against concurrent admin writes.
//
// Storage shape:
//   {
//     autoplay: boolean,
//     intervalMs: number,        // 3000–20000
//     transition: "fade" | "slide" | "kenburns",
//     slides: [
//       { id, image, eyebrow, headline, subtext, ctaLabel, ctaHref, align,
//         enabled, sortOrder }
//     ]
//   }
//
// Public actions: GET (full settings + enabled slides for the public site).
// Admin actions: GET ?admin=1, POST { action: "save", settings, slides }.

import { connectLambda, getStore } from "@netlify/blobs";
import { withSecurityHeaders } from "../lib/security-headers.js";
import { isAuthenticated } from "../lib/admin-auth.js";

const STORE_NAME = "hero-slides";
const KEY = "slides";

const MAX_SLIDES = 8;
const MAX_TEXT = 200;
const MAX_LABEL = 60;
const MAX_HREF = 500;
// Roughly 3.5 MB base64 → ~2.6 MB raw. Each blob cell can carry the array.
const MAX_IMAGE_BYTES = 3_500_000;

const ALIGNS = ["left", "center", "right"];
const TRANSITIONS = ["fade", "slide", "kenburns"];

const DEFAULT_SETTINGS = {
  autoplay: true,
  intervalMs: 6000,
  transition: "kenburns",
};

const json = (statusCode, body) => ({
  statusCode,
  headers: withSecurityHeaders(),
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

const getHeroStore = (event) => {
  connectLambda(event);
  return getStore(STORE_NAME);
};

const trimText = (v, max) =>
  String(v ?? "")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);

// Allow only safe URL shapes for CTA links: same-origin ("/foo"), in-page
// anchors ("#foo"), http(s)://, mailto:, tel:. Anything else (e.g. javascript:,
// data:) is silently dropped so a compromised admin token can't ship an XSS
// payload through the hero CTA.
const sanitizeHref = (raw) => {
  const v = trimText(raw, MAX_HREF);
  if (!v) return "";
  if (v.startsWith("/") || v.startsWith("#")) return v;
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v;
  return "";
};

const isValidImage = (v) => {
  if (typeof v !== "string") return false;
  if (!v) return true; // empty is allowed (placeholder slide)
  if (v.length > MAX_IMAGE_BYTES) return false;
  // Raster only — SVG is dropped to avoid script-in-image XSS via inline use.
  return /^data:image\/(png|jpe?g|webp|gif|avif);base64,/i.test(v);
};

const generateSlideId = () => {
  const bytes = new Uint8Array(9);
  globalThis.crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
};

const sanitizeSlide = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  if (!isValidImage(raw.image)) return null;
  const id =
    typeof raw.id === "string" && /^[A-Za-z0-9_-]{6,32}$/.test(raw.id)
      ? raw.id
      : generateSlideId();
  return {
    id,
    image: typeof raw.image === "string" ? raw.image : "",
    eyebrow: trimText(raw.eyebrow, MAX_LABEL),
    headline: trimText(raw.headline, MAX_TEXT),
    subtext: trimText(raw.subtext, MAX_TEXT),
    ctaLabel: trimText(raw.ctaLabel, MAX_LABEL),
    ctaHref: sanitizeHref(raw.ctaHref),
    align: ALIGNS.includes(raw.align) ? raw.align : "center",
    enabled: raw.enabled !== false,
    sortOrder: Number.isFinite(Number(raw.sortOrder))
      ? Number(raw.sortOrder)
      : 0,
  };
};

const sanitizeSettings = (raw) => {
  const data = raw && typeof raw === "object" ? raw : {};
  const interval = Math.floor(Number(data.intervalMs) || 0);
  return {
    autoplay: data.autoplay !== false,
    intervalMs:
      interval >= 3000 && interval <= 20000
        ? interval
        : DEFAULT_SETTINGS.intervalMs,
    transition: TRANSITIONS.includes(data.transition)
      ? data.transition
      : DEFAULT_SETTINGS.transition,
  };
};

const sanitizeAll = (raw) => {
  const data = raw && typeof raw === "object" ? raw : {};
  const slidesRaw = Array.isArray(data.slides) ? data.slides : [];
  const slides = slidesRaw
    .map(sanitizeSlide)
    .filter((s) => s !== null)
    .slice(0, MAX_SLIDES)
    .map((s, i) => ({ ...s, sortOrder: i }));
  return {
    settings: sanitizeSettings(data.settings),
    slides,
  };
};

const readWithMeta = async (store) => {
  const result = await store.getWithMetadata(KEY, { type: "json" });
  return { etag: result?.etag, data: sanitizeAll(result?.data) };
};

const read = async (store) => {
  try {
    const { data } = await readWithMeta(store);
    return data;
  } catch {
    return sanitizeAll({});
  }
};

const writeWithCAS = async (store, next) => {
  for (let attempt = 0; attempt < 4; attempt++) {
    let etag;
    try {
      ({ etag } = await readWithMeta(store));
    } catch {
      return null;
    }
    try {
      const wrote = await store.setJSON(KEY, next, { onlyIfMatch: etag });
      if (wrote && wrote.modified === false) continue;
      return next;
    } catch {
      return null;
    }
  }
  return null;
};

const publicView = (data) => ({
  settings: data.settings,
  slides: data.slides
    .filter((s) => s.enabled && s.image)
    .map(({ enabled, sortOrder, ...rest }) => {
      void enabled;
      void sortOrder;
      return rest;
    }),
});

export const handler = async (event) => {
  try {
    const store = getHeroStore(event);

    if (event.httpMethod === "GET") {
      const params = event.queryStringParameters || {};
      const data = await read(store);
      if (params.admin === "1") {
        if (!(await isAuthenticated(event))) {
          return json(401, { error: "Not authenticated" });
        }
        return json(200, data);
      }
      return json(200, publicView(data));
    }

    if (event.httpMethod === "POST") {
      if (!(await isAuthenticated(event))) {
        return json(401, { error: "Not authenticated" });
      }
      const body = parseBody(event.body);

      if (body.action === "save") {
        const incoming = sanitizeAll({
          settings: body.settings,
          slides: body.slides,
        });
        const wrote = await writeWithCAS(store, incoming);
        if (!wrote) {
          return json(409, { error: "Save conflicted, please retry" });
        }
        return json(200, wrote);
      }

      return json(400, { error: "Unknown action" });
    }

    return json(405, { error: "Method not allowed" });
  } catch {
    return json(500, { error: "Internal error" });
  }
};
