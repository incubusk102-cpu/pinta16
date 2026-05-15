// d1-schema.js
//
// Inline copy of the D1 schema, exposed so the admin panel can bootstrap the
// database from the running app (POST /api/admin/d1?action=apply-schema)
// without requiring the operator to install the wrangler CLI.
//
// SOURCE OF TRUTH: `migrations/0001_initial.sql`. If you change one, change
// the other — this file deliberately duplicates the SQL so the runtime
// bootstrap path doesn't depend on bundling unrelated files into the Pages
// Functions output.
//
// All statements are IF NOT EXISTS, so applying twice is a no-op.

export const D1_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS customers (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email)`,
  `CREATE INDEX IF NOT EXISTS idx_customers_last_order_at ON customers(last_order_at)`,
  `CREATE INDEX IF NOT EXISTS idx_customers_total_spent ON customers(total_spent)`,

  `CREATE TABLE IF NOT EXISTS orders (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(customer_email)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)`,

  `CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id TEXT,
    product_title TEXT NOT NULL,
    unit_price INTEGER NOT NULL DEFAULT 0,
    quantity INTEGER NOT NULL DEFAULT 1,
    subtotal INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id)`,

  `CREATE TABLE IF NOT EXISTS products (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)`,

  `CREATE TABLE IF NOT EXISTS wishlist_items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_title TEXT,
    product_image TEXT,
    product_price INTEGER,
    added_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (user_id, product_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_wishlist_items_user ON wishlist_items(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_wishlist_items_product ON wishlist_items(product_id)`,
  `CREATE INDEX IF NOT EXISTS idx_wishlist_items_added_at ON wishlist_items(added_at)`,

  `CREATE TABLE IF NOT EXISTS coupon_redemptions (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    order_id TEXT NOT NULL,
    customer_id TEXT,
    customer_email TEXT NOT NULL,
    discount_cents INTEGER NOT NULL DEFAULT 0,
    subtotal_cents INTEGER NOT NULL DEFAULT 0,
    total_cents INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'PHP',
    redeemed_at TEXT NOT NULL,
    UNIQUE (order_id, code)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_code ON coupon_redemptions(code)`,
  `CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_email ON coupon_redemptions(customer_email)`,
  `CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_customer ON coupon_redemptions(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_redeemed_at ON coupon_redemptions(redeemed_at)`,
  `CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_email_code ON coupon_redemptions(customer_email, code)`,

  `CREATE TABLE IF NOT EXISTS return_requests (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    customer_id TEXT,
    customer_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'requested',
    reason TEXT NOT NULL,
    description TEXT,
    photo_urls_json TEXT,
    items_json TEXT,
    rma_number TEXT,
    denial_reason TEXT,
    refund_amount_cents INTEGER,
    requested_at TEXT NOT NULL,
    decided_at TEXT,
    received_at TEXT,
    completed_at TEXT,
    cancelled_at TEXT,
    updated_at TEXT NOT NULL,
    UNIQUE (order_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_return_requests_order ON return_requests(order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_return_requests_email ON return_requests(customer_email)`,
  `CREATE INDEX IF NOT EXISTS idx_return_requests_status ON return_requests(status)`,
  `CREATE INDEX IF NOT EXISTS idx_return_requests_requested_at ON return_requests(requested_at)`,
  `CREATE INDEX IF NOT EXISTS idx_return_requests_status_requested_at ON return_requests(status, requested_at)`,

  `CREATE TABLE IF NOT EXISTS search_events (
    id TEXT PRIMARY KEY,
    query TEXT NOT NULL,
    query_lc TEXT NOT NULL,
    results_count INTEGER NOT NULL DEFAULT 0,
    filter_category TEXT,
    filter_availability TEXT,
    filter_price TEXT,
    country TEXT,
    ts TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_search_events_ts ON search_events(ts)`,
  `CREATE INDEX IF NOT EXISTS idx_search_events_query_lc ON search_events(query_lc)`,
  `CREATE INDEX IF NOT EXISTS idx_search_events_results_count ON search_events(results_count)`,

  `CREATE TABLE IF NOT EXISTS page_events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    path TEXT NOT NULL,
    path_kind TEXT NOT NULL,
    referrer_host TEXT,
    country TEXT,
    device TEXT,
    ts TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_page_events_ts ON page_events(ts)`,
  `CREATE INDEX IF NOT EXISTS idx_page_events_path_kind ON page_events(path_kind)`,
  `CREATE INDEX IF NOT EXISTS idx_page_events_path ON page_events(path)`,
  `CREATE INDEX IF NOT EXISTS idx_page_events_session ON page_events(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_page_events_session_kind ON page_events(session_id, path_kind)`,

  `CREATE TABLE IF NOT EXISTS notification_log (
    id TEXT PRIMARY KEY,
    channel TEXT NOT NULL,
    kind TEXT NOT NULL,
    recipient TEXT,
    order_id TEXT,
    delivered INTEGER NOT NULL DEFAULT 0,
    skipped INTEGER NOT NULL DEFAULT 0,
    provider TEXT,
    reason TEXT,
    attempted INTEGER,
    successful INTEGER,
    ts TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_notification_log_ts ON notification_log(ts)`,
  `CREATE INDEX IF NOT EXISTS idx_notification_log_channel_kind ON notification_log(channel, kind)`,
  `CREATE INDEX IF NOT EXISTS idx_notification_log_kind ON notification_log(kind)`,
  `CREATE INDEX IF NOT EXISTS idx_notification_log_order ON notification_log(order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_notification_log_recipient ON notification_log(recipient)`,

  `CREATE TABLE IF NOT EXISTS stock_events (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    product_title TEXT,
    category TEXT,
    from_state TEXT,
    to_state TEXT NOT NULL,
    source TEXT NOT NULL,
    actor TEXT,
    ts TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_stock_events_ts ON stock_events(ts)`,
  `CREATE INDEX IF NOT EXISTS idx_stock_events_product ON stock_events(product_id)`,
  `CREATE INDEX IF NOT EXISTS idx_stock_events_to_state ON stock_events(to_state)`,
  `CREATE INDEX IF NOT EXISTS idx_stock_events_category ON stock_events(category)`,
  `CREATE INDEX IF NOT EXISTS idx_stock_events_source ON stock_events(source)`,

  `CREATE TABLE IF NOT EXISTS tiktok_posts (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    publish_id TEXT,
    tiktok_post_id TEXT,
    share_url TEXT,
    caption TEXT,
    image_url TEXT,
    image_urls TEXT,
    post_mode TEXT NOT NULL DEFAULT 'UPLOAD',
    media_type TEXT NOT NULL DEFAULT 'PHOTO',
    status TEXT NOT NULL DEFAULT 'pending',
    error_code TEXT,
    error_message TEXT,
    posted_by TEXT,
    posted_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tiktok_posts_product_id ON tiktok_posts(product_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tiktok_posts_status ON tiktok_posts(status)`,
  `CREATE INDEX IF NOT EXISTS idx_tiktok_posts_publish_id ON tiktok_posts(publish_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tiktok_posts_posted_at ON tiktok_posts(posted_at)`,
  `CREATE INDEX IF NOT EXISTS idx_tiktok_posts_created_at ON tiktok_posts(created_at)`,

  `CREATE TABLE IF NOT EXISTS hero_slide_events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    slide_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    country TEXT,
    device TEXT,
    ts TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_hero_slide_events_ts ON hero_slide_events(ts)`,
  `CREATE INDEX IF NOT EXISTS idx_hero_slide_events_slide ON hero_slide_events(slide_id)`,
  `CREATE INDEX IF NOT EXISTS idx_hero_slide_events_slide_type ON hero_slide_events(slide_id, event_type)`,
  `CREATE INDEX IF NOT EXISTS idx_hero_slide_events_session ON hero_slide_events(session_id)`,
];
