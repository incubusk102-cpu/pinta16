// Sliding-window rate limiter with two backends:
//
//   - **Cache API** (per-edge-PoP) for high-frequency 60s buckets like
//     /api/check-payment, /api/orders, /api/chat, /api/newsletter etc. The
//     Cache API does *not* count against the Workers KV daily quotas, so
//     these high-traffic buckets no longer eat the free-tier 1k writes / day
//     budget.
//
//   - **KV** (global, eventually consistent) for low-frequency long-window
//     buckets like login, signup, password change, etc. These fire rarely
//     enough that the KV write cost is negligible, and they need windows
//     longer than the Cache API's 1-minute sweet spot (e.g. 15 min for
//     login, 1 hr for signup) to actually deter brute-force.
//
// Both backends are intentionally best-effort: if the cache or KV layer
// errors out, we fall *open* (allow the request) rather than block real
// users behind a flaky limiter. Live overrides from the Admin -> Security
// panel (SECURITY_CONFIG KV) keep working for both backends.

import { makeStore } from "./kv-store.js";
import { getCloudflareEnv } from "./context.js";
import { getClientIp } from "./request-info.js";
import { resolveRateLimit } from "./security-config.js";
import { logSecurityEvent } from "./security-events.js";
import { autobanIfNeeded } from "./handler-wrapper.js";

// Buckets routed through the per-edge-PoP Cache API. All have 60s windows,
// which fits cleanly under the cache `max-age` we set. Long-window buckets
// (admin-login, user-*, etc.) are intentionally NOT in this set so they
// keep using the global KV-backed sliding window. Adding a bucket here is
// a one-line change as long as its window is <= a few minutes.
const CACHE_BACKED_BUCKETS = new Set([
  "check-payment",
  "create-payment",
  "newsletter-subscribe",
  "orders-place",
  "submit-review",
  "chat-start",
  "chat-send",
]);

const getLimitStore = () => {
  const env = getCloudflareEnv();
  if (!env?.RATE_LIMITS) return null;
  return makeStore(env.RATE_LIMITS);
};

const safeBucketName = (bucket) =>
  String(bucket || "default")
    .replace(/[^a-z0-9_-]/gi, "")
    .slice(0, 40) || "default";

const safeKeyName = (key) =>
  String(key || "anon")
    .replace(/[^a-z0-9._:-]/gi, "")
    .slice(0, 80) || "anon";

const buildKvKey = (bucket, key) =>
  `${safeBucketName(bucket)}__${safeKeyName(key)}`;

const buildCacheKey = (bucket, key) =>
  // The host is intentionally a never-routable .local synthetic so the
  // edge cache treats this purely as an in-memory key/value store. The
  // path encodes the bucket + caller identity so each bucket has its
  // own independent counter.
  new Request(
    `https://canvhub-ratelimit.local/${encodeURIComponent(
      safeBucketName(bucket),
    )}/${encodeURIComponent(safeKeyName(key))}`,
    { method: "GET" },
  );

const allowResponse = (max) => ({
  allowed: true,
  retryAfter: 0,
  remaining: max ?? 0,
  count: 0,
});

const denyResponse = (windowMs, max, recent, now) => {
  const oldest = Math.min(...recent);
  const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
  return {
    allowed: false,
    retryAfter,
    remaining: 0,
    count: recent.length,
  };
};

// Cache-API backed sliding window. Per-edge-PoP, so an attacker can in
// theory hit your stated limit once per Cloudflare data center; for a
// PH-focused storefront whose traffic concentrates in 1-2 PoPs that's
// fine, and the trade-off is zero KV writes.
const consumeCacheRateLimit = async (event, { bucket, windowMs, max, key }) => {
  const cache = globalThis.caches?.default;
  if (!cache) return allowResponse(max);

  const cacheKey = buildCacheKey(bucket, key || getClientIp(event) || "anon");

  let timestamps = [];
  try {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const data = await cached.json();
      if (Array.isArray(data)) timestamps = data;
    }
  } catch {
    // Cache miss or parse error: treat as empty window.
  }

  const now = Date.now();
  const windowStart = now - windowMs;
  const recent = timestamps.filter(
    (ts) => typeof ts === "number" && ts > windowStart,
  );

  if (recent.length >= max) {
    return denyResponse(windowMs, max, recent, now);
  }

  recent.push(now);
  const ttlSec = Math.max(1, Math.ceil(windowMs / 1000));
  try {
    await cache.put(
      cacheKey,
      new Response(JSON.stringify(recent), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${ttlSec}`,
        },
      }),
    );
  } catch {
    // Best-effort: failure to persist still allows this request through;
    // the next call will re-read whatever the cache currently has.
  }

  return {
    allowed: true,
    retryAfter: 0,
    remaining: max - recent.length,
    count: recent.length,
  };
};

// KV-backed sliding window. Global (across PoPs) but eventually consistent
// and costs ~1 KV read + 1 KV write per call. Reserved for low-frequency
// long-window buckets where global accuracy matters more than cost.
const consumeKvRateLimit = async (event, { bucket, windowMs, max, key }) => {
  const limitKey = buildKvKey(bucket, key || getClientIp(event) || "anon");
  const store = getLimitStore();
  if (!store) return allowResponse(max);
  const now = Date.now();
  const windowStart = now - windowMs;

  for (let attempt = 0; attempt < 3; attempt++) {
    let result;
    try {
      result = await store.getWithMetadata(limitKey, { type: "json" });
    } catch {
      return allowResponse(max);
    }
    const previous = result && Array.isArray(result.data) ? result.data : [];
    const recent = previous.filter((ts) => ts > windowStart);
    if (recent.length >= max) {
      return denyResponse(windowMs, max, recent, now);
    }
    recent.push(now);
    try {
      const wrote = await store.setJSON(limitKey, recent, {
        onlyIfMatch: result?.etag,
      });
      if (wrote && wrote.modified === false) continue;
      return {
        allowed: true,
        retryAfter: 0,
        remaining: max - recent.length,
        count: recent.length,
      };
    } catch {
      return allowResponse(max);
    }
  }
  return allowResponse(max);
};

// Strip any `:userId` suffix on per-user buckets so the dispatch table
// stays compact. e.g. `user-change-password:abc123` resolves to the
// `user-change-password` family.
const baseBucket = (bucket) =>
  String(bucket || "")
    .split(":")[0]
    .trim();

export const consumeRateLimit = async (
  event,
  { bucket, windowMs, max, key },
) => {
  if (!bucket) return allowResponse(max);

  // Live overrides from the Admin -> Security panel are honored for both
  // backends; this is the single source of truth for window + max.
  const resolved = await resolveRateLimit(bucket, { windowMs, max });
  windowMs = resolved.windowMs;
  max = resolved.max;
  if (!windowMs || !max) return allowResponse(max);

  const result = CACHE_BACKED_BUCKETS.has(baseBucket(bucket))
    ? await consumeCacheRateLimit(event, { bucket, windowMs, max, key })
    : await consumeKvRateLimit(event, { bucket, windowMs, max, key });

  if (!result.allowed) {
    // Always attribute to the client IP. `key` may be a user id for
    // per-user buckets (e.g. `user-change-password:<userId>`), and
    // tagging that as "ip" would mislead the dashboard and feed a
    // non-IP value to autobanIfNeeded.
    const ip = getClientIp(event) || "";
    void logSecurityEvent({
      type: "rate-limit",
      ip,
      path: "",
      detail: `Rate limited: ${bucket} (${result.count}/${max})`,
      userAgent: "",
    });
    void autobanIfNeeded(ip);
  }

  return result;
};

export const rateLimitResponse = (retryAfter) => ({
  statusCode: 429,
  headers: {
    "Content-Type": "application/json",
    "Retry-After": String(Math.max(1, Math.ceil(retryAfter))),
    "X-Content-Type-Options": "nosniff",
  },
  body: JSON.stringify({
    error: `Too many requests. Try again in ${Math.ceil(retryAfter)}s.`,
  }),
});
