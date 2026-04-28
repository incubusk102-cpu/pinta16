// Sliding-window rate limiter backed by the RATE_LIMITS KV namespace.
// Best-effort: KV is eventually consistent and lacks real CAS, so we use a
// read-then-write loop and fall open on any failure rather than block real
// users behind a flaky limiter.

import { makeStore } from "./kv-store.js";
import { getCloudflareEnv } from "./context.js";
import { getClientIp } from "./request-info.js";

const getLimitStore = () => {
  const env = getCloudflareEnv();
  if (!env?.RATE_LIMITS) return null;
  return makeStore(env.RATE_LIMITS);
};

const buildKey = (bucket, key) => {
  const safeBucket =
    String(bucket || "default")
      .replace(/[^a-z0-9_-]/gi, "")
      .slice(0, 40) || "default";
  const safeKey =
    String(key || "anon")
      .replace(/[^a-z0-9._:-]/gi, "")
      .slice(0, 80) || "anon";
  return `${safeBucket}__${safeKey}`;
};

export const consumeRateLimit = async (
  event,
  { bucket, windowMs, max, key },
) => {
  if (!bucket || !windowMs || !max) {
    return { allowed: true, retryAfter: 0, remaining: max ?? 0, count: 0 };
  }
  const limitKey = buildKey(bucket, key || getClientIp(event) || "anon");
  const store = getLimitStore();
  if (!store) return { allowed: true, retryAfter: 0, remaining: max, count: 0 };
  const now = Date.now();
  const windowStart = now - windowMs;

  for (let attempt = 0; attempt < 3; attempt++) {
    let result;
    try {
      result = await store.getWithMetadata(limitKey, { type: "json" });
    } catch {
      return { allowed: true, retryAfter: 0, remaining: max, count: 0 };
    }
    const previous = result && Array.isArray(result.data) ? result.data : [];
    const recent = previous.filter((ts) => ts > windowStart);
    if (recent.length >= max) {
      const oldest = Math.min(...recent);
      const retryAfter = Math.max(
        1,
        Math.ceil((oldest + windowMs - now) / 1000),
      );
      return {
        allowed: false,
        retryAfter,
        remaining: 0,
        count: recent.length,
      };
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
      return { allowed: true, retryAfter: 0, remaining: max, count: 0 };
    }
  }
  return { allowed: true, retryAfter: 0, remaining: max, count: 0 };
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
