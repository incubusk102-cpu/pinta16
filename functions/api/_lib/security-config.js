// Live-tunable security knobs backed by the SECURITY_CONFIG KV namespace.
//
// Single key "config" → JSON object of the shape returned by `defaults()`:
//
//   {
//     rateLimits: { [bucket]: { windowMs, max } },
//     turnstileMode: "off" | "soft" | "hard",
//     maxBodyBytes: number,        // 1 MB .. 10 MB
//     ipBlockList: string[],
//     updatedAt: string
//   }
//
// All values are *overlaid* on top of the hardcoded defaults below — anything
// the admin hasn't explicitly tuned still uses the value shipped in code, so
// merging this PR with no SECURITY_CONFIG binding (and no saved overrides)
// behaves identically to before.
//
// A short module-scoped cache keeps the steady-state path one map lookup
// instead of one KV read per request. The TTL is intentionally tight so live
// edits from the admin panel show up within ~30s without forcing a redeploy
// or manual cache bust.

import { makeStore } from "./kv-store.js";
import { getCloudflareEnv } from "./context.js";

const KEY = "config";
const CACHE_TTL_MS = 30_000;

// Floor + ceiling for the body-size knob. The hard ceiling is also the
// absolute upper bound enforced in `lambda-event.js`, so a misconfigured
// override can't blow through it.
export const BODY_BYTES_MIN = 1 * 1024 * 1024;
export const BODY_BYTES_MAX = 10 * 1024 * 1024;
export const DEFAULT_BODY_BYTES = 5 * 1024 * 1024;

export const TURNSTILE_MODES = ["off", "soft", "hard"];
export const DEFAULT_TURNSTILE_MODE = "hard";

// Mirrors the hardcoded windows + maxes at each call site as of #206. The
// Admin → Security panel reads these to seed inputs and label "default" rows
// so an admin can see what the limit *would* be before they start tuning.
// New buckets just need an entry here to become tunable.
export const DEFAULT_RATE_LIMITS = {
  "admin-login": { windowMs: 15 * 60_000, max: 8 },
  "newsletter-subscribe": { windowMs: 60_000, max: 5 },
  "create-payment": { windowMs: 60_000, max: 6 },
  "check-payment": { windowMs: 60_000, max: 30 },
  "orders-place": { windowMs: 60_000, max: 10 },
  "submit-review": { windowMs: 60_000, max: 5 },
  "user-signup": { windowMs: 60 * 60_000, max: 10 },
  "user-login": { windowMs: 15 * 60_000, max: 10 },
  "user-google-login": { windowMs: 15 * 60_000, max: 20 },
  "user-change-password": { windowMs: 15 * 60_000, max: 8 },
  "user-disconnect-google": { windowMs: 60 * 60_000, max: 5 },
  "chat-start": { windowMs: 60_000, max: 5 },
  "chat-send": { windowMs: 60_000, max: 20 },
  "visitors-heartbeat": { windowMs: 60_000, max: 12 },
};

// Buckets like `user-change-password:<userId>` are namespaced per-user at the
// call site — strip the `:<id>` suffix when resolving overrides so the
// admin only has to tune the family once.
const baseBucket = (bucket) =>
  String(bucket || "")
    .split(":")[0]
    .trim();

export const defaults = () => ({
  rateLimits: { ...DEFAULT_RATE_LIMITS },
  turnstileMode: DEFAULT_TURNSTILE_MODE,
  maxBodyBytes: DEFAULT_BODY_BYTES,
  ipBlockList: [],
  updatedAt: null,
});

const getStore = () => {
  const env = getCloudflareEnv();
  if (!env?.SECURITY_CONFIG) return null;
  return makeStore(env.SECURITY_CONFIG);
};

const clampInt = (n, min, max, fallback) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.round(v)));
};

const sanitizeRateLimits = (input) => {
  const out = {};
  if (!input || typeof input !== "object") return out;
  for (const [rawBucket, value] of Object.entries(input)) {
    const bucket = String(rawBucket || "")
      .replace(/[^a-z0-9_:-]/gi, "")
      .slice(0, 60);
    if (!bucket) continue;
    if (!value || typeof value !== "object") continue;
    // 1s..1h window, 1..10000 requests. Keeps a fat-fingered `0` from
    // accidentally locking everyone out.
    const windowMs = clampInt(value.windowMs, 1_000, 60 * 60_000, null);
    const max = clampInt(value.max, 1, 10_000, null);
    if (windowMs == null || max == null) continue;
    out[bucket] = { windowMs, max };
  }
  return out;
};

const sanitizeIpList = (input) => {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of input) {
    const ip = String(raw || "")
      .trim()
      .slice(0, 64);
    // Permissive shape check — accept v4 and v6 without trying to be a full
    // parser. Anything that isn't a hex/digit/dot/colon group is dropped.
    if (!ip || !/^[0-9a-f.:]+$/i.test(ip)) continue;
    if (seen.has(ip)) continue;
    seen.add(ip);
    out.push(ip);
    if (out.length >= 500) break;
  }
  return out;
};

export const sanitizeConfig = (input) => {
  const base = defaults();
  const cfg = input && typeof input === "object" ? input : {};
  const turnstileMode = TURNSTILE_MODES.includes(cfg.turnstileMode)
    ? cfg.turnstileMode
    : base.turnstileMode;
  const maxBodyBytes = clampInt(
    cfg.maxBodyBytes,
    BODY_BYTES_MIN,
    BODY_BYTES_MAX,
    base.maxBodyBytes,
  );
  return {
    rateLimits: { ...base.rateLimits, ...sanitizeRateLimits(cfg.rateLimits) },
    turnstileMode,
    maxBodyBytes,
    ipBlockList: sanitizeIpList(cfg.ipBlockList),
    updatedAt:
      typeof cfg.updatedAt === "string" ? cfg.updatedAt.slice(0, 40) : null,
  };
};

let cached = null;
let cachedAt = 0;

export const invalidateSecurityConfigCache = () => {
  cached = null;
  cachedAt = 0;
};

export const getSecurityConfig = async () => {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) return cached;
  const store = getStore();
  if (!store) {
    cached = defaults();
    cachedAt = now;
    return cached;
  }
  let raw = null;
  try {
    raw = await store.get(KEY, { type: "json" });
  } catch {
    raw = null;
  }
  cached = sanitizeConfig(raw || {});
  cachedAt = now;
  return cached;
};

export const writeSecurityConfig = async (patch) => {
  const store = getStore();
  if (!store) {
    throw new Error("SECURITY_CONFIG binding is not configured");
  }
  const current = await getSecurityConfig();
  const merged = sanitizeConfig({
    ...current,
    ...(patch || {}),
    rateLimits: {
      ...current.rateLimits,
      ...((patch && patch.rateLimits) || {}),
    },
    updatedAt: new Date().toISOString(),
  });
  await store.setJSON(KEY, merged);
  cached = merged;
  cachedAt = Date.now();
  return merged;
};

// Resolve the rate limit for a given bucket. The call site supplies its
// hardcoded defaults; the override (if any) wins. Per-user buckets like
// `user-change-password:<id>` resolve against the family root.
export const resolveRateLimit = async (bucket, fallback) => {
  const cfg = await getSecurityConfig();
  const base = baseBucket(bucket);
  const override = cfg.rateLimits[base] || cfg.rateLimits[bucket];
  if (
    override &&
    Number.isFinite(override.windowMs) &&
    Number.isFinite(override.max)
  ) {
    return { windowMs: override.windowMs, max: override.max };
  }
  return {
    windowMs: Number(fallback?.windowMs) || 60_000,
    max: Number(fallback?.max) || 10,
  };
};

export const getTurnstileMode = async () => {
  const cfg = await getSecurityConfig();
  return cfg.turnstileMode;
};

export const getMaxBodyBytes = async () => {
  const cfg = await getSecurityConfig();
  return cfg.maxBodyBytes;
};

export const isIpBlocked = async (ip) => {
  if (!ip) return false;
  const cfg = await getSecurityConfig();
  if (!cfg.ipBlockList.length) return false;
  const needle = String(ip).trim().toLowerCase();
  return cfg.ipBlockList.some((entry) => entry.toLowerCase() === needle);
};

// Wipe every key in the RATE_LIMITS namespace so a rate-limited admin (or
// rate-limited everyone, after a misconfiguration) can immediately recover.
// Best-effort: KV `list` is paged and KV `delete` is per-key, so on a busy
// site this drains in batches. Returns the number of keys actually deleted.
export const resetRateLimitCounters = async () => {
  const env = getCloudflareEnv();
  const ns = env?.RATE_LIMITS;
  if (!ns) return { deleted: 0, skipped: true };
  let deleted = 0;
  let cursor;
  for (let page = 0; page < 50; page++) {
    let result;
    try {
      result = await ns.list({ cursor, limit: 1000 });
    } catch {
      break;
    }
    const keys = Array.isArray(result?.keys) ? result.keys : [];
    if (keys.length === 0) break;
    await Promise.all(
      keys.map(async (k) => {
        try {
          await ns.delete(k.name);
          deleted += 1;
        } catch {
          // KV delete is idempotent; swallow individual failures so one
          // bad key doesn't abort the wipe.
        }
      }),
    );
    if (result?.list_complete || !result?.cursor) break;
    cursor = result.cursor;
  }
  return { deleted, skipped: false };
};
