// /api/admin/discount-codes — top-level discount code management.
//
// Admin-only. Provides a dedicated entry point for the Marketing →
// Codes panel, joining the KV-stored promo definitions
// (STOREFRONT_CONFIG.promoCodes) with the D1 `coupon_redemptions`
// ledger for per-code analytics.
//
// Storage is unchanged: codes still live in STOREFRONT_CONFIG.promoCodes
// (see functions/api/storefront-config.js). This endpoint reuses the
// existing sanitize / upsert / delete logic on that file so the
// storefront entry, checkout validation, and announcement bar all keep
// reading from one place.
//
// GET  ?action=list                    → codes joined with D1 stats,
//                                         plus tiny summary counters.
// GET  ?action=get&code=<CODE>         → single code with full stats
//                                         and the most-recent redemptions.
// POST ?action=save                    → upsert. Body: { promo: {...} }
// POST ?action=delete                  → { code }
// POST ?action=toggle                  → { code } flip enabled flag.

import { initRequestContext } from "../_lib/handler-wrapper.js";
import { isAuthenticated } from "../_lib/admin-auth.js";
import { BodyTooLargeError, buildLambdaEvent } from "../_lib/lambda-event.js";
import { couponAnalytics, getD1 } from "../_lib/d1.js";
import { makeStore } from "../_lib/kv-store.js";
import { requireKvBinding } from "../_lib/context.js";

const STOREFRONT_CONFIG_KEY = "config";

// Cap on description length — matches the existing sanitizer in
// functions/api/storefront-config.js so save round-trips don't
// silently truncate.
const MAX_DESCRIPTION_LENGTH = 200;
const MAX_CODE_LENGTH = 30;

// How many recent redemptions to surface in the per-code detail view.
// Keep small so the JSON stays cheap; the full audit trail still lives
// in D1.
const RECENT_REDEMPTIONS_LIMIT = 25;

const ALLOWED_TYPES = new Set(["percent", "fixed", "flat", "free_shipping"]);

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
    },
  });

const parseBody = (body) => {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
};

const getStorefrontStore = () =>
  makeStore(requireKvBinding("STOREFRONT_CONFIG"));

const readPromoCodes = async () => {
  const store = getStorefrontStore();
  const raw = await store.get(STOREFRONT_CONFIG_KEY, { type: "json" });
  if (!raw || typeof raw !== "object") return { config: null, codes: [] };
  const codes = Array.isArray(raw.promoCodes) ? raw.promoCodes : [];
  return { config: raw, codes };
};

// Personal reward codes (birthday / anniversary / referral) live in the
// same array but are minted per-customer. Hide them from the admin
// Codes panel — they're not user-facing promotions the admin manages.
const isManagedCode = (p) => p && !p.personal;

// Convert the raw promo def into a stable admin-facing shape. The KV
// schema is already sanitized; we just normalize null / undefined and
// drop fields the UI doesn't read.
const toAdminPromo = (p) => ({
  code: String(p.code || ""),
  type: p.type || "percent",
  value: Math.max(0, Math.floor(Number(p.value) || 0)),
  freeShipping: Boolean(p.freeShipping),
  minSpend: Math.max(0, Math.floor(Number(p.minSpend) || 0)),
  usageLimit:
    p.usageLimit === null || p.usageLimit === undefined
      ? null
      : Math.max(0, Math.floor(Number(p.usageLimit) || 0)),
  usageCount: Math.max(0, Math.floor(Number(p.usageCount) || 0)),
  maxRedemptionsPerCustomer: Math.max(
    0,
    Math.floor(Number(p.maxRedemptionsPerCustomer) || 0),
  ),
  expiresAt:
    typeof p.expiresAt === "string" && p.expiresAt ? p.expiresAt : null,
  enabled: p.enabled !== false,
  description: String(p.description || "").slice(0, MAX_DESCRIPTION_LENGTH),
});

// Build the per-code analytics lookup. Returns a Map keyed by uppercase
// code → { uses, totalDiscount, grossRevenue, uniqueCustomers,
// lastRedeemedAt }. Returns an empty map when D1 is unbound so the UI
// still renders (it falls back to the KV usageCount counter).
const loadAnalyticsMap = async () => {
  const rows = await couponAnalytics({ limit: 200 });
  const map = new Map();
  if (!Array.isArray(rows)) return map;
  for (const row of rows) {
    if (!row || typeof row.code !== "string") continue;
    map.set(row.code.toUpperCase(), row);
  }
  return map;
};

// Decide a derived status the UI can colour-code without recomputing
// the same conditions client-side.
const deriveStatus = (promo) => {
  if (!promo.enabled) return "disabled";
  if (promo.expiresAt) {
    const ts = Date.parse(promo.expiresAt);
    if (Number.isFinite(ts) && ts < Date.now()) return "expired";
  }
  if (
    promo.usageLimit !== null &&
    promo.usageLimit > 0 &&
    promo.usageCount >= promo.usageLimit
  ) {
    return "exhausted";
  }
  return "active";
};

// Reuse the storefront-config upsert flow by POSTing back through the
// same handler. Cheaper and safer than duplicating sanitize logic —
// when the schema changes there, this endpoint follows for free.
const proxyToStorefrontConfig = async (request, action, payload) => {
  const url = new URL(request.url);
  const target = new URL(`/api/storefront-config?action=${action}`, url.origin);
  const headers = new Headers();
  // Forward the admin session cookie + auth header so storefront-config
  // sees the same admin session.
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const auth = request.headers.get("authorization");
  if (auth) headers.set("authorization", auth);
  headers.set("content-type", "application/json");
  const res = await fetch(target.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  return res;
};

// Fetch the most recent redemptions for a single code straight from D1.
// Used in the per-code detail view. Falls back to [] when D1 is unbound.
const recentRedemptions = async (code) => {
  const db = getD1();
  if (!db) return [];
  const upper = String(code || "")
    .trim()
    .toUpperCase();
  if (!upper) return [];
  try {
    const res = await db
      .prepare(
        `SELECT order_id, customer_email, discount_cents, total_cents,
                redeemed_at
         FROM coupon_redemptions
         WHERE code = ?
         ORDER BY redeemed_at DESC
         LIMIT ?`,
      )
      .bind(upper, RECENT_REDEMPTIONS_LIMIT)
      .all();
    const rows = Array.isArray(res?.results) ? res.results : [];
    return rows.map((r) => ({
      orderId: String(r.order_id || ""),
      customerEmail: String(r.customer_email || ""),
      discount: Math.max(0, Math.floor(Number(r.discount_cents) || 0)),
      total: Math.max(0, Math.floor(Number(r.total_cents) || 0)),
      redeemedAt: String(r.redeemed_at || ""),
    }));
  } catch {
    return [];
  }
};

// Validate a save payload up-front so the UI gets a clean 400 on the
// most common mistakes instead of a hidden round-trip through
// storefront-config sanitize (which silently drops invalid entries).
const validatePromoInput = (raw) => {
  if (!raw || typeof raw !== "object") {
    return { error: "Promo payload required" };
  }
  const code = String(raw.code || "")
    .trim()
    .toUpperCase();
  if (!code) return { error: "Code is required" };
  if (code.length > MAX_CODE_LENGTH) {
    return { error: `Code must be ${MAX_CODE_LENGTH} characters or fewer` };
  }
  if (!/^[A-Z0-9_-]+$/.test(code)) {
    return { error: "Code may only contain letters, numbers, _ and -" };
  }
  const type = String(raw.type || "percent");
  if (!ALLOWED_TYPES.has(type)) return { error: `Unknown type: ${type}` };
  const value = Math.max(0, Math.floor(Number(raw.value) || 0));
  if (type !== "free_shipping") {
    if (value <= 0) {
      return { error: "Discount value must be greater than zero" };
    }
    if (type === "percent" && value > 100) {
      return { error: "Percent discount cannot exceed 100" };
    }
  }
  return {
    code,
    type,
    value: type === "free_shipping" ? 0 : value,
    freeShipping: type === "free_shipping" ? true : Boolean(raw.freeShipping),
    minSpend: Math.max(0, Math.floor(Number(raw.minSpend) || 0)),
    usageLimit:
      raw.usageLimit === null || raw.usageLimit === undefined
        ? null
        : Math.max(0, Math.floor(Number(raw.usageLimit) || 0)) || null,
    maxRedemptionsPerCustomer: Math.max(
      0,
      Math.floor(Number(raw.maxRedemptionsPerCustomer) || 0),
    ),
    expiresAt:
      typeof raw.expiresAt === "string" && raw.expiresAt ? raw.expiresAt : null,
    enabled: raw.enabled !== false,
    description: String(raw.description || "").slice(0, MAX_DESCRIPTION_LENGTH),
  };
};

// ── GET ──────────────────────────────────────────────────────────────

export const onRequestGet = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;

  const event = {
    headers: Object.fromEntries(request.headers.entries()),
  };
  if (!(await isAuthenticated(event))) {
    return json(401, { error: "Not authenticated" });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "list";

  if (action === "list") {
    const [{ codes }, analyticsMap] = await Promise.all([
      readPromoCodes(),
      loadAnalyticsMap(),
    ]);
    const managed = codes.filter(isManagedCode).map(toAdminPromo);
    const items = managed.map((p) => {
      const stats = analyticsMap.get(p.code) || null;
      // D1 uses authoritative when present (it counts real placed
      // orders). Fall back to KV usageCount when D1 has no rows for
      // this code yet — newly created codes start at 0.
      const effectiveUses = stats?.uses ?? p.usageCount;
      return {
        ...p,
        status: deriveStatus(p),
        stats: stats
          ? {
              uses: stats.uses,
              totalDiscount: stats.totalDiscount,
              grossRevenue: stats.grossRevenue,
              uniqueCustomers: stats.uniqueCustomers,
              lastRedeemedAt: stats.lastRedeemedAt,
            }
          : null,
        effectiveUses,
      };
    });

    // Surface a summary block so the panel can render the headline
    // counters without iterating the full list client-side.
    const summary = {
      total: items.length,
      active: items.filter((p) => p.status === "active").length,
      disabled: items.filter((p) => p.status === "disabled").length,
      expired: items.filter((p) => p.status === "expired").length,
      exhausted: items.filter((p) => p.status === "exhausted").length,
      totalRedemptions: items.reduce((sum, p) => sum + (p.stats?.uses ?? 0), 0),
      totalDiscountGiven: items.reduce(
        (sum, p) => sum + (p.stats?.totalDiscount ?? 0),
        0,
      ),
      totalGrossRevenue: items.reduce(
        (sum, p) => sum + (p.stats?.grossRevenue ?? 0),
        0,
      ),
    };

    return json(200, {
      items,
      summary,
      d1Available: getD1() !== null,
    });
  }

  if (action === "get") {
    const code = String(url.searchParams.get("code") || "")
      .trim()
      .toUpperCase();
    if (!code) return json(400, { error: "Code is required" });
    const [{ codes }, analyticsMap, recent] = await Promise.all([
      readPromoCodes(),
      loadAnalyticsMap(),
      recentRedemptions(code),
    ]);
    const found = codes.find((p) => isManagedCode(p) && p.code === code);
    if (!found) return json(404, { error: "Not found" });
    const promo = toAdminPromo(found);
    const stats = analyticsMap.get(code) || null;
    return json(200, {
      promo: {
        ...promo,
        status: deriveStatus(promo),
        stats: stats
          ? {
              uses: stats.uses,
              totalDiscount: stats.totalDiscount,
              grossRevenue: stats.grossRevenue,
              uniqueCustomers: stats.uniqueCustomers,
              lastRedeemedAt: stats.lastRedeemedAt,
            }
          : null,
      },
      recentRedemptions: recent,
      d1Available: getD1() !== null,
    });
  }

  return json(400, { error: `Unknown action: ${action}` });
};

// ── POST ─────────────────────────────────────────────────────────────

export const onRequestPost = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;

  const event = {
    headers: Object.fromEntries(request.headers.entries()),
  };
  if (!(await isAuthenticated(event))) {
    return json(401, { error: "Not authenticated" });
  }

  let lambdaEvent;
  try {
    lambdaEvent = await buildLambdaEvent(request);
  } catch (err) {
    if (err instanceof BodyTooLargeError) {
      return json(413, { error: "Body too large" });
    }
    throw err;
  }
  const body = parseBody(lambdaEvent.body);

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "";

  if (action === "save") {
    const validated = validatePromoInput(body.promo);
    if (validated.error) return json(400, { error: validated.error });

    // Preserve usageCount on edit: the storefront-config upsert path
    // keeps the previous counter when an existing code is updated, but
    // we read fresh codes first so the response is one round-trip.
    const { codes } = await readPromoCodes();
    const previous = codes.find(
      (p) => isManagedCode(p) && p.code === validated.code,
    );

    const res = await proxyToStorefrontConfig(request, "upsert-promo", {
      promo: {
        ...validated,
        // Pass usageCount through so storefront-config doesn't reset it.
        usageCount: previous?.usageCount ?? 0,
      },
    });
    const data = await res.json();
    if (!res.ok) return json(res.status, data);

    // Re-read so the client receives the joined view (config + stats).
    const analyticsMap = await loadAnalyticsMap();
    const saved = (data.config?.promoCodes || []).find(
      (p) => p.code === validated.code,
    );
    if (!saved) return json(500, { error: "Save succeeded but read failed" });
    const promo = toAdminPromo(saved);
    return json(200, {
      promo: {
        ...promo,
        status: deriveStatus(promo),
        stats: analyticsMap.get(validated.code) || null,
      },
      created: !previous,
    });
  }

  if (action === "delete") {
    const code = String(body.code || "")
      .trim()
      .toUpperCase();
    if (!code) return json(400, { error: "Code is required" });
    const res = await proxyToStorefrontConfig(request, "delete-promo", {
      code,
    });
    const data = await res.json();
    if (!res.ok) return json(res.status, data);
    return json(200, { code });
  }

  if (action === "toggle") {
    const code = String(body.code || "")
      .trim()
      .toUpperCase();
    if (!code) return json(400, { error: "Code is required" });
    const { codes } = await readPromoCodes();
    const found = codes.find((p) => isManagedCode(p) && p.code === code);
    if (!found) return json(404, { error: "Not found" });
    const nextEnabled = !(found.enabled !== false);
    const res = await proxyToStorefrontConfig(request, "upsert-promo", {
      promo: {
        ...found,
        enabled: nextEnabled,
      },
    });
    const data = await res.json();
    if (!res.ok) return json(res.status, data);
    return json(200, { code, enabled: nextEnabled });
  }

  return json(400, { error: `Unknown action: ${action}` });
};
