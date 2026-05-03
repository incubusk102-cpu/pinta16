// Append-only security event log backed by the SECURITY_EVENTS KV namespace.
//
// Events are stored in hourly buckets keyed as `events:<YYYY-MM-DDTHH>` so
// reads can efficiently query a time range without scanning the entire
// namespace. Each bucket is a JSON array capped at MAX_PER_BUCKET entries.
//
// A separate `stats` key holds rolling 24h aggregate counters that the
// dashboard reads in a single GET.
//
// All writes are fire-and-forget — a logging failure must never block or
// error the original request. The caller awaits `logSecurityEvent()` only
// so the KV write can start before the isolate shuts down; callers in hot
// paths can `void logSecurityEvent(...)` instead.
//
// Concurrent writers to the same hourly bucket or to the `stats` key would
// otherwise overwrite each other (KV has no atomic mutate). Bucket / stats
// writes go through the makeStore() etag-CAS shim with a small retry loop
// so simultaneous events don't silently drop entries from the dashboard.

import { makeStore } from "./kv-store.js";
import { getCloudflareEnv } from "./context.js";

const MAX_PER_BUCKET = 500;
const BUCKET_TTL_SECONDS = 7 * 24 * 3600; // auto-expire after 7 days
const STATS_KEY = "stats";
const AUTOBAN_KEY = "autoban-config";
const LOCKOUT_KEY_PREFIX = "auth-fails:";
const MAX_LOCKOUT_TIMESTAMPS = 100;
const CAS_RETRIES = 3;

// Sentinel email used by the admin login flow. The admin password lives in
// AUTH_STORE keyed by `admin`, not by an email, so we use this constant as
// the lockout key for the admin account. Don't change it once data exists
// in KV — existing lockout records are keyed by this string.
export const ADMIN_LOCKOUT_SUBJECT = "__admin__";

const getStore = () => {
  const env = getCloudflareEnv();
  return env?.SECURITY_EVENTS ? makeStore(env.SECURITY_EVENTS) : null;
};

const getRawNamespace = () => {
  const env = getCloudflareEnv();
  return env?.SECURITY_EVENTS ?? null;
};

const bucketKey = (date) => {
  const iso = date.toISOString();
  return `events:${iso.slice(0, 13)}`;
};

const safeStr = (v, maxLen) =>
  String(v || "")
    .slice(0, maxLen)
    .replace(/[\x00-\x1f]/g, "");

// ── Logging ──────────────────────────────────────────────────────────

export const logSecurityEvent = async ({
  type,
  ip,
  path,
  detail,
  userAgent,
  country,
}) => {
  const kv = getStore();
  if (!kv) return;

  const now = new Date();
  const entry = {
    t: now.toISOString(),
    type: safeStr(type, 40),
    ip: safeStr(ip, 64),
    path: safeStr(path, 200),
    detail: safeStr(detail, 200),
    ua: safeStr(userAgent, 300),
  };
  // Cloudflare exposes the resolved country (or "XX" for unknown) on every
  // request via the `cf-ipcountry` header. Persisting it lets the dashboard
  // surface country flags without an extra geo-IP lookup at read time.
  const cc = safeStr(country, 4).toUpperCase();
  if (cc && cc !== "XX") entry.cc = cc;

  const key = bucketKey(now);

  for (let attempt = 0; attempt < CAS_RETRIES; attempt++) {
    try {
      const { data, etag } = await kv.getWithMetadata(key, { type: "json" });
      const list = Array.isArray(data) ? [...data] : [];
      list.push(entry);
      if (list.length > MAX_PER_BUCKET) {
        list.splice(0, list.length - MAX_PER_BUCKET);
      }
      const opts =
        etag != null
          ? { onlyIfMatch: etag, expirationTtl: BUCKET_TTL_SECONDS }
          : { onlyIfNew: true, expirationTtl: BUCKET_TTL_SECONDS };
      const result = await kv.setJSON(key, list, opts);
      if (result?.modified) break;
      // Lost the CAS race; retry against the fresh value.
    } catch {
      // Fire-and-forget: never block the request.
      break;
    }
  }

  try {
    await incrementStats(kv, entry.type, entry.ip);
  } catch {
    // Best effort.
  }
};

// ── Rolling stats ────────────────────────────────────────────────────

const incrementStats = async (kv, type, ip) => {
  for (let attempt = 0; attempt < CAS_RETRIES; attempt++) {
    const { data, etag } = await kv.getWithMetadata(STATS_KEY, {
      type: "json",
    });
    const stats =
      data && typeof data === "object"
        ? { ...freshStats(), ...data }
        : freshStats();
    if (!stats.byType || typeof stats.byType !== "object") stats.byType = {};
    if (!stats.byIp || typeof stats.byIp !== "object") stats.byIp = {};

    stats.total = (stats.total || 0) + 1;
    stats.byType[type] = (stats.byType[type] || 0) + 1;
    if (ip) stats.byIp[ip] = (stats.byIp[ip] || 0) + 1;

    // Trim byIp to top 200 entries to prevent unbounded growth.
    const ipEntries = Object.entries(stats.byIp);
    if (ipEntries.length > 200) {
      ipEntries.sort((a, b) => b[1] - a[1]);
      stats.byIp = Object.fromEntries(ipEntries.slice(0, 200));
    }

    stats.updatedAt = new Date().toISOString();

    const opts =
      etag != null
        ? { onlyIfMatch: etag, expirationTtl: BUCKET_TTL_SECONDS }
        : { onlyIfNew: true, expirationTtl: BUCKET_TTL_SECONDS };
    const result = await kv.setJSON(STATS_KEY, stats, opts);
    if (result?.modified) return;
    // Lost the CAS race; retry against the fresh value.
  }
};

const freshStats = () => ({
  total: 0,
  byType: {},
  byIp: {},
  updatedAt: null,
});

// ── Reading ──────────────────────────────────────────────────────────

export const getSecurityStats = async () => {
  const kv = getStore();
  if (!kv) return freshStats();
  try {
    const parsed = await kv.get(STATS_KEY, { type: "json" });
    if (!parsed || typeof parsed !== "object") return freshStats();
    return { ...freshStats(), ...parsed };
  } catch {
    return freshStats();
  }
};

export const getRecentEvents = async ({ hours = 24, limit = 300 } = {}) => {
  const kv = getStore();
  if (!kv) return [];

  const now = new Date();
  const results = [];

  for (let h = 0; h < Math.min(hours, 168); h++) {
    const d = new Date(now.getTime() - h * 3600_000);
    const key = bucketKey(d);
    try {
      const entries = await kv.get(key, { type: "json" });
      if (Array.isArray(entries)) results.push(...entries);
    } catch {
      // Skip corrupt buckets.
    }
    if (results.length >= limit) break;
  }

  results.sort((a, b) => (b.t || "").localeCompare(a.t || ""));
  return results.slice(0, limit);
};

// ── Auto-ban ─────────────────────────────────────────────────────────

export const getAutobanConfig = async () => {
  const kv = getStore();
  if (!kv) return defaultAutobanConfig();
  try {
    const parsed = await kv.get(AUTOBAN_KEY, { type: "json" });
    if (!parsed) return defaultAutobanConfig();
    return sanitizeAutobanConfig(parsed);
  } catch {
    return defaultAutobanConfig();
  }
};

export const writeAutobanConfig = async (patch) => {
  const kv = getStore();
  if (!kv) throw new Error("SECURITY_EVENTS binding is not configured");
  const current = await getAutobanConfig();
  const merged = sanitizeAutobanConfig({ ...current, ...patch });
  merged.updatedAt = new Date().toISOString();
  await kv.setJSON(AUTOBAN_KEY, merged);
  return merged;
};

const defaultAutobanConfig = () => ({
  enabled: false,
  threshold: 20,
  windowMinutes: 60,
  // Per-email brute-force lockout. Defaults to ON because the cost of a
  // false positive (a real customer waiting 15 minutes) is small compared
  // to the cost of a credential-stuffing attack succeeding. Disable with
  // care.
  lockoutEnabled: true,
  lockoutThreshold: 5,
  lockoutWindowMinutes: 15,
  updatedAt: null,
});

const sanitizeAutobanConfig = (input) => {
  const cfg = input && typeof input === "object" ? input : {};
  return {
    enabled: Boolean(cfg.enabled),
    threshold: clampInt(cfg.threshold, 3, 1000, 20),
    windowMinutes: clampInt(cfg.windowMinutes, 5, 1440, 60),
    lockoutEnabled:
      cfg.lockoutEnabled === undefined ? true : Boolean(cfg.lockoutEnabled),
    lockoutThreshold: clampInt(cfg.lockoutThreshold, 3, 50, 5),
    lockoutWindowMinutes: clampInt(cfg.lockoutWindowMinutes, 1, 1440, 15),
    updatedAt:
      typeof cfg.updatedAt === "string" ? cfg.updatedAt.slice(0, 40) : null,
  };
};

const clampInt = (n, min, max, fallback) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.round(v)));
};

// Check whether an IP has exceeded the auto-ban threshold by counting
// recent events for that IP across the configured time window. Returns
// true if the IP should be auto-blocked.
//
// This walks one hourly bucket per call, so on a scanner storm the caller
// must short-circuit before calling this if the IP is already in the
// SECURITY_CONFIG ipBlockList — otherwise auto-ban becomes a KV-read
// amplifier (every additional probe forces another sweep).
export const shouldAutoban = async (ip) => {
  if (!ip) return false;
  const config = await getAutobanConfig();
  if (!config.enabled) return false;

  const kv = getStore();
  if (!kv) return false;

  const now = new Date();
  const cutoff = now.getTime() - config.windowMinutes * 60_000;
  let count = 0;

  for (let h = 0; h < Math.ceil(config.windowMinutes / 60); h++) {
    const d = new Date(now.getTime() - h * 3600_000);
    const key = bucketKey(d);
    try {
      const entries = await kv.get(key, { type: "json" });
      if (Array.isArray(entries)) {
        for (const e of entries) {
          if (e.ip === ip && new Date(e.t).getTime() >= cutoff) {
            count++;
          }
        }
      }
    } catch {
      // Skip corrupt buckets.
    }
    if (count >= config.threshold) return true;
  }

  return count >= config.threshold;
};

// ── Per-email brute-force lockout ──────────────────────────────────────
//
// Tracks recent failed-login timestamps per email. Once an email accumulates
// `lockoutThreshold` failures inside `lockoutWindowMinutes`, every subsequent
// login attempt for that email is rejected with a generic error — even with
// the correct password — until the window slides past.
//
// Storage: SECURITY_EVENTS KV, key `auth-fails:<lowercased email>` → JSON
// array of millisecond timestamps. KV TTL matches the window so abandoned
// keys self-clean.
//
// All operations short-circuit cheaply if the binding is missing or lockout
// is disabled in autoban-config, so the rest of the auth flow never depends
// on this returning anything in particular.

const lockoutKey = (subject) =>
  `${LOCKOUT_KEY_PREFIX}${safeStr(subject, 80).toLowerCase()}`;

export const recordAuthFailure = async (subject) => {
  if (!subject) return;
  const kv = getStore();
  if (!kv) return;
  const cfg = await getAutobanConfig();
  if (!cfg.lockoutEnabled) return;
  const windowMs = cfg.lockoutWindowMinutes * 60_000;
  // Add a small grace pad to TTL so the last failure isn't garbage-collected
  // a second before the window completes.
  const ttl = Math.max(60, cfg.lockoutWindowMinutes * 60 + 30);
  const now = Date.now();
  const cutoff = now - windowMs;
  const key = lockoutKey(subject);

  for (let attempt = 0; attempt < CAS_RETRIES; attempt++) {
    try {
      const { data, etag } = await kv.getWithMetadata(key, { type: "json" });
      const previous = Array.isArray(data) ? data : [];
      const list = previous.filter((t) => t > cutoff);
      list.push(now);
      if (list.length > MAX_LOCKOUT_TIMESTAMPS) {
        list.splice(0, list.length - MAX_LOCKOUT_TIMESTAMPS);
      }
      const opts =
        etag != null
          ? { onlyIfMatch: etag, expirationTtl: ttl }
          : { onlyIfNew: true, expirationTtl: ttl };
      const result = await kv.setJSON(key, list, opts);
      if (result?.modified) break;
    } catch {
      break;
    }
  }
};

export const isAccountLocked = async (subject) => {
  if (!subject) return false;
  const kv = getStore();
  if (!kv) return false;
  const cfg = await getAutobanConfig();
  if (!cfg.lockoutEnabled) return false;
  const windowMs = cfg.lockoutWindowMinutes * 60_000;
  const cutoff = Date.now() - windowMs;
  try {
    const list = await kv.get(lockoutKey(subject), { type: "json" });
    if (!Array.isArray(list)) return false;
    const recent = list.filter((t) => t > cutoff);
    return recent.length >= cfg.lockoutThreshold;
  } catch {
    return false;
  }
};

export const clearAccountLockout = async (subject) => {
  if (!subject) return false;
  const kv = getStore();
  if (!kv) return false;
  try {
    await kv.delete(lockoutKey(subject));
    return true;
  } catch {
    return false;
  }
};

// List currently-locked accounts so the admin dashboard can surface them
// (and offer a one-click "Unlock" button if a real customer got caught).
// Best-effort: pages through up to 5_000 lockout keys.
export const getAccountLockouts = async () => {
  const ns = getRawNamespace();
  if (!ns) return [];
  const cfg = await getAutobanConfig();
  if (!cfg.lockoutEnabled) return [];
  const windowMs = cfg.lockoutWindowMinutes * 60_000;
  const now = Date.now();
  const cutoff = now - windowMs;
  const result = [];
  let cursor;
  for (let page = 0; page < 5; page++) {
    let response;
    try {
      response = await ns.list({
        prefix: LOCKOUT_KEY_PREFIX,
        cursor,
        limit: 1000,
      });
    } catch {
      break;
    }
    const keys = Array.isArray(response?.keys) ? response.keys : [];
    if (keys.length === 0) break;
    await Promise.all(
      keys.map(async (k) => {
        try {
          const raw = await ns.get(k.name, "text");
          if (!raw) return;
          const list = JSON.parse(raw);
          if (!Array.isArray(list)) return;
          const recent = list.filter((t) => t > cutoff);
          if (recent.length >= cfg.lockoutThreshold) {
            const subject = k.name.slice(LOCKOUT_KEY_PREFIX.length);
            const lastAttempt = Math.max(...recent);
            result.push({
              subject,
              attempts: recent.length,
              lockedUntil: new Date(lastAttempt + windowMs).toISOString(),
            });
          }
        } catch {
          // Skip corrupt entries.
        }
      }),
    );
    if (response?.list_complete || !response?.cursor) break;
    cursor = response.cursor;
  }
  result.sort((a, b) => b.attempts - a.attempts);
  return result;
};

// ── Reset ────────────────────────────────────────────────────────────

export const resetSecurityEvents = async () => {
  // Use the raw KV namespace here: makeStore.list() reshapes the result,
  // and we want the native cursor/list_complete fields for paging.
  const ns = getRawNamespace();
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
          // Swallow individual failures.
        }
      }),
    );
    if (result?.list_complete || !result?.cursor) break;
    cursor = result.cursor;
  }
  return { deleted, skipped: false };
};
