// /api/products — public list, admin-gated create/delete.
import { initRequestContext } from "./_lib/handler-wrapper.js";
import { logError } from "./_lib/redact.js";
// KV namespace: PRODUCTS (single key "all-products" → JSON array).
//
// Cloudflare Pages Function port of netlify/functions/products.js. Same wire
// shape so the React app doesn't have to change at all.

import { makeStore } from "./_lib/kv-store.js";
import { isAuthenticated } from "./_lib/admin-auth.js";
import { buildLambdaEvent } from "./_lib/lambda-event.js";
import { recordStockEvent, STOCK_STATES } from "./_lib/d1.js";
import { publishProductPhoto, shouldAutoPostProduct } from "./_lib/tiktok.js";
import {
  filterProducts,
  sortProducts as filterSort,
} from "./_lib/product-filter.js";

// Maximum page size when callers don't ask for `?all=true`. Picked
// so a 4-column gallery grid fills a couple of viewports per page
// without us having to think about every screen size individually.
const DEFAULT_PAGE_LIMIT = 24;
const MAX_PAGE_LIMIT = 100;

const parsePositiveInt = (raw) => {
  if (raw == null) return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.floor(num);
};

const parseFloatOrNull = (raw) => {
  if (raw == null || raw === "") return null;
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  return num;
};

// Parse and clamp every list/page query param up front so the handler
// branch below stays straightforward. Returns the literal `all=true`
// escape hatch as a flag too, so the caller can decide whether to
// short-circuit out to the legacy full-array response.
const parseListQuery = (url) => {
  const params = url.searchParams;
  const wantAll = params.get("all") === "true";
  const rawLimit = parsePositiveInt(params.get("limit"));
  const limit = rawLimit
    ? Math.min(rawLimit, MAX_PAGE_LIMIT)
    : DEFAULT_PAGE_LIMIT;

  // Accept both repeated query params (`?category=A&category=B`) and
  // comma-separated values (`?category=A,B`) — `filterProducts`
  // normalises either shape into a clean list.
  const allCategories = params.getAll("category");
  const allAvailabilities = params.getAll("availability");
  const allBuckets = params.getAll("priceBuckets");
  const filters = {
    category: allCategories.length > 0 ? allCategories : undefined,
    availability: allAvailabilities.length > 0 ? allAvailabilities : undefined,
    priceBuckets: allBuckets.length > 0 ? allBuckets : undefined,
    priceMin: parseFloatOrNull(params.get("priceMin")) ?? undefined,
    priceMax: parseFloatOrNull(params.get("priceMax")) ?? undefined,
    search: params.get("search") || undefined,
  };
  const sort = params.get("sort") || "newest";
  const cursor = params.get("cursor") || null;

  return { wantAll, limit, filters, sort, cursor };
};

const normaliseAvailability = (value) => {
  if (typeof value !== "string") return "available";
  const v = value.trim().toLowerCase();
  return STOCK_STATES.has(v) ? v : "available";
};

// Fire-and-forget D1 logging for product availability transitions.
// Wrapped in a guard so a D1 hiccup can never break the KV write or
// the user response. KV is the source of truth; this is the queryable
// mirror.
const logStockTransition = async ({
  productId,
  productTitle,
  category,
  fromState,
  toState,
  source,
}) => {
  try {
    await recordStockEvent({
      productId,
      productTitle,
      category,
      fromState,
      toState,
      source,
      actor: "admin",
    });
  } catch (err) {
    logError("stock-event log failed:", err);
  }
};

const PRODUCTS_KEY = "all-products";

const json = (status, data, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });

const sortProducts = (products = []) =>
  [...products].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

const readProducts = async (store) => {
  const products = await store.get(PRODUCTS_KEY, { type: "json" });
  return Array.isArray(products) ? products : [];
};

const parseBody = (body) => {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
};

// Accept https:// URLs and the in-app proxy path /api/r/...
// Reject javascript:, data:, vbscript:, and any other scheme.
const isSafeMediaUrl = (value) => {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/api/r/") || trimmed.startsWith("/")) return true;
  if (/^https:\/\//i.test(trimmed)) return true;
  return false;
};

const sanitizeVideo = (raw) => {
  if (!raw || typeof raw !== "object") return undefined;
  const url = typeof raw.url === "string" ? raw.url.trim() : "";
  if (!isSafeMediaUrl(url)) return undefined;
  const cleaned = { url };
  if (typeof raw.posterUrl === "string" && isSafeMediaUrl(raw.posterUrl)) {
    cleaned.posterUrl = raw.posterUrl.trim();
  }
  if (typeof raw.fileName === "string" && raw.fileName.trim()) {
    cleaned.fileName = raw.fileName.trim().slice(0, 200);
  }
  if (
    typeof raw.bytes === "number" &&
    Number.isFinite(raw.bytes) &&
    raw.bytes >= 0
  ) {
    cleaned.bytes = Math.floor(raw.bytes);
  }
  if (typeof raw.mimeType === "string" && raw.mimeType.trim()) {
    cleaned.mimeType = raw.mimeType.trim().slice(0, 100);
  }
  return cleaned;
};

const handle = async ({ request, env, waitUntil }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;
  if (!env.PRODUCTS) {
    return json(500, { error: "PRODUCTS KV binding missing" });
  }
  const store = makeStore(env.PRODUCTS);
  const event = await buildLambdaEvent(request);
  const method = request.method;

  try {
    if (method === "GET") {
      const all = await readProducts(store);
      const url = new URL(request.url);
      const { wantAll, limit, filters, sort, cursor } = parseListQuery(url);

      // Admin pages still expect the full array to power things like
      // bulk-edit and the dashboard's per-status counts. They opt in
      // explicitly with `?all=true`, which skips filtering, sorting,
      // and pagination — the wire shape stays exactly what the SPA
      // shipped with before this endpoint learned to paginate.
      if (wantAll) {
        return json(200, { products: sortProducts(all) });
      }

      // Public paginated responses always hide drafts and live
      // embargoes so the storefront doesn't have to filter them
      // after the fact (which would break the page-count math). The
      // admin `?all=true` path above leaves the array untouched so
      // dashboards / bulk edit still see the full set.
      const now = Date.now();
      const visible = all.filter((p) => {
        if ((p.availability || "available") === "draft") return false;
        if (p.embargoUntil) {
          const t = new Date(p.embargoUntil).getTime();
          if (!Number.isNaN(t) && t > now) return false;
        }
        return true;
      });

      const filtered = filterProducts(visible, filters);
      const sorted = filterSort(filtered, sort);
      // Resolve the cursor to a slice offset by id-lookup. A stale
      // cursor (product deleted between pages, or the filter set
      // narrowed so the id no longer appears) falls back to offset 0
      // so the client just re-renders from the top rather than
      // erroring out.
      const cursorIndex = cursor
        ? sorted.findIndex((p) => p.id === cursor)
        : -1;
      const start = cursorIndex >= 0 ? cursorIndex + 1 : 0;
      const slice = sorted.slice(start, start + limit);
      const nextCursor =
        start + limit < sorted.length && slice.length > 0
          ? slice[slice.length - 1].id
          : null;
      return json(200, {
        products: slice,
        nextCursor,
        hasMore: nextCursor !== null,
        total: sorted.length,
      });
    }

    if (method === "POST") {
      if (!(await isAuthenticated(event))) {
        return json(401, { error: "Not authenticated" });
      }
      const product = parseBody(event.body);
      if (!product?.id || !product?.image || !product?.title) {
        return json(400, { error: "Invalid product payload" });
      }
      const sanitizedVideo = sanitizeVideo(product.video);
      if (sanitizedVideo) {
        product.video = sanitizedVideo;
      } else {
        delete product.video;
      }
      const existing = await readProducts(store);
      const prior = existing.find((item) => item.id === product.id);
      const next = sortProducts([
        product,
        ...existing.filter((item) => item.id !== product.id),
      ]);
      await store.setJSON(PRODUCTS_KEY, next);
      // Record the availability transition — only when it actually
      // changes (or when the product is brand new) so the admin's
      // event timeline isn't drowned in no-op edits.
      const fromState = prior
        ? normaliseAvailability(prior.availability)
        : null;
      const toState = normaliseAvailability(product.availability);
      if (!prior || fromState !== toState) {
        await logStockTransition({
          productId: product.id,
          productTitle: product.title,
          category: product.category,
          fromState,
          toState,
          source: prior ? "admin-edit" : "admin-create",
        });
      }
      // Fire-and-forget TikTok auto-post for brand-new products.
      // Uses waitUntil so the background job survives after the
      // response is returned — never blocks the product save.
      if (!prior) {
        const autoPost = async () => {
          try {
            const check = await shouldAutoPostProduct(product);
            if (!check.ok) return;
            const url = new URL(request.url);
            const origin = `${url.protocol}//${url.host}`;
            await publishProductPhoto({
              product,
              origin,
              source: "auto-create",
            });
          } catch {
            // Swallow — never let a TikTok hiccup surface as a
            // product-save error.
          }
        };
        if (typeof waitUntil === "function") {
          waitUntil(autoPost());
        } else {
          autoPost();
        }
      }
      return json(200, { product });
    }

    if (method === "DELETE") {
      if (!(await isAuthenticated(event))) {
        return json(401, { error: "Not authenticated" });
      }
      const { id } = parseBody(event.body);
      if (!id) return json(400, { error: "Product id is required" });
      const existing = await readProducts(store);
      const prior = existing.find((p) => p.id === id);
      const next = existing.filter((p) => p.id !== id);
      await store.setJSON(PRODUCTS_KEY, next);
      if (prior) {
        await logStockTransition({
          productId: prior.id,
          productTitle: prior.title,
          category: prior.category,
          fromState: normaliseAvailability(prior.availability),
          toState: "deleted",
          source: "admin-delete",
        });
      }
      return json(200, { id });
    }

    if (method === "PATCH") {
      if (!(await isAuthenticated(event))) {
        return json(401, { error: "Not authenticated" });
      }
      const body = parseBody(event.body);
      const ids = body.ids;
      const updates = body.updates;
      if (!Array.isArray(ids) || !ids.length || ids.length > 200) {
        return json(400, { error: "ids must be a non-empty array (max 200)" });
      }
      if (!updates || typeof updates !== "object") {
        return json(400, { error: "updates must be an object" });
      }
      const allowed = [
        "price",
        "salePrice",
        "availability",
        "category",
        "medium",
      ];
      const keys = Object.keys(updates);
      if (!keys.length || keys.some((k) => !allowed.includes(k))) {
        return json(400, {
          error: `Only these fields can be bulk-edited: ${allowed.join(", ")}`,
        });
      }
      const existing = await readProducts(store);
      const idSet = new Set(ids.map(String));
      const transitions = [];
      let changed = 0;
      const next = existing.map((p) => {
        if (!idSet.has(p.id)) return p;
        changed++;
        const merged = { ...p };
        if (typeof updates.price === "number" && updates.price >= 0) {
          merged.price = updates.price;
        }
        if (updates.salePrice !== undefined) {
          merged.salePrice =
            typeof updates.salePrice === "number" && updates.salePrice > 0
              ? updates.salePrice
              : undefined;
        }
        if (
          typeof updates.availability === "string" &&
          ["available", "made-to-order", "reserved", "sold", "draft"].includes(
            updates.availability,
          )
        ) {
          merged.availability = updates.availability;
        }
        if (typeof updates.category === "string") {
          merged.category = updates.category.slice(0, 60);
        }
        if (typeof updates.medium === "string") {
          merged.medium = updates.medium.slice(0, 60);
        }
        if (
          typeof updates.availability === "string" &&
          merged.availability !== p.availability
        ) {
          transitions.push({
            productId: p.id,
            productTitle: p.title,
            category: merged.category || p.category,
            fromState: normaliseAvailability(p.availability),
            toState: normaliseAvailability(merged.availability),
            source: "admin-bulk",
          });
        }
        return merged;
      });
      if (changed > 0) {
        await store.setJSON(PRODUCTS_KEY, next);
      }
      for (const t of transitions) {
        await logStockTransition(t);
      }
      return json(200, { changed });
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    logError("products handler error:", error);
    return json(500, { error: "Could not manage products" });
  }
};

export const onRequestGet = handle;
export const onRequestPost = handle;
export const onRequestDelete = handle;
export const onRequestPatch = handle;
