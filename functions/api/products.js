// /api/products — public list, admin-gated create/delete.
import { initRequestContext } from "./_lib/handler-wrapper.js";
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
    headers: { "Content-Type": "application/json", ...extraHeaders },
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

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    console.error("products handler error:", error);
    return json(500, { error: "Could not manage products" });
  }
};

export const onRequestGet = handle;
export const onRequestPost = handle;
export const onRequestDelete = handle;
