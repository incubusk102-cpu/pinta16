// /api/abandoned-cart/* — abandoned-cart recovery pipeline.
//
// Routes:
//   POST /api/abandoned-cart/sync          Public. Body: { email, items, name? }.
//                                          Upserts the shopper's cart snapshot
//                                          into the ABANDONED_CARTS KV namespace.
//                                          Called by the checkout form whenever
//                                          the email field changes.
//
//   POST /api/abandoned-cart/process       Bearer-token protected (BACKUP_TOKEN).
//                                          Called by the scheduled GitHub Action.
//                                          Scans all entries and sends recovery
//                                          emails at the 1 h and 24 h marks.
//
//   GET  /api/abandoned-cart/unsubscribe   Public. Query: ?id=<entryId>&t=<token>.
//                                          Marks the entry as opted-out so no
//                                          further emails are sent, returns a
//                                          short HTML confirmation page.
//
// Entry shape stored in KV (key = normalised email):
//   {
//     email, name, items,
//     createdAt,            ISO 8601
//     nudge1SentAt,         ISO 8601 | null
//     nudge2SentAt,         ISO 8601 | null
//     convertedAt,          ISO 8601 | null  (set when an order is placed)
//     unsubscribedAt,       ISO 8601 | null
//   }
//
// Entries auto-expire after 7 days via KV TTL (expirationTtl).

import { initRequestContext } from "../_lib/handler-wrapper.js";
import { consumeRateLimit, rateLimitResponse } from "../_lib/rate-limit.js";
import { BodyTooLargeError, buildLambdaEvent } from "../_lib/lambda-event.js";
import { sendEmail, loadOrderEmailConfig } from "../_lib/email.js";
import { isAuthenticated } from "../_lib/admin-auth.js";
import { makeStore } from "../_lib/kv-store.js";
import { getStore } from "../_lib/kv-stores.js";
import { recordPiiAccess } from "../_lib/audit-log.js";

const SEVEN_DAYS = 7 * 24 * 60 * 60;
const MS_PER_MINUTE = 60_000;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
    },
  });

const isValidEmail = (s) =>
  typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

const normalizeEmail = (e) =>
  typeof e === "string" ? e.trim().toLowerCase() : "";

const constantTimeEqual = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const la = a.length;
  const lb = b.length;
  const len = Math.max(la, lb);
  let mismatch = la ^ lb;
  for (let i = 0; i < len; i++) {
    mismatch |= (a.charCodeAt(i % la) || 0) ^ (b.charCodeAt(i % lb) || 0);
  }
  return mismatch === 0;
};

const buildUnsubToken = async (email, createdAt) => {
  const data = new TextEncoder().encode(`${email}:${createdAt}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
};

const parseBody = (body) => {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
};

// ── sync ────────────────────────────────────────────────────────────────
const handleSync = async (event, env, store) => {
  const limit = await consumeRateLimit(event, {
    bucket: "abandoned-cart-sync",
    windowMs: 60_000,
    max: 10,
  });
  if (!limit.allowed) return rateLimitResponse(limit);

  const data = parseBody(event.body);
  const email = normalizeEmail(data.email);
  if (!email || !isValidEmail(email)) {
    return json(400, { error: "Invalid email" });
  }
  const items = Array.isArray(data.items) ? data.items.slice(0, 50) : [];
  if (!items.length) {
    return json(400, { error: "Cart is empty" });
  }
  const sanitizedItems = items.map((it) => ({
    id: String(it.id || "").slice(0, 100),
    title: String(it.title || "").slice(0, 200),
    price: Math.max(0, Number(it.price) || 0),
    quantity: Math.max(1, Math.min(100, Number(it.quantity) || 1)),
    image: String(it.image || "").slice(0, 500),
  }));
  const name = String(data.name || "")
    .trim()
    .slice(0, 100);

  const existing = await store.get(email, { type: "json" });

  if (existing && existing.unsubscribedAt) {
    return json(200, { ok: true, status: "unsubscribed" });
  }
  if (existing && existing.convertedAt) {
    return json(200, { ok: true, status: "converted" });
  }

  const now = new Date().toISOString();
  const entry = {
    email,
    name: name || (existing && existing.name) || "",
    items: sanitizedItems,
    createdAt: (existing && existing.createdAt) || now,
    updatedAt: now,
    nudge1SentAt: (existing && existing.nudge1SentAt) || null,
    nudge2SentAt: (existing && existing.nudge2SentAt) || null,
    convertedAt: null,
    unsubscribedAt: null,
  };

  await store.setJSON(email, entry, { expirationTtl: SEVEN_DAYS });
  return json(200, { ok: true });
};

const loadAbandonedCartConfig = async () => {
  try {
    const cfgStore = getStore("storefront-config");
    const raw = await cfgStore.get("config", { type: "json" });
    if (!raw || typeof raw !== "object") return null;
    if (!raw.abandonedCart || typeof raw.abandonedCart !== "object")
      return null;
    return raw.abandonedCart;
  } catch {
    return null;
  }
};

// ── process (cron) ──────────────────────────────────────────────────────
const handleProcess = async (env, store) => {
  const token = env.BACKUP_TOKEN;
  if (!token) {
    return json(503, { error: "BACKUP_TOKEN not configured" });
  }

  const settings = await loadAbandonedCartConfig();
  if (settings && settings.enabled === false) {
    return json(200, { ok: true, skipped: true, reason: "disabled" });
  }

  const nudge1Ms = ((settings && settings.nudge1Minutes) || 60) * MS_PER_MINUTE;
  const nudge2Ms =
    ((settings && settings.nudge2Minutes) || 1440) * MS_PER_MINUTE;

  const orderEmail = await loadOrderEmailConfig();
  const now = Date.now();
  let cursor;
  let processed = 0;
  let emailsSent = 0;

  do {
    const page = await store.list({ cursor, limit: 100 });
    cursor = page.cursor;

    for (const blob of page.blobs) {
      const entry = await store.get(blob.key, { type: "json" });
      if (!entry || !entry.email) continue;
      if (entry.convertedAt || entry.unsubscribedAt) continue;

      const created = new Date(entry.createdAt).getTime();
      if (!Number.isFinite(created)) continue;

      const age = now - created;

      if (!entry.nudge1SentAt && age >= nudge1Ms) {
        const result = await sendRecoveryEmail(entry, 1, orderEmail, settings);
        if (result.delivered) {
          entry.nudge1SentAt = new Date().toISOString();
          await store.setJSON(blob.key, entry, {
            expirationTtl: SEVEN_DAYS,
          });
          emailsSent++;
        }
      } else if (entry.nudge1SentAt && !entry.nudge2SentAt && age >= nudge2Ms) {
        const result = await sendRecoveryEmail(entry, 2, orderEmail, settings);
        if (result.delivered) {
          entry.nudge2SentAt = new Date().toISOString();
          await store.setJSON(blob.key, entry, {
            expirationTtl: SEVEN_DAYS,
          });
          emailsSent++;
        }
      }

      processed++;
    }
  } while (cursor);

  return json(200, { ok: true, processed, emailsSent });
};

// ── unsubscribe ─────────────────────────────────────────────────────────
const handleUnsubscribe = async (url, store) => {
  const id = (url.searchParams.get("id") || "").trim().toLowerCase();
  const t = url.searchParams.get("t") || "";

  if (!id || !t) {
    return new Response(unsubscribePage("Missing parameters."), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const entry = await store.get(id, { type: "json" });
  if (!entry) {
    return new Response(
      unsubscribePage("This link has expired or is invalid."),
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const expected = await buildUnsubToken(entry.email, entry.createdAt);
  if (!constantTimeEqual(t, expected)) {
    return new Response(unsubscribePage("Invalid token."), {
      status: 403,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  entry.unsubscribedAt = new Date().toISOString();
  await store.setJSON(id, entry, { expirationTtl: SEVEN_DAYS });

  return new Response(
    unsubscribePage(
      "You've been unsubscribed from cart-recovery emails. You won't hear from us about this again.",
    ),
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
};

// ── email rendering ─────────────────────────────────────────────────────
const PUBLIC_SITE = "https://canvhub.com";

const escapeHtml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatPHP = (n) =>
  `\u20b1${(Number(n) || 0).toLocaleString("en-PH", {
    maximumFractionDigits: 2,
  })}`;

const sendRecoveryEmail = async (entry, nudge, orderEmail, settings) => {
  const firstName = (entry.name || "").split(/\s+/)[0] || "there";
  const items = entry.items || [];
  const subtotal = items.reduce(
    (sum, i) => sum + (Number(i.price) || 0) * (Number(i.quantity) || 1),
    0,
  );

  const unsubToken = await buildUnsubToken(entry.email, entry.createdAt);
  const unsubUrl = `${PUBLIC_SITE}/api/abandoned-cart/unsubscribe?id=${encodeURIComponent(entry.email)}&t=${unsubToken}`;
  const shopUrl =
    (settings && settings.ctaUrl && settings.ctaUrl.trim()) || PUBLIC_SITE;

  const subject =
    nudge === 1
      ? (settings && settings.nudge1Subject) ||
        "You left something behind at Canvas Hub"
      : (settings && settings.nudge2Subject) ||
        "Still thinking about it? Your cart is waiting";

  const heading =
    nudge === 1
      ? (settings && settings.nudge1Heading) || "Your cart is waiting"
      : (settings && settings.nudge2Heading) ||
        "Don\u2019t miss out on your picks";

  const ctaLabel = (settings && settings.ctaLabel) || "Complete your order";

  const introText =
    nudge === 1
      ? `Hi ${escapeHtml(firstName)},\n\nLooks like you left some beautiful artwork in your cart. We've saved it for you \u2014 come back and complete your order whenever you're ready.`
      : `Hi ${escapeHtml(firstName)},\n\nYour handpicked paintings are still waiting. Original artwork sells fast \u2014 grab yours before someone else does.`;

  const introHtml = introText
    .split(/\n{2,}/)
    .filter((p) => p.length)
    .map((p) => `<p style="margin:0 0 12px;">${p.replace(/\n/g, "<br />")}</p>`)
    .join("");

  const itemsHtml = items.length
    ? `<table role="presentation" width="100%" style="border-top:1px solid #efece4;border-bottom:1px solid #efece4;margin:16px 0;">${items
        .map(
          (i) => `
        <tr>
          <td style="padding:8px 0;font-size:13px;color:#1c1c1c;">
            ${escapeHtml(i.title)} <span style="color:#7a7468;">&times; ${Number(i.quantity) || 1}</span>
          </td>
          <td style="padding:8px 0;font-size:13px;text-align:right;color:#1c1c1c;">
            ${formatPHP((Number(i.price) || 0) * (Number(i.quantity) || 1))}
          </td>
        </tr>`,
        )
        .join("")}</table>`
    : "";

  const totalsHtml = `
    <table role="presentation" width="100%" style="font-size:13px;">
      <tr><td style="padding-top:8px;font-weight:600;">Subtotal</td><td style="padding-top:8px;text-align:right;font-weight:600;">${formatPHP(subtotal)}</td></tr>
    </table>`;

  const accent = "#7a7468";
  const primary = "#1c1c1c";

  const bodyHtml = `
    ${introHtml}
    ${itemsHtml}
    ${totalsHtml}
    <p style="margin:24px 0 16px;">
      <a href="${escapeHtml(shopUrl)}" style="display:inline-block;padding:10px 28px;background:${primary};color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:500;">${escapeHtml(ctaLabel)}</a>
    </p>
    <p style="margin:24px 0 0;font-size:12px;color:${accent};">
      Questions? Just reply to this email.
    </p>
  `;

  const chrome = orderEmail || {
    fromName: "Canvas Hub",
    fromEmail: "order@canvhub.com",
    primaryColor: primary,
    accentColor: accent,
    showLogo: true,
    showBanner: false,
    bodyFont: "inter",
    template: "classic",
    headerAlign: "left",
    dividerStyle: "line",
    buttonStyle: "filled",
    footerTagline: "original Filipino paintings",
    footerLinks: [],
  };

  const fromEmail = (chrome.fromEmail || "order@canvhub.com").trim();
  const fromName = (chrome.fromName || "Canvas Hub").trim();
  const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

  const html = buildRecoveryHtml(heading, bodyHtml, unsubUrl, chrome);
  const text = `${heading}\n\n${introText.replace(/<[^>]+>/g, "")}\n\nSubtotal: ${formatPHP(subtotal)}\n\nComplete your order: ${shopUrl}\n\nUnsubscribe: ${unsubUrl}`;

  return await sendEmail({ to: entry.email, subject, html, text, from });
};

const buildRecoveryHtml = (heading, bodyHtml, unsubUrl, chrome) => {
  const accent = chrome.accentColor || "#7a7468";
  const fromName = escapeHtml(chrome.fromName || "Canvas Hub");
  const footerTagline = String(
    chrome.footerTagline || "original Filipino paintings",
  ).trim();
  const footerTaglineHtml = footerTagline
    ? `&mdash; ${escapeHtml(footerTagline)}`
    : "";

  return `
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${fromName}</title>
</head>
<body style="margin:0;padding:24px;background:#f5f3ee;font-family:Inter,Helvetica,Arial,sans-serif;color:#1c1c1c;">
  <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e1d8;border-radius:6px;overflow:hidden;">
    <tr>
      <td style="padding:24px 28px;border-bottom:1px solid #efece4;">
        <div style="font-family:'Playfair Display',Georgia,serif;font-size:22px;letter-spacing:0.02em;color:#1c1c1c;">${fromName}</div>
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.2em;color:${accent};margin-top:4px;">${escapeHtml(heading)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 28px;font-size:14px;line-height:1.6;color:#1c1c1c;">
        ${bodyHtml}
      </td>
    </tr>
    <tr>
      <td style="padding:18px 28px;border-top:1px solid #efece4;font-size:11px;color:${accent};">
        <span style="font-family:'EB Garamond',Georgia,'Playfair Display',serif;font-style:italic;font-size:14px;letter-spacing:0.02em;color:#c4a86a;">${fromName}</span> ${footerTaglineHtml}
        <br /><a href="${escapeHtml(unsubUrl)}" style="color:${accent};font-size:10px;">Unsubscribe from cart reminders</a>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
};

const unsubscribePage = (message) =>
  `
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Unsubscribed — Canvas Hub</title>
</head>
<body style="margin:0;padding:48px 24px;background:#f5f3ee;font-family:Inter,Helvetica,Arial,sans-serif;color:#1c1c1c;text-align:center;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e5e1d8;border-radius:6px;padding:32px;">
    <div style="font-family:'Playfair Display',Georgia,serif;font-size:22px;margin-bottom:16px;">Canvas Hub</div>
    <p style="font-size:14px;line-height:1.6;color:#1c1c1c;">${message}</p>
    <p style="margin-top:24px;"><a href="https://canvhub.com" style="color:#7a7468;font-size:13px;">Back to Canvas Hub</a></p>
  </div>
</body>
</html>`.trim();

// ── stats (admin) ───────────────────────────────────────────────────────
const handleStats = async (event, store) => {
  let cursor;
  let total = 0;
  let pending = 0;
  let nudge1Sent = 0;
  let nudge2Sent = 0;
  let converted = 0;
  let unsubscribed = 0;

  do {
    const page = await store.list({ cursor, limit: 100 });
    cursor = page.cursor;

    for (const blob of page.blobs) {
      const entry = await store.get(blob.key, { type: "json" });
      if (!entry || !entry.email) continue;
      total++;
      if (entry.convertedAt) {
        converted++;
      } else if (entry.unsubscribedAt) {
        unsubscribed++;
      } else if (entry.nudge2SentAt) {
        nudge2Sent++;
      } else if (entry.nudge1SentAt) {
        nudge1Sent++;
      } else {
        pending++;
      }
    }
  } while (cursor);

  await recordPiiAccess(event, {
    resource: "abandoned-cart",
    action: "stats",
    detail: `Listed ${total} cart(s) (pending=${pending}, converted=${converted})`,
  });

  return json(200, {
    total,
    pending,
    nudge1Sent,
    nudge2Sent,
    converted,
    unsubscribed,
  });
};

// ── router ──────────────────────────────────────────────────────────────
const handle = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;

  if (!env.ABANDONED_CARTS) {
    return json(503, { error: "ABANDONED_CARTS KV binding not configured" });
  }

  const store = makeStore(env.ABANDONED_CARTS);
  const url = new URL(request.url);
  const segments = url.pathname
    .replace(/^\/api\/abandoned-cart\/?/, "")
    .split("/")
    .filter(Boolean);
  const route = segments[0] || "";
  const method = request.method;

  if (method === "POST" && route === "sync") {
    let event;
    try {
      event = await buildLambdaEvent(request);
    } catch (err) {
      if (err instanceof BodyTooLargeError) {
        return json(413, { error: "Request body too large" });
      }
      throw err;
    }
    return handleSync(event, env, store);
  }

  if (method === "POST" && route === "process") {
    const auth = request.headers.get("Authorization") || "";
    const bearer = auth.replace(/^Bearer\s+/i, "").trim();
    if (!bearer || !constantTimeEqual(bearer, env.BACKUP_TOKEN || "")) {
      return json(401, { error: "Unauthorized" });
    }
    return handleProcess(env, store);
  }

  if (method === "GET" && route === "unsubscribe") {
    return handleUnsubscribe(url, store);
  }

  if (method === "GET" && route === "stats") {
    const event = await buildLambdaEvent(request);
    if (!(await isAuthenticated(event))) {
      return json(401, { error: "Not authenticated" });
    }
    return handleStats(event, store);
  }

  return json(404, { error: "Not found" });
};

export const onRequest = handle;
