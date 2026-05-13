// /api/hero-slides — homepage slider config & slides.
import { initRequestContext } from "./_lib/handler-wrapper.js";
// KV namespace: HERO_SLIDES (single key "slides" → JSON object).
//
// Cloudflare Pages Function port of netlify/functions/hero-slides.js. The
// CAS-via-shim is best-effort on KV (no real conditional writes), so the
// retry loop is a courtesy rather than a guarantee — for hero edits this is
// fine because the admin is the only writer.

import { makeStore } from "./_lib/kv-store.js";
import { isAuthenticated } from "./_lib/admin-auth.js";
import { withSecurityHeaders } from "./_lib/security-headers.js";
import { buildLambdaEvent } from "./_lib/lambda-event.js";

const KEY = "slides";

const MAX_SLIDES = 8;
const MAX_TEXT = 200;
const MAX_LABEL = 60;
const MAX_HREF = 500;
const MAX_IMAGE_BYTES = 3_500_000;
const BUILTIN_IMAGE_PREFIX = "/hero-templates/";

const ALIGNS = ["left", "center", "right"];
const TRANSITIONS = ["fade", "slide", "kenburns"];

const DEFAULT_SETTINGS = {
  autoplay: true,
  intervalMs: 6000,
  transition: "kenburns",
};

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: withSecurityHeaders(),
  });

const parseBody = (body) => {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
};

const trimText = (v, max) =>
  String(v ?? "")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);

// Until May 2026 the homepage rendered a `#gallery` anchor on top of the
// dense 2-column grid. PR #349 lifted that grid out to /collection and the
// homepage now anchors `#gallery` to a small CTA card. Old hero slides
// saved with `ctaHref: "#gallery"` (or "/#gallery") would still scroll
// to that tiny card instead of taking the customer to the actual browse
// experience. Rewriting on every read + write is a no-op once everyone
// has saved at least once, and it keeps the admin editor in sync (the
// dropdown's "Use template" detection compares ctaHref strings).
const migrateLegacyHref = (v) => {
  if (v === "#gallery" || v === "/#gallery") return "/collection";
  return v;
};

const sanitizeHref = (raw) => {
  const v = trimText(raw, MAX_HREF);
  if (!v) return "";
  if (v.startsWith("//")) return "";
  const migrated = migrateLegacyHref(v);
  if (migrated.startsWith("/") || migrated.startsWith("#")) return migrated;
  if (/^(https?:|mailto:|tel:)/i.test(migrated)) return migrated;
  return "";
};

const isValidImage = (v) => {
  if (typeof v !== "string") return false;
  if (!v) return true;
  if (v.startsWith(BUILTIN_IMAGE_PREFIX)) {
    return /^\/hero-templates\/[A-Za-z0-9_-]+\.(png|jpe?g|webp|gif|avif)$/i.test(
      v,
    );
  }
  if (v.length > MAX_IMAGE_BYTES) return false;
  return /^data:image\/(png|jpe?g|webp|gif|avif);base64,/i.test(v);
};

const generateSlideId = () => {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

// Accept either an empty string ("no boundary") or a parseable ISO
// 8601 string and normalise to a canonical ISO timestamp. Anything
// else (truthy but unparseable, wrong type) is silently dropped to
// "" so the slide stays visible by default. This is intentionally
// permissive on the server side because the admin UI does its own
// PHT-aware formatting; the server's job is just to make sure we
// never persist garbage that would break the public filter below.
const sanitizeIsoTimestamp = (raw) => {
  if (typeof raw !== "string" || !raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
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
    // Optional schedule window. Both fields are ISO 8601 UTC strings;
    // "" means "unbounded". A slide is publicly visible when the
    // current UTC time is within [startsAt, endsAt] inclusive.
    startsAt: sanitizeIsoTimestamp(raw.startsAt),
    endsAt: sanitizeIsoTimestamp(raw.endsAt),
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

// Returns true when the slide is inside its scheduled window (or has
// no window at all). Both bounds are inclusive; an admin who sets
// endsAt="Sunday 23:59 PHT" expects the slide to disappear on Monday
// 00:00 PHT, which falls out naturally because endsAt itself is
// stored as a UTC instant.
const isWithinSchedule = (slide, now) => {
  if (slide.startsAt) {
    const t = Date.parse(slide.startsAt);
    if (Number.isFinite(t) && t > now) return false;
  }
  if (slide.endsAt) {
    const t = Date.parse(slide.endsAt);
    if (Number.isFinite(t) && t < now) return false;
  }
  return true;
};

const publicView = (data) => {
  const now = Date.now();
  return {
    settings: data.settings,
    slides: data.slides
      .filter((s) => s.enabled && s.image && isWithinSchedule(s, now))
      .map(({ enabled, sortOrder, ...rest }) => {
        void enabled;
        void sortOrder;
        return rest;
      }),
  };
};

const handle = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;
  if (!env.HERO_SLIDES) {
    return json(500, { error: "HERO_SLIDES KV binding missing" });
  }
  const store = makeStore(env.HERO_SLIDES);
  const event = await buildLambdaEvent(request);

  try {
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

export const onRequestGet = handle;
export const onRequestPost = handle;
