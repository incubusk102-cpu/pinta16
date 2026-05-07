// /api/admin/migrate-r2 — backfill inline base64 product images to R2.
//
// One-shot migration helper for moving an existing storefront's product
// photos from `data:image/...` strings stored inline in the PRODUCTS KV
// record into the R2 bucket bound as `UPLOADS_BUCKET`. New uploads
// already go directly to R2 via /api/uploads, so this endpoint exists
// to clean up everything created before R2 was bound.
//
// GET  → scan summary the admin UI shows before kicking off the work:
//        { scanned, withInline, alreadyR2, totalInlineBytes }.
// POST → process up to `batchSize` (default 5, max 25) products that
//        still have inline data URLs. Returns
//        { migrated, skipped, errors, remaining, bytesRecovered }.
//        The admin UI loops POSTing until `remaining === 0`.
//
// Idempotent: products whose URLs are already R2-prefixed (`/api/r/`)
// are skipped. Same content always hashes to the same key, so re-runs
// never duplicate objects in R2.
//
// Auth: same cookie / Bearer admin gate as every other admin endpoint.

import { wrapHandler } from "../_lib/handler-wrapper.js";
import { isAuthenticated } from "../_lib/admin-auth.js";
import { withSecurityHeaders } from "../_lib/security-headers.js";
import { makeStore } from "../_lib/kv-store.js";
import { getCloudflareEnv } from "../_lib/context.js";

const PRODUCTS_KEY = "all-products";
const DEFAULT_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 25;

const json = (statusCode, body) => ({
  statusCode,
  headers: withSecurityHeaders(),
  body: JSON.stringify(body),
});

const DATA_URL_RE = /^data:image\/(jpeg|jpg|png|webp|avif|gif);base64,/i;

const EXT_FROM_MIME = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

const isDataUrl = (s) => typeof s === "string" && DATA_URL_RE.test(s);

const toHex = (bytes) =>
  Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

const decodeDataUrl = (url) => {
  const match = /^data:([a-z0-9/+.\-]+);base64,(.*)$/i.exec(url);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const b64 = match[2];
  let binary;
  try {
    binary = atob(b64);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { mime, bytes: bytes.buffer };
};

const uploadToR2 = async (env, dataUrl) => {
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) return null;
  const { mime, bytes } = decoded;
  const ext = EXT_FROM_MIME[mime] || "bin";
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = toHex(digest);
  const key = `products/${hash.slice(0, 2)}/${hash}.${ext}`;
  const existing = await env.UPLOADS_BUCKET.head(key).catch(() => null);
  if (!existing) {
    await env.UPLOADS_BUCKET.put(key, bytes, {
      httpMetadata: {
        contentType: mime,
        cacheControl: "public, max-age=31536000, immutable",
      },
    });
  }
  return { url: `/api/r/${key}`, key, byteLength: bytes.byteLength };
};

const countInlineBytes = (product) => {
  let total = 0;
  if (isDataUrl(product?.image)) total += product.image.length;
  if (isDataUrl(product?.mockup)) total += product.mockup.length;
  if (Array.isArray(product?.images)) {
    for (const img of product.images) {
      if (isDataUrl(img?.url)) total += img.url.length;
    }
  }
  return total;
};

const hasInlineImages = (product) => countInlineBytes(product) > 0;

const summarize = (products) => {
  let withInline = 0;
  let alreadyR2 = 0;
  let totalInlineBytes = 0;
  for (const p of products) {
    if (hasInlineImages(p)) {
      withInline += 1;
      totalInlineBytes += countInlineBytes(p);
    } else if (typeof p?.image === "string" && p.image.startsWith("/api/r/")) {
      alreadyR2 += 1;
    }
  }
  return {
    scanned: products.length,
    withInline,
    alreadyR2,
    totalInlineBytes,
  };
};

const migrateProduct = async (env, product) => {
  let bytesRecovered = 0;
  const next = { ...product };

  if (isDataUrl(next.image)) {
    bytesRecovered += next.image.length;
    const result = await uploadToR2(env, next.image);
    if (result) next.image = result.url;
  }

  if (isDataUrl(next.mockup)) {
    bytesRecovered += next.mockup.length;
    const result = await uploadToR2(env, next.mockup);
    if (result) next.mockup = result.url;
  }

  if (Array.isArray(next.images)) {
    const updatedImages = [];
    for (const img of next.images) {
      if (!isDataUrl(img?.url)) {
        updatedImages.push(img);
        continue;
      }
      bytesRecovered += img.url.length;
      const result = await uploadToR2(env, img.url);
      updatedImages.push(result ? { ...img, url: result.url } : img);
    }
    next.images = updatedImages;
  }

  return { product: next, bytesRecovered };
};

export const handler = async (event) => {
  if (!(await isAuthenticated(event))) {
    return json(401, { error: "Not authenticated" });
  }

  const env = getCloudflareEnv();
  if (!env?.PRODUCTS) {
    return json(500, { error: "PRODUCTS KV binding missing" });
  }
  if (!env.UPLOADS_BUCKET) {
    return json(503, {
      error: "r2-not-configured",
      message:
        "R2 bucket binding (UPLOADS_BUCKET) is not configured on this deploy.",
    });
  }

  const store = makeStore(env.PRODUCTS);
  const products = (await store.get(PRODUCTS_KEY, { type: "json" })) || [];
  if (!Array.isArray(products)) {
    return json(500, { error: "PRODUCTS KV value is not an array" });
  }

  if (event.httpMethod === "GET") {
    return json(200, {
      ...summarize(products),
      scannedAt: new Date().toISOString(),
    });
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  let body = {};
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    body = {};
  }
  const dryRun = Boolean(body?.dryRun);
  const requestedBatch = Number(body?.batchSize);
  const batchSize =
    Number.isFinite(requestedBatch) && requestedBatch > 0
      ? Math.min(Math.floor(requestedBatch), MAX_BATCH_SIZE)
      : DEFAULT_BATCH_SIZE;

  const indices = [];
  for (let i = 0; i < products.length && indices.length < batchSize; i++) {
    if (hasInlineImages(products[i])) indices.push(i);
  }

  if (indices.length === 0) {
    return json(200, {
      migrated: 0,
      skipped: 0,
      errors: [],
      remaining: 0,
      bytesRecovered: 0,
      dryRun,
    });
  }

  const next = products.slice();
  const errors = [];
  let migrated = 0;
  let bytesRecovered = 0;

  for (const idx of indices) {
    const product = next[idx];
    try {
      if (dryRun) {
        bytesRecovered += countInlineBytes(product);
        migrated += 1;
        continue;
      }
      const { product: updated, bytesRecovered: bytes } = await migrateProduct(
        env,
        product,
      );
      next[idx] = updated;
      migrated += 1;
      bytesRecovered += bytes;
    } catch (err) {
      errors.push({
        id: product?.id ?? `index-${idx}`,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!dryRun && migrated > 0) {
    await store.setJSON(PRODUCTS_KEY, next);
  }

  const post = dryRun ? products : next;
  const remaining = post.reduce(
    (acc, p) => acc + (hasInlineImages(p) ? 1 : 0),
    0,
  );

  return json(200, {
    migrated,
    skipped: errors.length,
    errors,
    remaining,
    bytesRecovered,
    dryRun,
  });
};

export const onRequest = wrapHandler(handler);
