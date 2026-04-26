// Sliding-window rate limiter backed by Netlify Blobs. Best-effort: the limiter
// is per-function-instance plus a shared blob, so we use a CAS read/write loop
// to keep concurrent invocations honest. Failures (e.g. blob unavailable) fall
// open — we never hard-fail a legitimate user because the limiter blob is down.

import { connectLambda, getStore } from "@netlify/blobs";
import { getClientIp } from "./request-info.js";

const STORE_NAME = "rate-limits";

const getLimitStore = (event) => {
  connectLambda(event);
  return getStore(STORE_NAME);
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

// Records a hit and returns { allowed, retryAfter, remaining, count }.
// `bucket` is the action name (e.g. "admin-login"), `windowMs` and `max` shape
// the policy. `key` defaults to the client IP.
export const consumeRateLimit = async (
  event,
  { bucket, windowMs, max, key },
) => {
  if (!bucket || !windowMs || !max) {
    return { allowed: true, retryAfter: 0, remaining: max ?? 0, count: 0 };
  }
  const limitKey = buildKey(bucket, key || getClientIp(event) || "anon");
  let store;
  try {
    store = getLimitStore(event);
  } catch {
    return { allowed: true, retryAfter: 0, remaining: max, count: 0 };
  }
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
      if (wrote && wrote.modified === false) continue; // raced; retry
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
  // Three CAS retries failed — fall open rather than block legit traffic.
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
