-- 0002_wishlist.sql
-- Adds the queryable mirror for the WISHLISTS KV namespace.
--
-- The KV `WISHLISTS` namespace remains the source of truth for the customer-
-- facing wishlist list (single-key lookup `users/<userId>` per signed-in
-- visitor). D1 mirrors each row so the admin panel can answer aggregate
-- questions ("which paintings are most-wishlisted?") with normal SQL,
-- mirroring the products / orders pattern from `0001_initial.sql`.
--
-- Both reads and writes are null-safe: when the KV binding is missing every
-- /api/wishlist call returns 503 and the SPA keeps using localStorage; when
-- the D1 binding is missing every mirror is a no-op (see `_lib/d1.js`).

CREATE TABLE IF NOT EXISTS wishlist_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_title TEXT,
  product_image TEXT,
  product_price INTEGER,
  added_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_wishlist_items_user ON wishlist_items(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_product ON wishlist_items(product_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_added_at ON wishlist_items(added_at);
