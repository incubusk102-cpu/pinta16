// /api/admin/tiktok — admin endpoint for TikTok auto-posting.
//
// GET  ?action=status                    → connection + token + creator info
// GET  ?action=posts&limit=50            → recent rows from `tiktok_posts`
// GET  ?action=caption&productId=...     → server-rendered caption + image URL
// GET  ?action=connect-url               → mints a state token + returns the
//                                          OAuth authorize URL to redirect to
// POST ?action=apply-schema              → bootstrap the `tiktok_posts` table
// POST ?action=publish                   → init + poll a publish job, write
//                                          the result row to D1
// POST ?action=refresh-token             → manually refresh the access token
// POST ?action=disconnect                → wipe the stored OAuth bundle
//
// All actions require admin auth (same session cookie as the rest of
// /admin) plus the standard CSRF check on POSTs.

import { initRequestContext, isCsrfRejected } from "../_lib/handler-wrapper.js";
import { isAuthenticated } from "../_lib/admin-auth.js";
import {
  buildAuthorizeUrl,
  clearStoredAuth,
  generateTikTokCaption,
  getTikTokAccountStatus,
  initPhotoPost,
  isTikTokConfigured,
  pollPublishStatus,
  refreshAccessToken,
  resolveProductImageUrl,
  MAX_CAPTION_LENGTH,
} from "../_lib/tiktok.js";
import { getStore } from "../_lib/kv-stores.js";
import { makeStore } from "../_lib/kv-store.js";
import { isD1Available, d1Run, d1All, d1First } from "../_lib/d1.js";
import { D1_SCHEMA_STATEMENTS } from "../_lib/d1-schema.js";

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
    },
  });

const requireAdmin = async (request) => {
  const headers = Object.fromEntries(request.headers.entries());
  const ok = await isAuthenticated({ headers });
  return ok ? null : json(401, { error: "Not authenticated" });
};

const PRODUCTS_KEY = "all-products";
const TIKTOK_OAUTH_STATE_KEY = "tiktok_oauth_state";

// Look up a product in KV by id. Returns null if not found.
const findProductById = async (productId) => {
  const store = getStore("products");
  const raw = await store.get(PRODUCTS_KEY, { type: "json" });
  const list = Array.isArray(raw) ? raw : [];
  return list.find((p) => p && p.id === productId) || null;
};

const nowIso = () => new Date().toISOString();
const newId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // Fallback for environments without randomUUID (shouldn't happen on Workers).
  return `tk_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const isSchemaApplied = async () => {
  if (!isD1Available()) return false;
  try {
    const row = await d1First(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      ["tiktok_posts"],
    );
    return Boolean(row);
  } catch {
    return false;
  }
};

const applySchema = async () => {
  if (!isD1Available()) return { ok: false, error: "D1 not configured" };
  try {
    for (const sql of D1_SCHEMA_STATEMENTS) {
      // Only run the tiktok_posts statements when bootstrapping
      // through this endpoint. The other tables come along for the
      // ride because they're idempotent (`IF NOT EXISTS`) — keeps
      // schema parity if D1 was created fresh after the table
      // already existed in main.
      await d1Run(sql);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
};

// ─── GET ───────────────────────────────────────────────────────────────────────

export const onRequestGet = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;
  const unauth = await requireAdmin(request);
  if (unauth) return unauth;

  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;
  const action = url.searchParams.get("action") || "status";

  if (action === "status") {
    const status = await getTikTokAccountStatus({ origin });
    const schemaApplied = await isSchemaApplied();
    let counts = null;
    if (schemaApplied) {
      try {
        const total = await d1First(`SELECT COUNT(*) AS cnt FROM tiktok_posts`);
        const published = await d1First(
          `SELECT COUNT(*) AS cnt FROM tiktok_posts WHERE status='published'`,
        );
        const failed = await d1First(
          `SELECT COUNT(*) AS cnt FROM tiktok_posts WHERE status='failed'`,
        );
        counts = {
          total: total?.cnt ?? 0,
          published: published?.cnt ?? 0,
          failed: failed?.cnt ?? 0,
        };
      } catch {
        counts = null;
      }
    }
    return json(200, {
      ...status,
      d1Available: isD1Available(),
      schemaApplied,
      counts,
    });
  }

  if (action === "posts") {
    if (!isD1Available()) {
      return json(200, { posts: [], message: "D1 not configured" });
    }
    if (!(await isSchemaApplied())) {
      return json(200, { posts: [], message: "Schema not applied yet" });
    }
    const limit = Math.min(
      200,
      Math.max(1, Number(url.searchParams.get("limit")) || 50),
    );
    try {
      const rows = await d1All(
        `SELECT * FROM tiktok_posts ORDER BY created_at DESC LIMIT ?`,
        [limit],
      );
      return json(200, { posts: rows?.results || [] });
    } catch (err) {
      return json(500, { error: err?.message || String(err) });
    }
  }

  if (action === "caption") {
    const productId = url.searchParams.get("productId");
    if (!productId) {
      return json(400, { error: "productId required" });
    }
    const product = await findProductById(productId);
    if (!product) {
      return json(404, { error: `Product not found: ${productId}` });
    }
    const caption = generateTikTokCaption(product);
    const imageUrl = resolveProductImageUrl(product, {
      origin: url.origin,
    });
    return json(200, {
      productId,
      caption,
      captionLength: caption.length,
      maxCaptionLength: MAX_CAPTION_LENGTH,
      imageUrl,
      imageReachable: Boolean(imageUrl && /^https:\/\//i.test(imageUrl)),
    });
  }

  if (action === "connect-url") {
    if (!isTikTokConfigured()) {
      return json(503, {
        error:
          "TikTok not configured. Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET first.",
      });
    }
    if (!env?.STOREFRONT_CONFIG) {
      return json(500, { error: "STOREFRONT_CONFIG KV binding missing" });
    }
    // Mint a random state, stash it in KV so the callback can verify.
    const stateBytes = new Uint8Array(24);
    globalThis.crypto.getRandomValues(stateBytes);
    const state = Array.from(stateBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const store = makeStore(env.STOREFRONT_CONFIG);
    await store.setJSON(TIKTOK_OAUTH_STATE_KEY, {
      state,
      issuedAt: Math.floor(Date.now() / 1000),
    });
    const authorizeUrl = buildAuthorizeUrl({ state, origin });
    if (!authorizeUrl) {
      return json(500, { error: "Failed to build authorize URL" });
    }
    return json(200, { authorizeUrl });
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
    const result = await applySchema();
    if (!result.ok) return json(500, { error: result.error });
    return json(200, { ok: true });
  }

  if (action === "disconnect") {
    await clearStoredAuth();
    return json(200, { ok: true });
  }

  if (action === "refresh-token") {
    if (!isTikTokConfigured()) {
      return json(503, { error: "TikTok not configured" });
    }
    const result = await refreshAccessToken();
    if (!result.ok) return json(400, { error: result.error });
    return json(200, {
      ok: true,
      expiresAt: result.auth.expires_at,
      refreshExpiresAt: result.auth.refresh_expires_at,
    });
  }

  if (action === "publish") {
    if (!isTikTokConfigured()) {
      return json(503, {
        error:
          "TikTok not configured. Set TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET + TIKTOK_REDIRECT_URI first.",
      });
    }
    if (!(await isSchemaApplied())) {
      return json(503, {
        error: "tiktok_posts table missing. POST ?action=apply-schema first.",
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }
    const productId = String(body?.productId || "").trim();
    if (!productId) return json(400, { error: "productId required" });
    const product = await findProductById(productId);
    if (!product) {
      return json(404, { error: `Product not found: ${productId}` });
    }
    const captionOverride =
      typeof body?.caption === "string" ? body.caption : null;
    const caption = (captionOverride ?? generateTikTokCaption(product)).slice(
      0,
      MAX_CAPTION_LENGTH,
    );
    const imageUrlOverride =
      typeof body?.imageUrl === "string" && /^https:\/\//i.test(body.imageUrl)
        ? body.imageUrl
        : null;
    const imageUrl =
      imageUrlOverride ||
      resolveProductImageUrl(product, { origin: url.origin });
    if (!imageUrl) {
      return json(400, {
        error:
          "Product has no public HTTPS image URL. Upload via the product editor first so the image lands on R2.",
      });
    }
    const postMode =
      body?.postMode === "DIRECT_POST" ? "DIRECT_POST" : "MEDIA_UPLOAD";
    const privacyLevel =
      typeof body?.privacyLevel === "string"
        ? body.privacyLevel
        : postMode === "DIRECT_POST"
          ? "PUBLIC_TO_EVERYONE"
          : "SELF_ONLY";

    // Pre-write an audit row so failed attempts are still recorded.
    const rowId = newId();
    const now = nowIso();
    try {
      await d1Run(
        `INSERT INTO tiktok_posts
          (id, product_id, caption, image_url, image_urls, post_mode, media_type, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'PHOTO', 'pending', ?, ?)`,
        [
          rowId,
          productId,
          caption,
          imageUrl,
          JSON.stringify([imageUrl]),
          postMode,
          now,
          now,
        ],
      );
    } catch (err) {
      return json(500, {
        error: `Failed to write audit row: ${err?.message || String(err)}`,
      });
    }

    const initResult = await initPhotoPost({
      imageUrls: [imageUrl],
      caption,
      postMode,
      privacyLevel,
    });
    if (!initResult.ok) {
      await d1Run(
        `UPDATE tiktok_posts
           SET status='failed', error_code=?, error_message=?, updated_at=?
         WHERE id=?`,
        [
          initResult.errorCode || null,
          initResult.error || "init failed",
          nowIso(),
          rowId,
        ],
      );
      return json(400, {
        error: initResult.error || "TikTok rejected the init request",
        errorCode: initResult.errorCode || null,
      });
    }
    const publishId = initResult.publishId;
    await d1Run(
      `UPDATE tiktok_posts
         SET publish_id=?, status='processing', updated_at=?
       WHERE id=?`,
      [publishId, nowIso(), rowId],
    );

    const pollResult = await pollPublishStatus(publishId, {
      timeoutMs: 60000,
    });
    if (!pollResult.ok) {
      await d1Run(
        `UPDATE tiktok_posts
           SET status='failed', error_code=?, error_message=?, updated_at=?
         WHERE id=?`,
        [
          pollResult.errorCode || pollResult.status || null,
          pollResult.error || "polling failed",
          nowIso(),
          rowId,
        ],
      );
      return json(400, {
        error: pollResult.error || "TikTok publishing failed",
        publishId,
        status: pollResult.status || null,
      });
    }
    const finishedAt = nowIso();
    await d1Run(
      `UPDATE tiktok_posts
         SET status='published', tiktok_post_id=?, share_url=?, posted_at=?, updated_at=?
       WHERE id=?`,
      [
        pollResult.postId || null,
        pollResult.shareUrl || null,
        finishedAt,
        finishedAt,
        rowId,
      ],
    );
    return json(200, {
      ok: true,
      id: rowId,
      publishId,
      postId: pollResult.postId || null,
      shareUrl: pollResult.shareUrl || null,
      status: pollResult.status,
    });
  }

  return json(400, { error: `Unknown action: ${action}` });
};
