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

const handle = async ({ request, env }) => {
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
      const products = sortProducts(await readProducts(store));
      return json(200, { products });
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
      const next = sortProducts([
        product,
        ...existing.filter((item) => item.id !== product.id),
      ]);
      await store.setJSON(PRODUCTS_KEY, next);
      return json(200, { product });
    }

    if (method === "DELETE") {
      if (!(await isAuthenticated(event))) {
        return json(401, { error: "Not authenticated" });
      }
      const { id } = parseBody(event.body);
      if (!id) return json(400, { error: "Product id is required" });
      const existing = await readProducts(store);
      const next = existing.filter((p) => p.id !== id);
      await store.setJSON(PRODUCTS_KEY, next);
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
          ["available", "reserved", "sold", "draft"].includes(
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
        return merged;
      });
      if (changed > 0) {
        await store.setJSON(PRODUCTS_KEY, next);
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
