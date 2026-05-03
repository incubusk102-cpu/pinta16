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

import { getCloudflareEnv } from "./context.js";

const MAX_PER_BUCKET = 500;
const BUCKET_TTL_SECONDS = 7 * 24 * 3600; // auto-expire after 7 days
const STATS_KEY = "stats";
const AUTOBAN_KEY = "autoban-config";

const getStore = () => {
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

  const key = bucketKey(now);

  try {
    const raw = await kv.get(key, "text");
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) throw new Error("corrupt");
    list.push(entry);
    if (list.length > MAX_PER_BUCKET)
      list.splice(0, list.length - MAX_PER_BUCKET);
    await kv.put(key, JSON.stringify(list), {
      expirationTtl: BUCKET_TTL_SECONDS,
    });
  } catch {
    // Fire-and-forget: never block the request.
  }

  try {
    await incrementStats(kv, entry.type, entry.ip);
  } catch {
    // Best effort.
  }
};

// ── Rolling stats ────────────────────────────────────────────────────

const incrementStats = async (kv, type, ip) => {
  const raw = await kv.get(STATS_KEY, "text");
  const stats = raw ? JSON.parse(raw) : freshStats();
  if (!stats.byType || !stats.byIp) Object.assign(stats, freshStats());

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

  await kv.put(STATS_KEY, JSON.stringify(stats), {
    expirationTtl: BUCKET_TTL_SECONDS,
  });
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
    const raw = await kv.get(STATS_KEY, "text");
    if (!raw) return freshStats();
    const parsed = JSON.parse(raw);
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
      const raw = await kv.get(key, "text");
      if (raw) {
        const entries = JSON.parse(raw);
        if (Array.isArray(entries)) results.push(...entries);
      }
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
    const raw = await kv.get(AUTOBAN_KEY, "text");
    if (!raw) return defaultAutobanConfig();
    const parsed = JSON.parse(raw);
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
  await kv.put(AUTOBAN_KEY, JSON.stringify(merged));
  return merged;
};

const defaultAutobanConfig = () => ({
  enabled: false,
  threshold: 20,
  windowMinutes: 60,
  updatedAt: null,
});

const sanitizeAutobanConfig = (input) => {
  const cfg = input && typeof input === "object" ? input : {};
  return {
    enabled: Boolean(cfg.enabled),
    threshold: clampInt(cfg.threshold, 3, 1000, 20),
    windowMinutes: clampInt(cfg.windowMinutes, 5, 1440, 60),
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
export const shouldAutoban = async (ip) => {
  if (!ip) return false;
  const config = await getAutobanConfig();
  if (!config.enabled) return false;

  const kv = getStore();
  if (!kv) return false;

  const now = new Date();
  let count = 0;

  for (let h = 0; h < Math.ceil(config.windowMinutes / 60); h++) {
    const d = new Date(now.getTime() - h * 3600_000);
    const key = bucketKey(d);
    try {
      const raw = await kv.get(key, "text");
      if (raw) {
        const entries = JSON.parse(raw);
        if (Array.isArray(entries)) {
          const cutoff = now.getTime() - config.windowMinutes * 60_000;
          for (const e of entries) {
            if (e.ip === ip && new Date(e.t).getTime() >= cutoff) {
              count++;
            }
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

// ── Reset ────────────────────────────────────────────────────────────

export const resetSecurityEvents = async () => {
  const kv = getStore();
  if (!kv) return { deleted: 0, skipped: true };
  let deleted = 0;
  let cursor;
  for (let page = 0; page < 50; page++) {
    let result;
    try {
      result = await kv.list({ cursor, limit: 1000 });
    } catch {
      break;
    }
    const keys = Array.isArray(result?.keys) ? result.keys : [];
    if (keys.length === 0) break;
    await Promise.all(
      keys.map(async (k) => {
        try {
          await kv.delete(k.name);
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
