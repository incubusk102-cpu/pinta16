// Pure server-side filter + sort helpers for the products API.
//
// Kept in `_lib/` so the public products endpoint and any future
// admin search endpoint can share the same predicates and sort keys
// — the wire shape (what counts as "newest", what "in-stock"
// means, etc.) needs to stay consistent across the codebase.
//
// All functions take a fresh array and return a new array. The
// inputs are never mutated.

import { getEffectivePrice } from "./product-pricing.js";

// Availability buckets used by the public storefront. Draft products
// are always hidden from `availability=in-stock` matches because a
// draft is by definition not yet listed.
const IN_STOCK_AVAILABILITIES = new Set([
  "available",
  "made-to-order",
  "reserved",
]);

// Price band definitions mirrored from the storefront UI. Keeping the
// canonical predicates here lets the API accept the same bucket-id
// vocabulary the gallery shows on its filter chips (`lt-3000`,
// `3000-3500`, etc.) without each client having to translate to
// numeric min/max.
const PRICE_BUCKET_DEFS = {
  "lt-3000": (p) => p < 3000,
  "3000-3500": (p) => p >= 3000 && p <= 3500,
  "3500-3800": (p) => p > 3500 && p <= 3800,
  "3800-4500": (p) => p > 3800 && p <= 4500,
  "gt-4500": (p) => p > 4500,
};

// Normalise a single value or comma-separated list into a clean
// non-empty array. Used so callers can pass either a string ("Art")
// or a list (`["Art", "Photo"]` / `"Art,Photo"`).
const toList = (raw) => {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw
      .flatMap((v) =>
        typeof v === "string" ? v.split(",").map((s) => s.trim()) : [],
      )
      .filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
};

const matchesAvailabilityValue = (productAvailability, value) => {
  const v = value.toLowerCase();
  if (v === "in-stock") return IN_STOCK_AVAILABILITIES.has(productAvailability);
  if (v === "sold") return productAvailability === "sold";
  return productAvailability === v;
};

const matchesAvailabilityAny = (product, values) => {
  if (values.length === 0) return true;
  const value = (product.availability || "available").toLowerCase();
  return values.some((v) => matchesAvailabilityValue(value, v));
};

const matchesCategoryAny = (product, values) => {
  if (values.length === 0) return true;
  const cat = (product.category || "").trim();
  return values.some((c) => c === cat);
};

const matchesPriceBucketAny = (product, buckets) => {
  if (buckets.length === 0) return true;
  const price = getEffectivePrice(product);
  return buckets.some((b) => {
    const fn = PRICE_BUCKET_DEFS[b];
    return typeof fn === "function" ? fn(price) : false;
  });
};

const matchesSearch = (product, query) => {
  if (!query) return true;
  const needle = query.toLowerCase();
  const haystack = [
    product.title,
    product.description,
    product.medium,
    product.category,
    product.year,
    product.dimensions,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
};

/**
 * Filter products by an arbitrary subset of dimensions. Every filter
 * is optional; an empty / missing filter is treated as "no constraint
 * on this dimension".
 *
 * Filters:
 *   - `category`: string or string[] of category names (exact match,
 *     union if multiple)
 *   - `availability`: string or string[]. Special tokens "in-stock"
 *     (matches available / made-to-order / reserved) and "sold" are
 *     supported alongside raw availability values like "draft".
 *   - `priceMin` / `priceMax`: numeric range over the effective price
 *     (sale price when active, otherwise list price).
 *   - `priceBuckets`: string or string[] of bucket ids matching the
 *     storefront filter chips (`lt-3000`, `3000-3500`, …, `gt-4500`).
 *   - `search`: substring match across title / description / medium /
 *     category / year / dimensions.
 */
export const filterProducts = (products, filters = {}) => {
  const categories = toList(filters.category);
  const availabilities = toList(filters.availability);
  const priceBuckets = toList(filters.priceBuckets);
  const minNum =
    typeof filters.priceMin === "number" && Number.isFinite(filters.priceMin)
      ? filters.priceMin
      : null;
  const maxNum =
    typeof filters.priceMax === "number" && Number.isFinite(filters.priceMax)
      ? filters.priceMax
      : null;
  const trimmedSearch =
    typeof filters.search === "string" ? filters.search.trim() : "";

  if (
    categories.length === 0 &&
    availabilities.length === 0 &&
    priceBuckets.length === 0 &&
    minNum === null &&
    maxNum === null &&
    !trimmedSearch
  ) {
    return [...products];
  }

  return products.filter((product) => {
    if (!matchesCategoryAny(product, categories)) return false;
    if (!matchesAvailabilityAny(product, availabilities)) return false;
    if (!matchesPriceBucketAny(product, priceBuckets)) return false;
    if (minNum !== null || maxNum !== null) {
      const price = getEffectivePrice(product);
      if (minNum !== null && price < minNum) return false;
      if (maxNum !== null && price > maxNum) return false;
    }
    if (trimmedSearch && !matchesSearch(product, trimmedSearch)) return false;
    return true;
  });
};

// Stable sort that returns a new array. Keys mirror the storefront's
// public sort UI so the hook can pass through whatever the dropdown
// selected without translation.
export const sortProducts = (products, sortKey = "newest") => {
  const copy = [...products];
  const collator = new Intl.Collator("en", { sensitivity: "base" });
  switch (sortKey) {
    case "oldest":
      return copy.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    case "price-asc":
      return copy.sort((a, b) => getEffectivePrice(a) - getEffectivePrice(b));
    case "price-desc":
      return copy.sort((a, b) => getEffectivePrice(b) - getEffectivePrice(a));
    case "title-az":
      return copy.sort((a, b) =>
        collator.compare(a.title || "", b.title || ""),
      );
    case "title-za":
      return copy.sort((a, b) =>
        collator.compare(b.title || "", a.title || ""),
      );
    case "newest":
    default:
      return copy.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }
};
