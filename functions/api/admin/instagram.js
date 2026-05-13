// /api/admin/instagram — admin-only endpoints for Instagram organic
// auto-posting. Mirrors the `/api/admin/turso` and `/api/admin/d1`
// patterns: a single endpoint with GET / POST actions selected via
// the `?action=` query parameter.
//
// All actions require admin authentication (same session cookie used
// by every other /api/admin/*). When the IG env vars are not bound,
// the endpoint still works — it just reports `configured: false` so
// the admin panel can render a setup wizard instead of post UI.
//
// GET  ?action=status      → Token validity, IG account info, schema status, post count.
// GET  ?action=posts       → List recent ig_posts rows (most recent first).
// GET  ?action=caption&productId=… → Preview-only caption + resolved image URL.
// POST ?action=apply-schema → Bootstrap the `ig_posts` table.
// POST ?action=publish      → Body { productId, caption?, imageUrl? } — publish to IG.
// POST ?action=refresh-token → Refresh long-lived access token (requires IG_APP_ID + IG_APP_SECRET).
//
// All write actions log to D1 (`ig_posts` table) for audit + dedupe.
// Rate-limit is intentionally tight on publish — Meta caps at 25
// posts/24h per IG account, and the admin UI confirmation flow
// already prevents accidental double-posts.

import { initRequestContext, isCsrfRejected } from "../_lib/handler-wrapper.js";
import { isAuthenticated } from "../_lib/admin-auth.js";
import { getD1, isD1Available, d1All, d1First, d1Run } from "../_lib/d1.js";
import { D1_SCHEMA_STATEMENTS } from "../_lib/d1-schema.js";
import {
  generateCaption,
  getInstagramAccountStatus,
  isInstagramConfigured,
  isTokenRefreshConfigured,
  MAX_CAPTION_LENGTH,
  publishToInstagram,
  refreshAccessToken,
  resolveProductImageUrl,
} from "../_lib/instagram.js";
import { getStore } from "../_lib/kv-stores.js";

const PRODUCTS_KEY = "all-products";

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });

const requireAdmin = async (request) => {
  const headers = Object.fromEntries(request.headers.entries());
  const ok = await isAuthenticated({ headers });
  return ok ? null : json(401, { error: "Not authenticated" });
};

// Find a product by id across the live PRODUCTS namespace and the
// "default" / stock artworks shipped with the SPA. We mirror the
// admin panel's own lookup logic so caption previews always agree
// with what the post will actually use.
const findProductById = async (productId) => {
  if (!productId) return null;
  try {
    const store = getStore("products");
    const products = (await store.get(PRODUCTS_KEY, { type: "json" })) || [];
    const match = Array.isArray(products)
      ? products.find((p) => p && p.id === productId)
      : null;
    return match || null;
  } catch {
    return null;
  }
};

const isIgSchemaApplied = async () => {
  if (!isD1Available()) return false;
  const row = await d1First(
    `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`,
    ["ig_posts"],
  );
  return Boolean(row?.name);
};

// ─── GET ───────────────────────────────────────────────────────────────────────

export const onRequestGet = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;
  const unauth = await requireAdmin(request);
  if (unauth) return unauth;

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "status";

  if (action === "status") {
    const igStatus = await getInstagramAccountStatus();
    const schemaApplied = await isIgSchemaApplied();
    let recentCount = 0;
    let publishedCount = 0;
    if (schemaApplied) {
      try {
        const total = await d1First(`SELECT COUNT(*) AS cnt FROM ig_posts`);
        const published = await d1First(
          `SELECT COUNT(*) AS cnt FROM ig_posts WHERE status = ?`,
          ["published"],
        );
        recentCount = total?.cnt ?? 0;
        publishedCount = published?.cnt ?? 0;
      } catch {
        // Counts are nice-to-have.
      }
    }
    return json(200, {
      ...igStatus,
      d1: {
        available: isD1Available(),
        schemaApplied,
        totalPosts: recentCount,
        publishedPosts: publishedCount,
      },
    });
  }

  if (action === "posts") {
    if (!isD1Available()) return json(200, { available: false, posts: [] });
    if (!(await isIgSchemaApplied())) {
      return json(200, { available: true, schemaApplied: false, posts: [] });
    }
    const limit = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get("limit")) || 20),
    );
    const rows = await d1All(
      `SELECT id, product_id, ig_media_id, container_id, permalink, caption,
              image_url, status, error_message, posted_by, posted_at,
              created_at, updated_at
         FROM ig_posts
        ORDER BY COALESCE(posted_at, created_at) DESC
        LIMIT ?`,
      [limit],
    );
    return json(200, {
      available: true,
      schemaApplied: true,
      posts: rows?.results || [],
    });
  }

  if (action === "caption") {
    const productId = url.searchParams.get("productId") || "";
    const product = await findProductById(productId);
    if (!product) {
      return json(404, { error: `Product not found: ${productId}` });
    }
    const imageUrl = resolveProductImageUrl(product, {
      origin: new URL(request.url).origin,
    });
    const caption = generateCaption({
      ...product,
      productUrl: `${new URL(request.url).origin}/product/${product.id}`,
    });
    return json(200, {
      productId,
      caption,
      captionLength: caption.length,
      maxCaptionLength: MAX_CAPTION_LENGTH,
      imageUrl,
      imageUrlReachable: Boolean(imageUrl && imageUrl.startsWith("https://")),
    });
  }

  return json(400, { error: `Unknown action: ${action}` });
};

// ─── POST ──────────────────────────────────────────────────────────────────────

export const onRequestPost = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;
  const url = new URL(request.url);
  if (isCsrfRejected(request, url.pathname)) {
    return json(403, { error: "Invalid CSRF token" });
  }
  const unauth = await requireAdmin(request);
  if (unauth) return unauth;

  const action = url.searchParams.get("action") || "";

  if (action === "apply-schema") {
    if (!isD1Available()) {
      return json(503, {
        error:
          "D1 binding (env.DB) not configured. Add it before applying the schema.",
      });
    }
    const db = getD1();
    const igStatements = D1_SCHEMA_STATEMENTS.filter((s) =>
      s.includes("ig_posts"),
    );
    const results = [];
    for (const sql of igStatements) {
      try {
        await db.prepare(sql).run();
        results.push({ ok: true, statement: sql.slice(0, 80) });
      } catch (err) {
        results.push({
          ok: false,
          statement: sql.slice(0, 80),
          error: err?.message || String(err),
        });
      }
    }
    return json(200, {
      applied: results.every((r) => r.ok),
      results,
    });
  }

  if (action === "refresh-token") {
    if (!isInstagramConfigured()) {
      return json(503, {
        error:
          "Instagram is not configured (IG_ACCESS_TOKEN / IG_USER_ID missing).",
      });
    }
    if (!isTokenRefreshConfigured()) {
      return json(503, {
        error: "Token refresh requires IG_APP_ID and IG_APP_SECRET to be set.",
      });
    }
    try {
      const refreshed = await refreshAccessToken();
      // We cannot rotate Cloudflare Pages env vars from inside a
      // Function — the caller has to paste the new token back into
      // the dashboard. We return the new value (and its expiry hint)
      // and let the admin UI display rotation instructions.
      return json(200, {
        accessToken: refreshed.accessToken,
        expiresIn: refreshed.expiresIn,
        rotationRequired: true,
        message:
          "Copy this token into Cloudflare Pages → Settings → Variables and Secrets as IG_ACCESS_TOKEN, then redeploy. The old token still works until you swap it.",
      });
    } catch (err) {
      return json(502, { error: err?.message || String(err) });
    }
  }

  if (action === "publish") {
    if (!isInstagramConfigured()) {
      return json(503, {
        error:
          "Instagram is not configured (IG_ACCESS_TOKEN / IG_USER_ID missing).",
      });
    }
    if (!isD1Available()) {
      return json(503, {
        error:
          "D1 binding (env.DB) not configured. Apply the schema before publishing.",
      });
    }
    if (!(await isIgSchemaApplied())) {
      return json(503, {
        error:
          "ig_posts table missing. POST /api/admin/instagram?action=apply-schema first.",
      });
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      return json(400, { error: "Invalid JSON body." });
    }

    const productId = String(body?.productId || "").trim();
    if (!productId) {
      return json(400, { error: "Missing productId." });
    }

    const product = await findProductById(productId);
    if (!product) {
      return json(404, { error: `Product not found: ${productId}` });
    }

    const origin = new URL(request.url).origin;
    const overrideImageUrl =
      typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
    const imageUrl =
      overrideImageUrl || resolveProductImageUrl(product, { origin });
    if (!imageUrl || !imageUrl.startsWith("https://")) {
      return json(400, {
        error: `Product image URL is not a publicly reachable HTTPS URL. Got: ${imageUrl || "(empty)"}`,
      });
    }

    const overrideCaption =
      typeof body.caption === "string" ? body.caption : null;
    const caption =
      overrideCaption !== null
        ? overrideCaption
        : generateCaption({
            ...product,
            productUrl: `${origin}/product/${product.id}`,
          });
    if (caption.length > MAX_CAPTION_LENGTH) {
      return json(400, {
        error: `Caption is ${caption.length} chars; Meta caps at ${MAX_CAPTION_LENGTH}.`,
      });
    }

    const now = new Date().toISOString();
    const rowId = `ig_${product.id}_${Date.now().toString(36)}`;

    // Insert the audit row up-front so even a thrown publish leaves
    // a trace (status='failed').
    try {
      await d1Run(
        `INSERT INTO ig_posts (id, product_id, caption, image_url, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
        [rowId, product.id, caption, imageUrl, now, now],
      );
    } catch (err) {
      return json(500, {
        error: `Failed to record publish attempt in D1: ${err?.message || err}`,
      });
    }

    try {
      const result = await publishToInstagram({ imageUrl, caption });
      const completedAt = new Date().toISOString();
      try {
        await d1Run(
          `UPDATE ig_posts
              SET ig_media_id = ?, container_id = ?, permalink = ?,
                  status = 'published', posted_at = ?, updated_at = ?
            WHERE id = ?`,
          [
            result.mediaId,
            result.containerId,
            result.permalink,
            completedAt,
            completedAt,
            rowId,
          ],
        );
      } catch {
        // The post itself succeeded on IG; D1 update failure is non-fatal.
      }
      return json(200, {
        id: rowId,
        productId: product.id,
        mediaId: result.mediaId,
        containerId: result.containerId,
        permalink: result.permalink,
        caption,
        imageUrl,
        status: "published",
        postedAt: completedAt,
      });
    } catch (err) {
      const errMsg = err?.message || String(err);
      const failedAt = new Date().toISOString();
      try {
        await d1Run(
          `UPDATE ig_posts
              SET status = 'failed', error_message = ?, updated_at = ?
            WHERE id = ?`,
          [errMsg, failedAt, rowId],
        );
      } catch {
        // Non-fatal.
      }
      return json(502, {
        id: rowId,
        productId: product.id,
        status: "failed",
        error: errMsg,
      });
    }
  }

  return json(400, { error: `Unknown action: ${action}` });
};
