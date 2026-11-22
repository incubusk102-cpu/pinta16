-- 0001_initial.sql
-- Cloudflare D1 (SQLite) schema for the canvhub hybrid KV+SQL architecture.
-- KV remains the source of truth for public reads; D1 enables joins, aggregations,
-- and reports that flat key-value lookups cannot provide.

-- Customers: one row per unique email across orders + registrations.
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  phone TEXT,
  city TEXT,
  region TEXT,
  vip_tier TEXT,
  notes TEXT,
  first_order_at TEXT,
  last_order_at TEXT,
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_last_order_at ON customers(last_order_at);
CREATE INDEX IF NOT EXISTS idx_customers_total_spent ON customers(total_spent);

-- Orders: mirrors the ORDERS KV list with relational columns for queries.
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id),
  customer_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  payment_intent_id TEXT,
  voucher_code TEXT,
  subtotal INTEGER NOT NULL DEFAULT 0,
  shipping_fee INTEGER NOT NULL DEFAULT 0,
  discount INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'PHP',
  city TEXT,
  region TEXT,
  province TEXT,
  courier TEXT,
  created_at TEXT NOT NULL,
  shipped_at TEXT,
  delivered_at TEXT,
  cancelled_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

-- Order line items: one row per item per order.
CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT,
  product_title TEXT NOT NULL,
  unit_price INTEGER NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  subtotal INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

-- Products mirror: keeps title/price/category in D1 for JOIN with order_items.
-- KV (PRODUCTS namespace) remains the source of truth for public product pages.
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT,
  price INTEGER NOT NULL DEFAULT 0,
  sale_price INTEGER,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_sold INTEGER NOT NULL DEFAULT 0,
  stock_count INTEGER NOT NULL DEFAULT 1,
  low_stock_threshold INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
