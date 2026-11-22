// product-reviews — helper for collating "published to homepage"
// reviews per product, used by the SSR middleware to inject
// aggregateRating + a handful of recent review snippets into the
// Product JSON-LD that crawlers see.
//
// Reviews live on the order ("orderInfo + items + review/reviews")
// inside the ORDERS KV namespace. We do NOT have a per-product
// review index, so we read the whole `all-orders` blob and filter.
// At canvhub scale (low-thousands of orders) that's a fine,
// edge-cached one-time read; we additionally wrap the per-product
// aggregate in the colo's `caches.default` for 5 minutes so the
// middleware doesn't redo the work on every request to the same
// product page.
//
// Cache strategy:
//   - Key: synthetic URL `https://canvhub.com/__internal__/review-summary/<id>`
//     so the colo's KV cache treats each product as its own entry.
//   - TTL: 5 min — short enough that publishing a new review surfaces
//     fast, long enough to absorb the load when a product is shared.
//   - Failures are swallowed: if KV is unbound, JSON parse fails, or
//     the cache layer hiccups, we return `null` and the caller falls
//     back to the unenriched Product JSON-LD.

import { makeStore } from "./kv-store.js";

const ORDERS_KEY = "all-orders";
const SUMMARY_CACHE_TTL_S = 5 * 60;
const SUMMARY_CACHE_HOST = "https://canvhub.com";

// Limit the number of full-text reviews embedded in JSON-LD. Three is
// enough to convince a crawler the product has real social proof
// without blowing up the size of the HTML response.
const MAX_REVIEWS_IN_LD = 3;

// Truncate review prose to keep the page byte-budget under control.
// Crawlers don't need the full text of a 2000-character review.
const REVIEW_TEXT_LIMIT = 320;

const truncate = (s, max) => {
  const str = String(s || "")
    .replace(/\s+/g, " ")
    .trim();
  if (str.length <= max) return str;
  return `${str.slice(0, Math.max(0, max - 1))}…`;
};

// Try to grab a cached summary from the colo cache. Returns null on any
// failure — we never let the cache layer break the SSR response.
const readCached = async (cache, cacheKey) => {
  if (!cache) return null;
  try {
    const hit = await cache.match(cacheKey);
    if (!hit) return null;
    const parsed = await hit.json();
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

// Stash a freshly-computed summary in the colo cache. Failures are
// non-fatal (best-effort).
const writeCached = async (cache, cacheKey, value) => {
  if (!cache) return;
  try {
    const body = JSON.stringify(value);
    const res = new Response(body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${SUMMARY_CACHE_TTL_S}`,
      },
    });
    await cache.put(cacheKey, res);
  } catch {
    // ignored
  }
};

const safeNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Pull every published-to-homepage review attached to the given
// productId out of the ORDERS blob. Treats both legacy single
// `review` and current `reviews[]` shapes.
const collectReviewsForProduct = (orders, productId) => {
  if (!Array.isArray(orders)) return [];
  const out = [];
  for (const order of orders) {
    if (!order) continue;
    const list = Array.isArray(order.reviews)
      ? order.reviews
      : order.review
        ? [order.review]
        : [];
    if (list.length === 0) continue;
    const firstName = String(order?.orderInfo?.fullName || "")
      .trim()
      .split(/\s+/)[0];
    for (const r of list) {
      if (!r) continue;
      if (!r.publishedToHomepage) continue;
      if ((r.productId || "") !== productId) continue;
      const rating = safeNumber(r.rating);
      if (rating === null) continue;
      out.push({
        rating,
        text: typeof r.text === "string" ? r.text : "",
        submittedAt: typeof r.submittedAt === "string" ? r.submittedAt : "",
        customerName: firstName || "Customer",
      });
    }
  }
  return out;
};

// Build the publicly-shaped summary: aggregate plus up to N most
// recent reviews. Returns null when no qualifying reviews exist so
// callers can short-circuit (a Product graph with `aggregateRating:
// { reviewCount: 0 }` is worse than no aggregateRating at all —
// Google's structured-data tester rejects the former).
const buildSummary = (reviews) => {
  if (reviews.length === 0) return null;
  const total = reviews.reduce((acc, r) => acc + r.rating, 0);
  const average = total / reviews.length;
  const sorted = [...reviews].sort((a, b) => {
    const ta = new Date(a.submittedAt).getTime() || 0;
    const tb = new Date(b.submittedAt).getTime() || 0;
    return tb - ta;
  });
  const recent = sorted.slice(0, MAX_REVIEWS_IN_LD).map((r) => ({
    rating: r.rating,
    text: truncate(r.text, REVIEW_TEXT_LIMIT),
    submittedAt: r.submittedAt,
    customerName: r.customerName,
  }));
  return {
    count: reviews.length,
    average: Math.round(average * 100) / 100,
    recent,
  };
};

// Public: get the review summary for a product. The signature
// accepts an optional `cache` (the Cache API instance) so unit tests
// can pass a no-op cache and exercise the KV path deterministically.
export const getProductReviewSummary = async (
  env,
  productId,
  { cache = null } = {},
) => {
  if (!env?.ORDERS) return null;
  if (typeof productId !== "string" || !productId) return null;

  const cacheKey = new Request(
    `${SUMMARY_CACHE_HOST}/__internal__/review-summary/${encodeURIComponent(productId)}`,
  );
  const colo = cache ?? (typeof caches !== "undefined" ? caches.default : null);

  const cached = await readCached(colo, cacheKey);
  if (cached) return cached.count > 0 ? cached : null;

  let orders;
  try {
    const store = makeStore(env.ORDERS);
    orders = await store.get(ORDERS_KEY, { type: "json" });
  } catch {
    return null;
  }

  const reviews = collectReviewsForProduct(orders, productId);
  const summary = buildSummary(reviews);
  // Cache even the "no published reviews yet" case as `{count: 0}`
  // so popular-but-unreviewed products don't redo the full orders
  // scan every request.
  await writeCached(
    colo,
    cacheKey,
    summary ?? { count: 0, average: 0, recent: [] },
  );
  return summary;
};

// Export internals for unit tests. Not part of the public surface.
export const __test__ = {
  collectReviewsForProduct,
  buildSummary,
  truncate,
  REVIEW_TEXT_LIMIT,
  MAX_REVIEWS_IN_LD,
};
