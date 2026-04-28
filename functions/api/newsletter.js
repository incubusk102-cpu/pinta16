// /api/newsletter — public POST to subscribe; admin GET (list) / DELETE (unsubscribe).
// KV namespace: NEWSLETTER (single key "subscribers" → JSON array).
//
// Subscribers are also forwarded to Resend or Brevo (whichever is configured
// via env vars). Failures don't roll back the local subscribe — we still
// record the entry and surface the forwarder error in the stored row.

import { makeStore } from "./_lib/kv-store.js";
import { isAuthenticated } from "./_lib/admin-auth.js";
import { buildLambdaEvent } from "./_lib/lambda-event.js";

const LIST_KEY = "subscribers";
const jsonHeaders = { "Content-Type": "application/json" };

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

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

const readSubscribers = async (store) => {
  const list = await store.get(LIST_KEY, { type: "json" });
  return Array.isArray(list) ? list : [];
};

const forwardToProvider = async (entry, env) => {
  const resendKey = env.RESEND_API_KEY;
  const resendAudience = env.RESEND_AUDIENCE_ID;
  const brevoKey = env.BREVO_API_KEY;
  const brevoListId = env.BREVO_LIST_ID;

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

const handle = async ({ request, env }) => {
  if (!env.NEWSLETTER) {
    return json(500, { error: "NEWSLETTER KV binding missing" });
  }
  const store = makeStore(env.NEWSLETTER);
  const event = await buildLambdaEvent(request);
  const method = request.method;

  try {
    if (method === "GET") {
      if (!(await isAuthenticated(event, env))) {
        return json(401, { error: "Not authenticated" });
      }
      const subs = await readSubscribers(store);
      const provider =
        env.RESEND_API_KEY && env.RESEND_AUDIENCE_ID
          ? "resend"
          : env.BREVO_API_KEY && env.BREVO_LIST_ID
            ? "brevo"
            : null;
      return json(200, {
        subscribers: subs,
        count: subs.length,
        provider,
      });
    }

    if (method === "POST") {
      const body = parseBody(event.body);
      const email = String(body?.email || "")
        .trim()
        .toLowerCase();
      const name = String(body?.name || "").trim();
      const source = String(body?.source || "").trim();

      if (!isValidEmail(email)) {
        return json(400, { error: "invalid_email" });
      }

      const subs = await readSubscribers(store);
      const existing = subs.find((s) => s.email === email);
      if (existing) {
        return json(200, { ok: true, already: true });
      }

      const entry = {
        email,
        name: name || undefined,
        source: source || undefined,
        ip:
          event.headers?.["cf-connecting-ip"] ||
          event.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
          undefined,
        userAgent: event.headers?.["user-agent"] || undefined,
        subscribedAt: new Date().toISOString(),
      };

      const forward = await forwardToProvider(entry, env);
      const stored = {
        ...entry,
        provider: forward.provider || undefined,
        forwardError: forward.error || undefined,
        forwardSkipped: forward.skipped || undefined,
      };

      const next = [stored, ...subs];
      await store.setJSON(LIST_KEY, next);
      return json(200, { ok: true, already: false });
    }

    if (method === "DELETE") {
      if (!(await isAuthenticated(event, env))) {
        return json(401, { error: "Not authenticated" });
      }
      const body = parseBody(event.body);
      const email = String(body?.email || "")
        .trim()
        .toLowerCase();
      if (!email) return json(400, { error: "email_required" });
      const subs = await readSubscribers(store);
      const next = subs.filter((s) => s.email !== email);
      await store.setJSON(LIST_KEY, next);
      return json(200, { ok: true, count: next.length });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    return json(500, {
      error: "newsletter_error",
      message: String(err?.message || err),
    });
  }
};

export const onRequestGet = handle;
export const onRequestPost = handle;
export const onRequestDelete = handle;
