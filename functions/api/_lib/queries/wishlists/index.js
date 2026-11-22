// Wishlist queries.
//
// KV (`WISHLISTS` namespace, keyed `users/<userId>`) remains the source of
// truth for the customer-facing wishlist. This module mirrors the per-user
// row set into D1 so the admin can ask aggregate questions
// ("which paintings are most-wishlisted?") with a normal `GROUP BY`.
//
// Idempotent + null-safe: when `env.DB` is unbound this is a silent no-op
// and the KV write still owns the customer-visible state.

import { getD1 } from "../core.js";

// Replace every wishlist row for a single user with the supplied list. KV
// remains the source of truth; D1 is a queryable mirror so the admin panel
// can answer "which paintings are most-wishlisted?" with a normal GROUP BY.
//
// Idempotent and null-safe: when env.DB is unbound this is a no-op and the
// caller's KV write still succeeds.
export async function syncWishlistToD1(userId, items) {
  const db = getD1();
  if (!db) return null;
  if (!userId || typeof userId !== "string") return null;
  const safeItems = Array.isArray(items) ? items : [];

  const now = new Date().toISOString();
  const stmts = [
    db.prepare(`DELETE FROM wishlist_items WHERE user_id = ?`).bind(userId),
  ];

  for (const item of safeItems) {
    if (!item || typeof item.id !== "string" || !item.id) continue;
    const addedAt =
      typeof item.addedAt === "string" && item.addedAt ? item.addedAt : now;
    stmts.push(
      db
        .prepare(
          `INSERT INTO wishlist_items
           (id, user_id, product_id, product_title, product_image, product_price, added_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          `${userId}:${item.id}`,
          userId,
          item.id,
          typeof item.title === "string" ? item.title : null,
          typeof item.image === "string" ? item.image : null,
          item.price != null && Number.isFinite(Number(item.price))
            ? Math.round(Number(item.price))
            : null,
          addedAt,
          now,
        ),
    );
  }

  try {
    await db.batch(stmts);
    return { mirrored: true, count: safeItems.length };
  } catch (err) {
    return { mirrored: false, reason: String(err?.message || err) };
  }
}
