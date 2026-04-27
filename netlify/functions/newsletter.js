import { connectLambda, getStore } from "@netlify/blobs";
import { isAuthenticated } from "../lib/admin-auth.js";

const STORE_NAME = "newsletter";
const LIST_KEY = "subscribers"; // legacy: read-only fallback for old data
const SUB_PREFIX = "sub:";

const jsonHeaders = { "Content-Type": "application/json" };

const isValidEmail = (s) =>
  typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

const parseBody = (body) => {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
};

const getNewsletterStore = (event) => {
  connectLambda(event);
  return getStore(STORE_NAME);
};

// Per-subscriber key. Email is already lowercased+trimmed before this is called,
// and isValidEmail() guarantees a single "@" plus no whitespace, so the value is
// safe to use as a Blobs key.
const subKey = (email) => `${SUB_PREFIX}${email}`;

const readSubscriberByEmail = async (store, email) => {
  const direct = await store.get(subKey(email), { type: "json" });
  if (direct && typeof direct === "object") return direct;
  // Legacy: maybe it's still in the array-shaped blob.
  const list = await store.get(LIST_KEY, { type: "json" });
  if (Array.isArray(list)) {
    return list.find((s) => s && s.email === email) || null;
  }
  return null;
};

const readAllSubscribers = async (store) => {
  // Per-subscriber keys (new shape, atomic writes).
  const seen = new Map();
  let cursor;
  do {
    const page = await store.list({ prefix: SUB_PREFIX, cursor });
    for (const item of page.blobs || []) {
      const value = await store.get(item.key, { type: "json" });
      if (value && typeof value === "object" && value.email) {
        seen.set(value.email, value);
      }
    }
    cursor = page.cursor;
  } while (cursor);
  // Legacy: merge in the array-shaped blob (older subscribers).
  const list = await store.get(LIST_KEY, { type: "json" });
  if (Array.isArray(list)) {
    for (const value of list) {
      if (value && value.email && !seen.has(value.email)) {
        seen.set(value.email, value);
      }
    }
  }
  return Array.from(seen.values()).sort((a, b) =>
    String(b.subscribedAt || "").localeCompare(String(a.subscribedAt || "")),
  );
};

const forwardToProvider = async (entry) => {
  const resendKey = process.env.RESEND_API_KEY;
  const resendAudience = process.env.RESEND_AUDIENCE_ID;
  const brevoKey = process.env.BREVO_API_KEY;
  const brevoListId = process.env.BREVO_LIST_ID;

  if (resendKey && resendAudience) {
    try {
      const res = await fetch(
        `https://api.resend.com/audiences/${resendAudience}/contacts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendKey}`,
          },
          body: JSON.stringify({
            email: entry.email,
            first_name: entry.name || undefined,
            unsubscribed: false,
          }),
        },
      );
      if (res.ok) return { provider: "resend" };
      return { provider: "resend", error: `HTTP ${res.status}` };
    } catch (err) {
      return { provider: "resend", error: String(err?.message || err) };
    }
  }

  if (brevoKey && brevoListId) {
    try {
      const res = await fetch("https://api.brevo.com/v3/contacts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": brevoKey,
        },
        body: JSON.stringify({
          email: entry.email,
          attributes: entry.name ? { FIRSTNAME: entry.name } : undefined,
          listIds: [Number(brevoListId)],
          updateEnabled: true,
        }),
      });
      if (res.ok || res.status === 204) return { provider: "brevo" };
      return { provider: "brevo", error: `HTTP ${res.status}` };
    } catch (err) {
      return { provider: "brevo", error: String(err?.message || err) };
    }
  }

  return { provider: null, skipped: true };
};

export const handler = async (event) => {
  const method = event.httpMethod;

  try {
    const store = getNewsletterStore(event);

    if (method === "GET") {
      // Admin-only: return subscriber list + provider config status.
      if (!(await isAuthenticated(event))) {
        return {
          statusCode: 401,
          headers: jsonHeaders,
          body: JSON.stringify({ error: "Not authenticated" }),
        };
      }
      const subs = await readAllSubscribers(store);
      const provider =
        process.env.RESEND_API_KEY && process.env.RESEND_AUDIENCE_ID
          ? "resend"
          : process.env.BREVO_API_KEY && process.env.BREVO_LIST_ID
            ? "brevo"
            : null;
      return {
        statusCode: 200,
        headers: jsonHeaders,
        body: JSON.stringify({
          subscribers: subs,
          count: subs.length,
          provider,
        }),
      };
    }

    if (method === "POST") {
      const body = parseBody(event.body);
      const email = String(body?.email || "")
        .trim()
        .toLowerCase();
      const name = String(body?.name || "").trim();
      const source = String(body?.source || "").trim();

      if (!isValidEmail(email)) {
        return {
          statusCode: 400,
          headers: jsonHeaders,
          body: JSON.stringify({ error: "invalid_email" }),
        };
      }

      const existing = await readSubscriberByEmail(store, email);
      if (existing) {
        // Don't leak PII (ip, userAgent, subscribedAt) to unauthenticated callers.
        return {
          statusCode: 200,
          headers: jsonHeaders,
          body: JSON.stringify({ ok: true, already: true }),
        };
      }

      const entry = {
        email,
        name: name || undefined,
        source: source || undefined,
        ip:
          event.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
          undefined,
        userAgent: event.headers?.["user-agent"] || undefined,
        subscribedAt: new Date().toISOString(),
      };

      const forward = await forwardToProvider(entry);
      const stored = {
        ...entry,
        provider: forward.provider || undefined,
        forwardError: forward.error || undefined,
        forwardSkipped: forward.skipped || undefined,
      };

      // Atomic per-subscriber write — concurrent signups can't overwrite
      // each other because each touches a different blob key.
      await store.setJSON(subKey(email), stored);

      return {
        statusCode: 200,
        headers: jsonHeaders,
        body: JSON.stringify({ ok: true, already: false }),
      };
    }

    if (method === "DELETE") {
      // Admin-only: unsubscribe email from local store.
      if (!(await isAuthenticated(event))) {
        return {
          statusCode: 401,
          headers: jsonHeaders,
          body: JSON.stringify({ error: "Not authenticated" }),
        };
      }
      const body = parseBody(event.body);
      const email = String(body?.email || "")
        .trim()
        .toLowerCase();
      if (!email) {
        return {
          statusCode: 400,
          headers: jsonHeaders,
          body: JSON.stringify({ error: "email_required" }),
        };
      }
      // Delete the per-subscriber blob (no-op if it doesn't exist).
      await store.delete(subKey(email));
      // Also scrub any legacy array-shaped blob so the entry doesn't reappear.
      const legacy = await store.get(LIST_KEY, { type: "json" });
      if (Array.isArray(legacy)) {
        const next = legacy.filter((s) => s && s.email !== email);
        if (next.length !== legacy.length) {
          await store.setJSON(LIST_KEY, next);
        }
      }
      const remaining = await readAllSubscribers(store);
      return {
        statusCode: 200,
        headers: jsonHeaders,
        body: JSON.stringify({ ok: true, count: remaining.length }),
      };
    }

    return {
      statusCode: 405,
      headers: jsonHeaders,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({
        error: "newsletter_error",
        message: String(err?.message || err),
      }),
    };
  }
};
