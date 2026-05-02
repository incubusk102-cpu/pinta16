// Map the Netlify Blobs store names used throughout the original codebase to
// the Cloudflare KV namespace bindings declared in `wrangler.toml`. Lets us
// keep the original `getStore("orders")` shape without rewriting hundreds of
// call sites.

import { makeStore } from "./kv-store.js";
import { requireKvBinding } from "./context.js";

const STORE_TO_BINDING = {
  products: "PRODUCTS",
  orders: "ORDERS",
  users: "USERS",
  "hero-slides": "HERO_SLIDES",
  "storefront-config": "STOREFRONT_CONFIG",
  policies: "POLICIES",
  "chat-threads": "CHAT_THREADS",
  newsletter: "NEWSLETTER",
  visitors: "VISITORS",
  "rate-limits": "RATE_LIMITS",
  "audit-log": "AUDIT_LOG",
  "admin-auth": "ADMIN_AUTH",
  "customer-meta": "CUSTOMER_META",
  "security-config": "SECURITY_CONFIG",
};

export const getStore = (name) => {
  const binding = STORE_TO_BINDING[name];
  if (!binding) throw new Error(`Unknown KV store: ${name}`);
  return makeStore(requireKvBinding(binding));
};

// No-op kept for source compatibility with the Netlify Lambda adapter. On
// Cloudflare we get env via the per-request context, not from the event.
export const connectLambda = () => {};
