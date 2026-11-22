// /api/wishlist — server-side wishlist sync for signed-in customers.
//
// Routes:
//   GET  /api/wishlist         List the signed-in user's wishlist.
//   PUT  /api/wishlist         Replace the user's wishlist.
//                              Body: { items: WishlistItem[] }
//   POST /api/wishlist         Add a single item.
//                              Body: { item: WishlistItem }
//   DELETE /api/wishlist?id=…  Remove a single product from the wishlist.
//
// All four require a valid storefront-user session (cookie or
// Authorization: Bearer header — the same dual-source model used by
// /api/users and /api/orders). Unauthenticated callers get a 401.
//
// Storage:
//   - KV `WISHLISTS` namespace, keyed by `user/<userId>`. Source of truth.
//   - D1 `wishlist_items` table, mirrored fire-and-forget after every
//     mutation so the admin panel can answer aggregate queries
//     ("most-wishlisted") with normal SQL.
//
// Null-safe: when the WISHLISTS binding is missing every endpoint returns
// 503 and the SPA falls back to localStorage exactly as before.

import { wrapHandler } from "./_lib/handler-wrapper.js";
import { makeStore } from "./_lib/kv-store.js";
import { getCloudflareEnv } from "./_lib/context.js";
import { withSecurityHeaders } from "./_lib/security-headers.js";
import { logError } from "./_lib/redact.js";
import { consumeRateLimit, rateLimitResponse } from "./_lib/rate-limit.js";
import { getCurrentUserFromSession } from "./_lib/user-auth.js";
import { syncWishlistToD1 } from "./_lib/d1.js";

const STORE_BINDING = "WISHLISTS";

// Hard-stop on absurd payloads. The localStorage shape is small (one row
// per painting), so 500 entries is well clear of any real customer's list.
const MAX_ITEMS = 500;
const MAX_TITLE_LEN = 300;
const MAX_IMAGE_LEN = 2000;

const json = (statusCode, body) => ({
  statusCode,
  headers: withSecurityHeaders(),
  body: JSON.stringify(body),
});

const parseBody = (body) => {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
};

const userKey = (userId) => `user/${userId}`;

const getWishlistsStore = () => {
  const env = getCloudflareEnv();
  const binding = env?.[STORE_BINDING];
  if (!binding) return null;
  return makeStore(binding);
};

const sanitizeItem = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) return null;
  const addedAt =
    typeof raw.addedAt === "string" && raw.addedAt
      ? raw.addedAt
      : new Date().toISOString();
  const out = {
    id,
    addedAt,
  };
  if (typeof raw.title === "string") {
    out.title = raw.title.slice(0, MAX_TITLE_LEN);
  }
  if (typeof raw.image === "string") {
    out.image = raw.image.slice(0, MAX_IMAGE_LEN);
  }
  if (raw.price != null && Number.isFinite(Number(raw.price))) {
    out.price = Math.round(Number(raw.price));
  }
  return out;
};

// Drop duplicates by id, keep the most-recent addedAt, sort newest first.
const normalizeItems = (raw) => {
  if (!Array.isArray(raw)) return [];
  const byId = new Map();
  for (const entry of raw) {
    const item = sanitizeItem(entry);
    if (!item) continue;
    const existing = byId.get(item.id);
    if (!existing || existing.addedAt < item.addedAt) {
      byId.set(item.id, item);
    }
  }
  const list = Array.from(byId.values()).sort((a, b) =>
    a.addedAt < b.addedAt ? 1 : -1,
  );
  return list.slice(0, MAX_ITEMS);
};

const readUserWishlist = async (store, userId) => {
  const data = await store.get(userKey(userId), { type: "json" });
  if (!data || typeof data !== "object") return [];
  return Array.isArray(data.items) ? data.items : [];
};

const writeUserWishlist = async (store, userId, items) => {
  const normalized = normalizeItems(items);
  await store.setJSON(userKey(userId), {
    items: normalized,
    updatedAt: new Date().toISOString(),
  });
  // Best-effort D1 mirror; never blocks the client response.
  void syncWishlistToD1(userId, normalized).catch((err) =>
    logError("syncWishlistToD1 failed:", err),
  );
  return normalized;
};

export const handler = async (event) => {
  const method = event.httpMethod;
  const params = event.queryStringParameters || {};

  if (!["GET", "PUT", "POST", "DELETE"].includes(method)) {
    return json(405, { error: "Method not allowed" });
  }

  const store = getWishlistsStore();
  if (!store) {
    // Binding not configured. Match the rest of the codebase's null-safe
    // pattern (e.g. abandoned-cart sync) so the SPA can fall back to
    // localStorage without flagging an outage.
    return json(503, {
      error: "Wishlist sync is not configured",
      reason: "no-binding",
    });
  }

  const user = await getCurrentUserFromSession(event).catch(() => null);
  if (!user) {
    return json(401, { error: "Not authenticated" });
  }

  // Sliding-window rate limit: writes are far more sensitive than reads
  // because they round-trip through KV + D1, so cap them tighter.
  if (method !== "GET") {
    const rl = await consumeRateLimit({
      event,
      action: "wishlist:write",
      identifier: user.id,
      limit: 60,
      windowMs: 60_000,
    });
    if (!rl.allowed) return rateLimitResponse(rl);
  }

  try {
    if (method === "GET") {
      const items = normalizeItems(await readUserWishlist(store, user.id));
      return json(200, { items });
    }

    if (method === "PUT") {
      const body = parseBody(event.body);
      const next = normalizeItems(body.items);
      const items = await writeUserWishlist(store, user.id, next);
      return json(200, { items });
    }

    if (method === "POST") {
      const body = parseBody(event.body);
      const incoming = sanitizeItem(body.item);
      if (!incoming) {
        return json(400, { error: "Invalid item" });
      }
      const existing = await readUserWishlist(store, user.id);
      const next = normalizeItems([incoming, ...existing]);
      const items = await writeUserWishlist(store, user.id, next);
      return json(200, { items });
    }

    if (method === "DELETE") {
      const target = String(params.id || "").trim();
      if (!target) {
        return json(400, { error: "Missing id" });
      }
      const existing = await readUserWishlist(store, user.id);
      const next = normalizeItems(existing).filter(
        (item) => item.id !== target,
      );
      const items = await writeUserWishlist(store, user.id, next);
      return json(200, { items });
    }
  } catch (err) {
    logError("wishlist handler failed:", err);
    return json(500, { error: "Internal error" });
  }

  return json(405, { error: "Method not allowed" });
};

export const onRequest = wrapHandler(handler);
