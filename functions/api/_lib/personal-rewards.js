// Mints per-user "personal" promo codes (birthday / anniversary /
// referral give-and-get) into the same storefront-config promo codes
// list the cart already validates against. Idempotent — the same
// (userId, type, year/month) tuple always resolves to the same code,
// and we never duplicate a code already in storage.

import { getStore } from "./kv-stores.js";

const STORE_NAME = "storefront-config";
const CONFIG_KEY = "config";

// All personal rewards are "fixed" peso-off codes (e.g. ₱500 off the
// order subtotal). The cart's `findEligiblePromo` interprets `type:
// "fixed"` as "subtract value from subtotal, never below zero". Don't
// switch to type "flat" — that means "the entire order becomes ₱value"
// which is the opposite intent.
const REWARD_DEFAULTS = {
  birthday: {
    type: "fixed",
    value: 500,
    description: "Birthday gift — happy birthday from Canvas Hub!",
    expiresInDays: 30,
    usageLimit: 1,
  },
  anniversary: {
    type: "fixed",
    value: 1000,
    description: "Anniversary thank-you — a year as a Canvas Hub collector",
    expiresInDays: 30,
    usageLimit: 1,
  },
  "referral-give": {
    type: "fixed",
    value: 200,
    description: "Referral reward — friend's first order, on us",
    expiresInDays: 60,
    usageLimit: 1,
  },
  "referral-get": {
    type: "fixed",
    value: 200,
    description: "Welcome gift from a friend's referral",
    expiresInDays: 60,
    usageLimit: 1,
  },
};

const shortId = (id) =>
  String(id || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 6)
    .toUpperCase();

/** Returns the canonical code for (user, kind, period). */
export const buildPersonalRewardCode = (user, kind, periodKey) => {
  const u = shortId(user.id || user.email || "");
  const prefix = {
    birthday: "BDAY",
    anniversary: "ANNIV",
    "referral-give": "REFGIVE",
    "referral-get": "REFGET",
  }[kind];
  if (!prefix) throw new Error(`Unknown reward kind: ${kind}`);
  return `${prefix}-${u}-${periodKey}`;
};

const todayUtcKey = () => {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${dd}`;
};

/** "MM-DD" comparison against today's UTC date. */
export const isBirthdayToday = (mmdd) => {
  if (!mmdd) return false;
  const d = new Date();
  const today = `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
  return mmdd === today;
};

/** Anniversary trigger: today (UTC) is the same MM-DD as user.firstOrderAt
 *  AND we're at least 1 calendar year past that date. */
export const isAnniversaryToday = (firstOrderAt) => {
  if (!firstOrderAt) return false;
  const first = new Date(firstOrderAt);
  if (Number.isNaN(first.getTime())) return false;
  const now = new Date();
  if (now.getUTCFullYear() <= first.getUTCFullYear()) return false;
  return (
    first.getUTCMonth() === now.getUTCMonth() &&
    first.getUTCDate() === now.getUTCDate()
  );
};

const buildPromo = (code, kind, opts = {}) => {
  const cfg = REWARD_DEFAULTS[kind];
  const expires = new Date(Date.now() + cfg.expiresInDays * 86_400_000);
  return {
    code,
    type: cfg.type,
    value: cfg.value,
    minSpend: 0,
    freeShipping: false,
    enabled: true,
    usageLimit: cfg.usageLimit,
    usageCount: 0,
    expiresAt: expires.toISOString(),
    description: opts.description || cfg.description,
    personal: true, // marker so admin UI can label these distinctly
  };
};

/**
 * Ensure a personal reward exists in storefront-config.promoCodes for
 * the given user/kind/period. Idempotent: returns the existing code
 * unchanged if it's already there.
 *
 * `periodKey`:
 *   - birthday    → "YYYY"  (one per year)
 *   - anniversary → "YYYY"
 *   - referral    → free-form (e.g. invitee's userId short)
 */
export const ensurePersonalReward = async ({
  user,
  kind,
  periodKey,
  description,
}) => {
  if (!user || !kind || !periodKey) return null;
  const code = buildPersonalRewardCode(user, kind, periodKey);
  const store = getStore(STORE_NAME);
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await store.getWithMetadata(CONFIG_KEY, { type: "json" });
    if (!result || !result.data) return null;
    const config = result.data;
    const promos = Array.isArray(config.promoCodes) ? config.promoCodes : [];
    if (promos.some((p) => p.code === code)) {
      return { code, promo: promos.find((p) => p.code === code) };
    }
    const promo = buildPromo(code, kind, { description });
    const next = { ...config, promoCodes: [...promos, promo] };
    const writeOpts = result.etag ? { onlyIfMatch: result.etag } : {};
    const write = await store.setJSON(CONFIG_KEY, next, writeOpts);
    if (write.modified) return { code, promo };
    // CAS retry on conflict
  }
  return null;
};

/**
 * Compute which reward codes are currently "live" for a user without
 * mutating storage. Used by GET /me so the customer sees their gift
 * even before they hit the claim endpoint.
 */
export const computeActiveRewards = (user) => {
  const out = [];
  if (isBirthdayToday(user.birthday)) {
    out.push({
      kind: "birthday",
      periodKey: String(new Date().getUTCFullYear()),
      previewCode: buildPersonalRewardCode(
        user,
        "birthday",
        String(new Date().getUTCFullYear()),
      ),
    });
  }
  if (isAnniversaryToday(user.firstOrderAt)) {
    out.push({
      kind: "anniversary",
      periodKey: String(new Date().getUTCFullYear()),
      previewCode: buildPersonalRewardCode(
        user,
        "anniversary",
        String(new Date().getUTCFullYear()),
      ),
    });
  }
  return out;
};

export const TODAY_UTC_KEY = todayUtcKey;
