// /api/admin/tiktok — admin endpoint for TikTok auto-posting.
//
// GET  ?action=status                    → connection + token + creator info
//                                          (also reports `autoPostEnabled`)
// GET  ?action=posts&limit=50            → recent rows from `tiktok_posts`
// GET  ?action=caption&productId=...     → server-rendered caption + image URL
// GET  ?action=connect-url               → mints a state token + returns the
//                                          OAuth authorize URL to redirect to
// POST ?action=apply-schema              → bootstrap the `tiktok_posts` table
// POST ?action=publish                   → init + poll a publish job, write
//                                          the result row to D1
// POST ?action=refresh-status            → re-poll TikTok for a single row
//                                          (body: { id }) and update the D1
//                                          row in place. Use this on rows the
//                                          publish action left in `processing`
//                                          state because TikTok hadn't yet
//                                          delivered the inbox notification
//                                          within the fail-fast window.
// POST ?action=set-auto-post             → flip the auto-post-on-create flag
//                                          (body: { enabled: bool })
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
  getAutoPostEnabled,
  getTikTokAccountStatus,
  isTikTokConfigured,
  pollPublishStatus,
  publishProductPhoto,
  refreshAccessToken,
  resolveProductImageUrl,
  setAutoPostEnabled,
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
    const autoPostEnabled = await getAutoPostEnabled();
    return json(200, {
      ...status,
      d1Available: isD1Available(),
      schemaApplied,
      autoPostEnabled,
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
    const result = await publishProductPhoto({
      product,
      origin: url.origin,
      postMode:
        body?.postMode === "DIRECT_POST" ? "DIRECT_POST" : "MEDIA_UPLOAD",
      privacyLevel:
        typeof body?.privacyLevel === "string" ? body.privacyLevel : null,
      captionOverride: typeof body?.caption === "string" ? body.caption : null,
      imageUrlOverride:
        typeof body?.imageUrl === "string" && /^https:\/\//i.test(body.imageUrl)
          ? body.imageUrl
          : null,
      source: "manual",
    });
    if (!result.ok) {
      return json(400, {
        error: result.error || "TikTok publishing failed",
        errorCode: result.errorCode || null,
        publishId: result.publishId || null,
        status: result.status || null,
        id: result.id || null,
      });
    }
    return json(200, {
      ok: true,
      id: result.id,
      publishId: result.publishId,
      postId: result.postId || null,
      shareUrl: result.shareUrl || null,
      status: result.status,
    });
  }

  if (action === "refresh-status") {
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
    const rowId = String(body?.id || "").trim();
    if (!rowId) return json(400, { error: "id required" });
    const row = await d1First(
      `SELECT id, publish_id, status FROM tiktok_posts WHERE id=?`,
      [rowId],
    );
    if (!row) return json(404, { error: `Row not found: ${rowId}` });
    if (!row.publish_id) {
      return json(400, { error: "Row has no publish_id to poll" });
    }
    const result = await pollPublishStatus(row.publish_id, {
      timeoutMs: 8000,
      failFast: true,
    });
    const now = new Date().toISOString();
    if (!result.ok) {
      await d1Run(
        `UPDATE tiktok_posts
           SET status='failed', error_code=?, error_message=?, updated_at=?
         WHERE id=?`,
        [
          result.errorCode || result.status || null,
          result.error || "polling failed",
          now,
          rowId,
        ],
      );
      return json(200, {
        ok: false,
        id: rowId,
        status: result.status || "failed",
        error: result.error || "polling failed",
        failReason: result.failReason || null,
        uploadedBytes:
          typeof result.uploadedBytes === "number"
            ? result.uploadedBytes
            : null,
      });
    }
    if (result.pending) {
      await d1Run(
        `UPDATE tiktok_posts SET status='processing', updated_at=? WHERE id=?`,
        [now, rowId],
      );
      return json(200, {
        ok: true,
        id: rowId,
        status: result.status || "PROCESSING_UPLOAD",
        pending: true,
        uploadedBytes:
          typeof result.uploadedBytes === "number"
            ? result.uploadedBytes
            : null,
      });
    }
    await d1Run(
      `UPDATE tiktok_posts
         SET status='published', tiktok_post_id=?, share_url=?, posted_at=?, updated_at=?
       WHERE id=?`,
      [result.postId || null, result.shareUrl || null, now, now, rowId],
    );
    return json(200, {
      ok: true,
      id: rowId,
      status: result.status,
      postId: result.postId || null,
      shareUrl: result.shareUrl || null,
    });
  }

  if (action === "set-auto-post") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }
    const enabled = Boolean(body?.enabled);
    try {
      await setAutoPostEnabled(enabled);
      return json(200, { ok: true, enabled });
    } catch (err) {
      return json(500, { error: err?.message || String(err) });
    }
  }

  return json(400, { error: `Unknown action: ${action}` });
};
