// /api/search-events — storefront search query log + admin readback.
//
// Public POST: client beacon from the gallery search box. Fires once per
// stable query (after a typing debounce, see `useDebouncedValue` in the
// gallery). Persisted to D1 (table `search_events`) so the admin can see
// what shoppers search for vs. what they buy, and which searches return
// zero results.
//
// Admin GET: aggregated insights — top queries, zero-result queries, and
// the most-recent raw events.
//
// Privacy: this endpoint never reads the IP. Country comes from the
// `cf-ipcountry` header (already present at the edge) and is the only
// per-request location signal stored. Queries are capped at 200 chars
// before persistence. The companion table is null-safe: if env.DB is
// unbound the public POST returns 200/{ recorded: false } and the admin
// GET returns 503/{ available: false } so the rest of the API keeps
// working unchanged.
//
// See `functions/api/_lib/d1.js` for the helpers backing each call.

import { initRequestContext } from "./_lib/handler-wrapper.js";
import { isAuthenticated } from "./_lib/admin-auth.js";
import { logError } from "./_lib/redact.js";
import {
  isD1Available,
  recordSearchEvent,
  topSearchQueries,
  zeroResultSearchQueries,
  recentSearchEvents,
} from "./_lib/d1.js";

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
    },
  });

const parseJson = async (request) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

const extractCountry = (request) => {
  const cc = (request.headers?.get?.("cf-ipcountry") || "")
    .trim()
    .toUpperCase();
  if (!cc || cc === "XX") return null;
  return cc.slice(0, 4);
};

// Limit which filter values we persist so a malicious client can't dump
// arbitrary attacker-controlled strings into D1. The set mirrors the
// dropdown options in `src/components/GallerySection.tsx`.
const ALLOWED_AVAILABILITY = new Set(["all", "available", "reserved", "sold"]);
const ALLOWED_PRICE_BUCKETS = new Set([
  "all",
  "lt-3000",
  "3000-3500",
  "3500-3800",
  "3800-4500",
  "gt-4500",
]);

const sanitizeFilter = (value, allowList = null, maxLen = 64) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, maxLen);
  if (!trimmed) return null;
  if (allowList && !allowList.has(trimmed)) return null;
  return trimmed;
};

export const onRequestPost = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;

  if (!isD1Available()) {
    return json(200, { recorded: false, reason: "d1-unbound" });
  }

  const body = await parseJson(request);
  if (!body || typeof body !== "object") {
    return json(400, { error: "JSON body required" });
  }

  const query = String(body.query || "").slice(0, 200);
  if (!query.trim()) {
    return json(400, { error: "query required" });
  }

  // Cap absurd values so a misbehaving client can't write garbage.
  const resultsCount = Math.max(
    0,
    Math.min(10_000, Math.floor(Number(body.resultsCount) || 0)),
  );

  const filterCategory = sanitizeFilter(body.filterCategory);
  const filterAvailability = sanitizeFilter(
    body.filterAvailability,
    ALLOWED_AVAILABILITY,
  );
  const filterPrice = sanitizeFilter(body.filterPrice, ALLOWED_PRICE_BUCKETS);
  const country = extractCountry(request);

  const id = sanitizeFilter(body.id, null, 64);

  try {
    const result = await recordSearchEvent({
      id,
      query,
      resultsCount,
      filterCategory,
      filterAvailability,
      filterPrice,
      country,
    });
    return json(200, result || { recorded: false });
  } catch (error) {
    logError("search-events POST error:", error);
    return json(500, { error: "Could not record search event" });
  }
};

export const onRequestGet = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;

  if (
    !(await isAuthenticated({
      headers: Object.fromEntries(request.headers.entries()),
    }))
  ) {
    return json(401, { error: "Not authenticated" });
  }

  if (!isD1Available()) {
    return json(200, {
      available: false,
      message:
        "D1 binding (env.DB) not configured. Search insights require D1 — the migration table is in `migrations/0005_search_events.sql`.",
    });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "summary";
  const days = Math.max(
    1,
    Math.min(365, Math.floor(Number(url.searchParams.get("days")) || 30)),
  );
  const limit = Math.max(
    1,
    Math.min(200, Math.floor(Number(url.searchParams.get("limit")) || 50)),
  );

  try {
    if (action === "top") {
      const rows = await topSearchQueries({ days, limit });
      return json(200, { available: true, days, results: rows || [] });
    }
    if (action === "zero-results") {
      const rows = await zeroResultSearchQueries({ days, limit });
      return json(200, { available: true, days, results: rows || [] });
    }
    if (action === "recent") {
      const rows = await recentSearchEvents({ limit });
      return json(200, { available: true, results: rows || [] });
    }
    if (action === "summary") {
      const [top, zeros, recent] = await Promise.all([
        topSearchQueries({ days, limit: Math.min(limit, 25) }),
        zeroResultSearchQueries({ days, limit: Math.min(limit, 25) }),
        recentSearchEvents({ limit: Math.min(limit, 50) }),
      ]);
      return json(200, {
        available: true,
        days,
        top: top || [],
        zeroResults: zeros || [],
        recent: recent || [],
      });
    }
    return json(400, { error: `Unknown action '${action}'` });
  } catch (error) {
    logError("search-events GET error:", error);
    return json(500, { error: "Could not load search insights" });
  }
};
