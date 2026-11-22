// /api/pinterest-feed — public Pinterest Catalog product feed (CSV).
//
// Pinterest ingests this file from a single URL on a schedule and
// auto-creates a product Pin for each row. The feed is the supported
// alternative to a per-Pin API integration for shops with an existing
// product catalog: it ships immediately (no Standard Access review) and
// stays in sync with /admin via the same KV store that powers the
// storefront.
//
// Spec reference: https://help.pinterest.com/en/business/article/data-source-ingestion
// Required columns: id, title, description, link, image_link, availability,
// price, condition. Optional: brand, sale_price, additional_image_link,
// product_type. Pinterest accepts CSV, TSV, and XML; we emit CSV.
import { setCloudflareContext } from "./_lib/context.js";
import { makeStore } from "./_lib/kv-store.js";

const PRODUCTS_KEY = "all-products";
const BRAND = "Canvas Hub";
const CURRENCY = "PHP";

// Pinterest expects one of:
//   "in stock" | "out of stock" | "preorder" | "available for order"
// Map our internal availability states to those values. We exclude
// drafts entirely (they aren't customer-facing) and never publish
// `reserved` because that's a transient hold for a single buyer.
const AVAILABILITY_MAP = {
  available: "in stock",
  "made-to-order": "preorder",
  sold: "out of stock",
};

const SKIP_AVAILABILITY = new Set(["draft", "reserved"]);

// CSV escape: wrap in double quotes and double any embedded quotes.
// Strip newlines and tabs so each row stays on a single line — Pinterest
// rejects multi-line cell content for CSV feeds.
const csvCell = (value) => {
  const s = String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `"${s.replace(/"/g, '""')}"`;
};

// Build the public absolute URL for an image. Stored values are either
// absolute https:// links (rare, legacy uploads) or our in-app proxy
// path `/api/r/products/<hash>.webp`. Pinterest requires absolute URLs
// with a scheme.
const absUrl = (origin, value) => {
  if (typeof value !== "string" || !value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${origin}${value}`;
  return "";
};

// Collect up to N additional image URLs (Pinterest cap is 10) from the
// product's `images` array, skipping the primary image and any blanks.
const additionalImageLinks = (origin, product, max = 10) => {
  const out = [];
  const seen = new Set();
  const primary = absUrl(origin, product.image);
  if (primary) seen.add(primary);
  const list = Array.isArray(product.images) ? product.images : [];
  for (const entry of list) {
    if (out.length >= max) break;
    const url = absUrl(origin, entry?.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
};

// Format a price as Pinterest wants it: "<amount>.00 <CURRENCY>" with
// two decimals. Falsy/non-numeric values return an empty string so the
// row simply omits the field.
const formatPrice = (value) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "";
  }
  return `${value.toFixed(2)} ${CURRENCY}`;
};

// Pinterest product feed header. Order matters only for readability —
// Pinterest reads by column name. Keep this stable so existing data
// sources don't reset when we add columns.
const COLUMNS = [
  "id",
  "title",
  "description",
  "link",
  "image_link",
  "additional_image_link",
  "availability",
  "price",
  "sale_price",
  "brand",
  "condition",
  "product_type",
  "google_product_category",
];

// Pinterest's Google Product Category for "Art & Entertainment > Hobbies
// & Creative Arts > Arts & Crafts > Art & Crafting Materials > Painting".
// Sending a specific category improves Pinterest's distribution to
// shoppers browsing wall art. Reference:
// https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt
const GOOGLE_CATEGORY =
  "Home & Garden > Decor > Artwork > Posters, Prints, & Visual Artwork";

const buildRow = (product, origin) => {
  const availability = AVAILABILITY_MAP[product.availability] || "in stock";
  const price = formatPrice(product.price);
  const sale = formatPrice(product.salePrice);
  const productType = product.category || product.medium || "Original Painting";

  return [
    product.id,
    product.title,
    product.description || product.title,
    `${origin}/product/${product.id}`,
    absUrl(origin, product.image),
    additionalImageLinks(origin, product).join(","),
    availability,
    price,
    sale,
    BRAND,
    "new",
    productType,
    GOOGLE_CATEGORY,
  ]
    .map(csvCell)
    .join(",");
};

export const onRequestGet = async ({ request, env }) => {
  setCloudflareContext(env);

  const reqUrl = new URL(request.url);
  const safeProto = reqUrl.protocol === "http:" ? "http" : "https";
  const headerHost =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    reqUrl.host ||
    "canvhub.com";
  const safeHost = /^[a-zA-Z0-9.\-:]+$/.test(headerHost)
    ? headerHost
    : "canvhub.com";
  const origin = `${safeProto}://${safeHost}`;

  let products = [];
  try {
    if (env.PRODUCTS) {
      const store = makeStore(env.PRODUCTS);
      const data = await store.get(PRODUCTS_KEY, { type: "json" });
      products = Array.isArray(data) ? data : [];
    }
  } catch {
    products = [];
  }

  const rows = [COLUMNS.map(csvCell).join(",")];
  for (const p of products) {
    if (!p?.id || !p?.title || !p?.image) continue;
    if (SKIP_AVAILABILITY.has(p.availability)) continue;
    if (!formatPrice(p.price)) continue;
    rows.push(buildRow(p, origin));
  }

  return new Response(rows.join("\r\n") + "\r\n", {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'inline; filename="pinterest-feed.csv"',
      // Pinterest re-ingests every ~6h; a 30 min edge cache is plenty
      // and means /admin edits propagate well before the next ingest.
      "Cache-Control": "public, max-age=1800",
    },
  });
};
