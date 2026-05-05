// /api/newsletter — public POST to subscribe; admin GET (list) / DELETE (unsubscribe).
import { initRequestContext } from "./_lib/handler-wrapper.js";
// KV namespace: NEWSLETTER (single key "subscribers" → JSON array).
//
// Subscribers are also forwarded to Resend or Brevo (whichever is configured
// via env vars). Failures don't roll back the local subscribe — we still
// record the entry and surface the forwarder error in the stored row.

import { makeStore } from "./_lib/kv-store.js";
import { isAuthenticated } from "./_lib/admin-auth.js";
import { BodyTooLargeError, buildLambdaEvent } from "./_lib/lambda-event.js";
import {
  turnstileFailureResponse,
  verifyTurnstileToken,
} from "./_lib/turnstile.js";
import {
  isEmailConfigured,
  loadWelcomeEmailConfig,
  prepareReactChromeConfigForExternal,
  sendEmail,
} from "./_lib/email.js";
import { renderVoucherEmail } from "../../src/emails/render.ts";
import { consumeRateLimit, rateLimitResponse } from "./_lib/rate-limit.js";

const LIST_KEY = "subscribers";
const jsonHeaders = { "Content-Type": "application/json" };

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...jsonHeaders, "X-Content-Type-Options": "nosniff" },
  });

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

// Transactional voucher delivery used by the new-user modal: we email
// the visitor the promo code they unlocked. We don't roll back the
// subscribe if the email fails — the entry is still stored and the
// failure reason is surfaced to the caller so the admin can see it.
//
// Renders through the shared React Email VoucherEmail template so the
// voucher inherits the same BaseEmail chrome (C monogram on the left,
// admin palette / fonts / footer links) as the welcome and order
// emails — visitors see one consistent brand from the very first
// touchpoint.
const sendVoucherEmail = async (to, voucherCode) => {
  if (!isEmailConfigured()) {
    return { delivered: false, skipped: true, reason: "not configured" };
  }
  const code = String(voucherCode || "")
    .trim()
    .toUpperCase();
  if (!code) {
    return { delivered: false, skipped: true, reason: "no voucher code" };
  }
  // Reuse the welcome-email subtree for chrome (logo / banner / palette
  // / footer). Voucher email is the visitor's first inbox touchpoint —
  // it's brand-marketing flavour, like the welcome email, so they
  // should look like part of the same conversation.
  const welcome = await loadWelcomeEmailConfig();
  const config = prepareReactChromeConfigForExternal(welcome, "welcome");
  const built = await renderVoucherEmail({ code, config });
  return await sendEmail({
    to,
    subject: built.subject,
    html: built.html,
    text: built.text,
  });
};

const handle = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;
  if (!env.NEWSLETTER) {
    return json(500, { error: "NEWSLETTER KV binding missing" });
  }
  const store = makeStore(env.NEWSLETTER);
  let event;
  try {
    event = await buildLambdaEvent(request);
  } catch (err) {
    if (err instanceof BodyTooLargeError) {
      return json(413, { error: "Request body too large" });
    }
    throw err;
  }
  const method = request.method;

  try {
    if (method === "GET") {
      if (!(await isAuthenticated(event))) {
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
      // Throttle public newsletter signups so the endpoint can't be
      // used as a free transactional-email cannon (we email a voucher
      // code on every signup that includes one). 5 signups / minute /
      // IP is plenty for legitimate visitors and cheap to absorb.
      const limit = await consumeRateLimit(event, {
        bucket: "newsletter-subscribe",
        windowMs: 60_000,
        max: 5,
      });
      if (!limit.allowed) {
        // Newsletter handler uses native Response (not wrapHandler), so
        // adapt the lambda-event shape to fetch-style.
        const r = rateLimitResponse(limit.retryAfter);
        return new Response(r.body, {
          status: r.statusCode,
          headers: r.headers,
        });
      }
      const body = parseBody(event.body);
      // Honeypot — the form ships a hidden `<input name="website">`
      // styled to be invisible / off-screen / aria-hidden, so a real
      // user never types in it. Most form-spamming bots blindly fill
      // every input, so a non-empty honeypot is a strong "this is a
      // bot" signal. Return 200/already to look like a successful
      // submit instead of leaking that we detected them — they'll
      // think the email is on the list and stop retrying.
      if (typeof body?.website === "string" && body.website.trim().length > 0) {
        return json(200, { ok: true, already: true, voucher: null });
      }
      // Verify Cloudflare Turnstile if configured. Falls open (skipped)
      // when TURNSTILE_SECRET_KEY isn't set, so this is safe to ship
      // before the dashboard widget is created.
      const tsToken =
        typeof body?.turnstileToken === "string" ? body.turnstileToken : "";
      const ts = await verifyTurnstileToken(event, { token: tsToken });
      if (!ts.allowed) {
        const r = turnstileFailureResponse(ts.reason);
        return new Response(r.body, {
          status: r.statusCode,
          headers: r.headers,
        });
      }
      const email = String(body?.email || "")
        .trim()
        .toLowerCase();
      const name = String(body?.name || "").trim();
      const source = String(body?.source || "").trim();
      const voucherCode = String(body?.voucherCode || "")
        .trim()
        .toUpperCase()
        .slice(0, 30);

      if (!isValidEmail(email)) {
        return json(400, { error: "invalid_email" });
      }

      // Voucher delivery is best-effort — fire it whether or not the
      // visitor was already on the list (they're asking for the code,
      // not just a list signup), but only when a code was actually
      // requested. Skipped/failed sends don't roll back the subscribe.
      const voucherDelivery = voucherCode
        ? await sendVoucherEmail(email, voucherCode)
        : null;

      const subs = await readSubscribers(store);
      const existing = subs.find((s) => s.email === email);
      if (existing) {
        return json(200, {
          ok: true,
          already: true,
          voucher: voucherDelivery
            ? {
                sent: voucherDelivery.delivered === true,
                provider: voucherDelivery.provider || null,
                error: voucherDelivery.error || voucherDelivery.reason || null,
              }
            : null,
        });
      }

      const entry = {
        email,
        name: name || undefined,
        source: source || undefined,
        voucherCode: voucherCode || undefined,
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
        voucherSent: voucherDelivery?.delivered === true ? true : undefined,
        voucherError:
          voucherDelivery && voucherDelivery.delivered !== true
            ? voucherDelivery.error || voucherDelivery.reason
            : undefined,
      };

      const next = [stored, ...subs];
      await store.setJSON(LIST_KEY, next);
      return json(200, {
        ok: true,
        already: false,
        voucher: voucherDelivery
          ? {
              sent: voucherDelivery.delivered === true,
              provider: voucherDelivery.provider || null,
              error: voucherDelivery.error || voucherDelivery.reason || null,
            }
          : null,
      });
    }

    if (method === "DELETE") {
      if (!(await isAuthenticated(event))) {
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
