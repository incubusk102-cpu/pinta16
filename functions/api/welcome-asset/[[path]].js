// /api/welcome-asset/<slot> — re-host the welcome email's data: URL
// images as plain HTTPS image URLs that Gmail / Apple Mail / Outlook
// will actually fetch.
//
// All admin uploaders (logo, banner, avatar, custom product cards,
// regular storefront products) compress images client-side into base64
// data URLs and persist them straight into KV. That works on the
// storefront because browsers render `data:image/...` natively, but
// Gmail (and most email clients) strip data URIs from inbound mail for
// privacy reasons. The result was empty product cards and a broken
// logo glyph in the welcome email.
//
// This endpoint resolves a slot name to the right config field, decodes
// the base64 payload, and serves the bytes with an `image/<type>`
// Content-Type so the email body just contains plain
// `<img src="https://canvhub.com/api/welcome-asset/logo">` tags. Long
// `Cache-Control` is fine — admins changing the underlying image will
// get a new content hash query string from the email renderer, which
// busts the proxy cache automatically.
//
// Slots:
//   /api/welcome-asset/logo
//   /api/welcome-asset/banner
//   /api/welcome-asset/avatar
//   /api/welcome-asset/custom/<id>     -> welcomeEmail.products.customItems[id].imageUrl
//   /api/welcome-asset/product/<id>    -> products["all-products"][id].images[0].url

import { setCloudflareContext } from "../_lib/context.js";
import { makeStore } from "../_lib/kv-store.js";
import { SECURITY_HEADERS } from "../_lib/security-headers.js";

const CONFIG_KEY = "config";
const PRODUCTS_KEY = "all-products";

const DATA_URL_RE = /^data:(image\/[a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=]+)$/;

// Decode a base64 string into a Uint8Array. Workers don't have Buffer,
// so we use atob and pack the chars into a typed array.
const base64ToBytes = (b64) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
};

// Image-response headers reuse the global security baseline (X-Frame,
// nosniff, Referrer-Policy) but explicitly override Content-Type and
// Cache-Control. The default `withSecurityHeaders()` sets
// Content-Type: application/json + Cache-Control: no-store which is
// wrong for images.
const imageHeaders = (mime) => ({
  ...SECURITY_HEADERS,
  "Content-Type": mime,
  // 7d browser cache + 24h CDN cache. Email clients (Gmail proxy etc.)
  // also cache aggressively. The email renderer appends a content-hash
  // query string so any image swap busts this transparently.
  "Cache-Control": "public, max-age=604800, s-maxage=86400, immutable",
});

const notFound = () =>
  new Response("Not found", {
    status: 404,
    headers: {
      ...SECURITY_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });

const serveDataUrl = (dataUrl) => {
  if (typeof dataUrl !== "string") return notFound();
  const match = DATA_URL_RE.exec(dataUrl.trim());
  if (!match) return notFound();
  const [, mime, b64] = match;
  let bytes;
  try {
    bytes = base64ToBytes(b64);
  } catch {
    return notFound();
  }
  return new Response(bytes, {
    status: 200,
    headers: imageHeaders(mime),
  });
};

// Slots that point at top-level welcomeEmail string fields.
const WELCOME_FIELD_SLOTS = {
  logo: "logoUrl",
  banner: "bannerUrl",
  avatar: "avatarUrl",
};

const resolveSlot = async (env, segments) => {
  if (!segments.length) return null;
  const [first, second] = segments;

  // /api/welcome-asset/logo|banner|avatar
  if (WELCOME_FIELD_SLOTS[first]) {
    const store = makeStore(env.STOREFRONT_CONFIG);
    const config = await store.get(CONFIG_KEY, { type: "json" });
    return config?.welcomeEmail?.[WELCOME_FIELD_SLOTS[first]] ?? null;
  }

  // /api/welcome-asset/custom/<id>
  if (first === "custom" && second) {
    const store = makeStore(env.STOREFRONT_CONFIG);
    const config = await store.get(CONFIG_KEY, { type: "json" });
    const items = config?.welcomeEmail?.products?.customItems;
    if (!Array.isArray(items)) return null;
    const item = items.find((it) => it && String(it.id) === String(second));
    return item?.imageUrl ?? null;
  }

  // /api/welcome-asset/product/<id>
  if (first === "product" && second) {
    const store = makeStore(env.PRODUCTS);
    const all = await store.get(PRODUCTS_KEY, { type: "json" });
    if (!Array.isArray(all)) return null;
    const product = all.find((p) => p && String(p.id) === String(second));
    if (!product) return null;
    if (Array.isArray(product.images) && product.images[0]?.url) {
      return product.images[0].url;
    }
    if (typeof product.image === "string") return product.image;
    return null;
  }

  return null;
};

export const onRequestGet = async ({ request: _request, env, params }) => {
  setCloudflareContext(env);

  const segments = Array.isArray(params?.path)
    ? params.path
    : typeof params?.path === "string"
      ? [params.path]
      : [];

  let dataUrl;
  try {
    dataUrl = await resolveSlot(env, segments);
  } catch {
    return notFound();
  }
  if (!dataUrl) return notFound();
  return serveDataUrl(dataUrl);
};

// HEAD = same headers, no body. Some clients / proxies (and Gmail's
// image proxy) probe with HEAD before fetching.
export const onRequestHead = async (ctx) => {
  const res = await onRequestGet(ctx);
  return new Response(null, { status: res.status, headers: res.headers });
};
