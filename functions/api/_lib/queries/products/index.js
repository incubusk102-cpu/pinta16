// Products mirror queries.
//
// KV (`PRODUCTS` namespace) is the source of truth for the public product
// catalogue (served from the global edge cache via single-key lookups).
// This module mirrors each product into a D1 row so order_items can JOIN
// against category / price / stock in admin analytics.
//
// Null-safe: when `env.DB` is unbound this is a silent no-op and the KV
// write keeps owning the customer-visible catalogue.

import { getD1 } from "../core.js";

// Mirror a product (from KV shape) into D1. Idempotent.
export async function mirrorProductToD1(product, isDefault = false) {
  const db = getD1();
  if (!db) return null;

  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT OR REPLACE INTO products
       (id, title, category, price, sale_price, is_default, is_sold, stock_count, low_stock_threshold, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      product.id,
      product.title || product.name || "",
      product.category || null,
      Math.round(Number(product.price) || 0),
      product.salePrice ? Math.round(Number(product.salePrice)) : null,
      isDefault ? 1 : 0,
      product.availability === "sold" || product.sold ? 1 : 0,
      Math.max(0, Math.floor(Number(product.stockCount) || 1)),
      Math.max(0, Math.floor(Number(product.lowStockThreshold) || 1)),
      product.createdAt || now,
      now,
    )
    .run();
}
