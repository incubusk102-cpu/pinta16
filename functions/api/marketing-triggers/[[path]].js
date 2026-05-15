// /api/marketing-triggers/* — automated marketing email triggers.
//
// Routes:
//   POST /api/marketing-triggers/process    Bearer-token protected (BACKUP_TOKEN).
//                                           Called by the scheduled GitHub Action.
//                                           Runs all enabled trigger pipelines:
//                                           review follow-up, winback, back-in-stock,
//                                           price-drop alerts.
//
//   POST /api/marketing-triggers/notify-me  Public. Body: { email, productId }.
//                                           Registers interest in a product for
//                                           back-in-stock notifications.
//
//   GET  /api/marketing-triggers/stats      Admin-auth. Returns pipeline metrics.
//
//   GET  /api/marketing-triggers/unsubscribe  Public. Query: ?e=<email>&t=<token>.
//                                             Marks the customer as opted-out of
//                                             marketing emails.

import { initRequestContext } from "../_lib/handler-wrapper.js";
import { getCloudflareEnv } from "../_lib/context.js";
import { consumeRateLimit, rateLimitResponse } from "../_lib/rate-limit.js";
import { BodyTooLargeError, buildLambdaEvent } from "../_lib/lambda-event.js";
import {
  sendEmail,
  loadOrderEmailConfig,
  isEmailConfigured,
} from "../_lib/email.js";
import { isAuthenticated } from "../_lib/admin-auth.js";
import { connectLambda, getStore } from "../_lib/kv-stores.js";
import { makeStore } from "../_lib/kv-store.js";
import {
  isBirthdayToday,
  ensurePersonalReward,
} from "../_lib/personal-rewards.js";
import {
  buildUnsubToken as buildUnsubTokenHmac,
  constantTimeEqual as constantTimeEqualHmac,
} from "../_lib/unsub-token.js";

const MS_PER_DAY = 86_400_000;

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

const parseBody = (body) => {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
};

const constantTimeEqual = constantTimeEqualHmac;

// HMAC-SHA-256 over `mktg:<email>` keyed by a server-side secret that
// auto-bootstraps into the CUSTOMER_META KV namespace on first use.
// The previous implementation hashed `mktg:<email>` with plain SHA-256
// without any secret, which meant anyone who knew a customer's email
// could compute the token and silently opt them out. See
// `_lib/unsub-token.js` for the secret-bootstrap details.
const buildUnsubToken = (email) => buildUnsubTokenHmac("mktg", email);

const PUBLIC_SITE = "https://canvhub.com";

// ── config ──────────────────────────────────────────────────────────────
const DEFAULT_TRIGGERS = {
  reviewFollowUp: {
    enabled: true,
    delayDays: 3,
    subject: "How are you enjoying your painting?",
    heading: "We\u2019d love your feedback",
  },
  winback: {
    enabled: true,
    delayDays: 60,
    subject: "We miss you at Canvas Hub",
    heading: "It\u2019s been a while",
  },
  backInStock: {
    enabled: true,
    subject: "Good news \u2014 {{title}} is back!",
    heading: "Back in stock",
  },
  priceDrop: {
    enabled: true,
    subject: "Price drop: {{title}} is now {{price}}",
    heading: "New sale alert",
  },
  birthday: {
    enabled: true,
    subject: "Happy birthday \u2014 a gift from Canvas Hub",
    heading: "Happy birthday!",
  },
  browseAbandonment: {
    enabled: true,
    delayDays: 3,
    subject: "Still thinking it over?",
    heading: "The piece you saved",
  },
  postPurchaseUpsell: {
    enabled: true,
    delayDays: 14,
    subject: "You might also love these",
    heading: "Curated for your collection",
  },
};

const loadTriggersConfig = async () => {
  try {
    const store = getStore("storefront-config");
    const raw = await store.get("config", { type: "json" });
    if (!raw || typeof raw !== "object") return DEFAULT_TRIGGERS;
    const mt = raw.marketingTriggers;
    if (!mt || typeof mt !== "object") return DEFAULT_TRIGGERS;
    return {
      reviewFollowUp: {
        ...DEFAULT_TRIGGERS.reviewFollowUp,
        ...(mt.reviewFollowUp || {}),
      },
      winback: { ...DEFAULT_TRIGGERS.winback, ...(mt.winback || {}) },
      backInStock: {
        ...DEFAULT_TRIGGERS.backInStock,
        ...(mt.backInStock || {}),
      },
      priceDrop: { ...DEFAULT_TRIGGERS.priceDrop, ...(mt.priceDrop || {}) },
      birthday: { ...DEFAULT_TRIGGERS.birthday, ...(mt.birthday || {}) },
      browseAbandonment: {
        ...DEFAULT_TRIGGERS.browseAbandonment,
        ...(mt.browseAbandonment || {}),
      },
      postPurchaseUpsell: {
        ...DEFAULT_TRIGGERS.postPurchaseUpsell,
        ...(mt.postPurchaseUpsell || {}),
      },
    };
  } catch {
    return DEFAULT_TRIGGERS;
  }
};

// ── marketing opt-out ledger ────────────────────────────────────────────
// Stores a simple JSON object { email: isoTimestamp } in CUSTOMER_META
// under the key "marketing-optouts".
const OPTOUT_KEY = "marketing-optouts";

const readOptouts = async (metaStore) => {
  try {
    const v = await metaStore.get(OPTOUT_KEY, { type: "json" });
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
};

const isOptedOut = (optouts, email) => Boolean(optouts[normalizeEmail(email)]);

// ── notify-me ledger ────────────────────────────────────────────────────
// Stores { productId: [{ email, registeredAt }] } in CUSTOMER_META
// under the key "notify-me".
const NOTIFY_ME_KEY = "notify-me";

const readNotifyMe = async (metaStore) => {
  try {
    const v = await metaStore.get(NOTIFY_ME_KEY, { type: "json" });
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
};

// ── sent-log (dedup) ────────────────────────────────────────────────────
// Tracks which (email, trigger, key) combos we've already sent so we
// never spam the same person twice for the same event. Stored in
// CUSTOMER_META under "marketing-sent".
const SENT_KEY = "marketing-sent";

const readSent = async (metaStore) => {
  try {
    const v = await metaStore.get(SENT_KEY, { type: "json" });
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
};

const markSent = (sent, email, trigger, key) => {
  const id = `${normalizeEmail(email)}:${trigger}:${key}`;
  sent[id] = new Date().toISOString();
};

const wasSent = (sent, email, trigger, key) => {
  const id = `${normalizeEmail(email)}:${trigger}:${key}`;
  return Boolean(sent[id]);
};

// Prune sent entries older than 90 days to keep the ledger small.
const pruneSent = (sent) => {
  const cutoff = Date.now() - 90 * MS_PER_DAY;
  for (const [k, v] of Object.entries(sent)) {
    if (new Date(v).getTime() < cutoff) delete sent[k];
  }
};

// ── email rendering ─────────────────────────────────────────────────────
const buildMarketingEmail = (heading, bodyHtml, unsubUrl, chrome) => {
  const accent = (chrome && chrome.accentColor) || "#7a7468";
  const fromName = escapeHtml((chrome && chrome.fromName) || "Canvas Hub");
  const footerTagline = String(
    (chrome && chrome.footerTagline) || "original Filipino paintings",
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
        <br /><a href="${escapeHtml(unsubUrl)}" style="color:${accent};font-size:10px;">Unsubscribe from marketing emails</a>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
};

// ── 1. Review follow-up ─────────────────────────────────────────────────
const processReviewFollowUp = async (cfg, chrome, optouts, sent) => {
  if (cfg.enabled === false) return { skipped: true };
  const delayMs = (cfg.delayDays || 3) * MS_PER_DAY;
  const now = Date.now();
  let emailsSent = 0;
  let scanned = 0;

  const ordersStore = getStore("orders");
  const orders = await ordersStore.get("all-orders", { type: "json" });
  if (!Array.isArray(orders)) return { scanned: 0, emailsSent: 0 };

  for (const o of orders) {
    if (o.status !== "received") continue;
    const email = o.orderInfo?.email;
    if (!email || !isValidEmail(email)) continue;
    if (isOptedOut(optouts, email)) continue;

    const hasReview =
      (Array.isArray(o.reviews) && o.reviews.length > 0) || o.review;
    if (hasReview) continue;

    // Find when order was marked as received
    const receivedAt = findReceivedTimestamp(o);
    if (!receivedAt) continue;
    const age = now - receivedAt;
    if (age < delayMs) continue;

    const dedupKey = o.id;
    if (wasSent(sent, email, "reviewFollowUp", dedupKey)) continue;

    scanned++;
    const firstName = (o.orderInfo.fullName || "").split(/\s+/)[0] || "there";
    const subject = cfg.subject || DEFAULT_TRIGGERS.reviewFollowUp.subject;
    const heading = cfg.heading || DEFAULT_TRIGGERS.reviewFollowUp.heading;

    const unsubToken = await buildUnsubToken(email);
    const unsubUrl = `${PUBLIC_SITE}/api/marketing-triggers/unsubscribe?e=${encodeURIComponent(email)}&t=${unsubToken}`;
    const reviewUrl = `${PUBLIC_SITE}/account?track=${encodeURIComponent(o.id)}`;

    const bodyHtml = `
      <p style="margin:0 0 12px;">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 12px;">We hope you\u2019re loving your new painting! Your feedback helps fellow art lovers find their perfect piece \u2014 would you take a moment to leave a quick review?</p>
      <p style="margin:16px 0;">
        <a href="${escapeHtml(reviewUrl)}" style="display:inline-block;padding:10px 28px;background:#1c1c1c;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:500;">Write a review</a>
      </p>
      <p style="margin:12px 0 0;font-size:12px;color:#7a7468;">
        Questions about your order? Just reply to this email.
      </p>
    `;

    const html = buildMarketingEmail(heading, bodyHtml, unsubUrl, chrome);
    const text = `Hi ${firstName},\n\nWe hope you're loving your new painting! Would you take a moment to leave a quick review?\n\nWrite a review: ${reviewUrl}\n\nUnsubscribe: ${unsubUrl}`;
    const fromEmail = (chrome?.fromEmail || "order@canvhub.com").trim();
    const fromName = (chrome?.fromName || "Canvas Hub").trim();
    const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

    const result = await sendEmail({ to: email, subject, html, text, from });
    if (result.delivered) {
      markSent(sent, email, "reviewFollowUp", dedupKey);
      emailsSent++;
    }
  }

  return { scanned, emailsSent };
};

const findReceivedTimestamp = (order) => {
  // Check notifications for the "received" type
  if (Array.isArray(order.notifications)) {
    for (const n of order.notifications) {
      if (n.type === "received" && n.sentAt) {
        const ts = new Date(n.sentAt).getTime();
        if (Number.isFinite(ts)) return ts;
      }
    }
  }
  // Check activity log
  if (Array.isArray(order.activityLog)) {
    for (const a of order.activityLog) {
      if (a.type === "status_change" && a.to === "received" && a.at) {
        const ts = new Date(a.at).getTime();
        if (Number.isFinite(ts)) return ts;
      }
    }
  }
  // Fall back to updatedAt
  if (order.updatedAt) {
    const ts = new Date(order.updatedAt).getTime();
    if (Number.isFinite(ts)) return ts;
  }
  return null;
};

// ── 2. Winback ──────────────────────────────────────────────────────────
const processWinback = async (cfg, chrome, optouts, sent) => {
  if (cfg.enabled === false) return { skipped: true };
  const delayMs = (cfg.delayDays || 60) * MS_PER_DAY;
  const now = Date.now();
  let emailsSent = 0;
  let scanned = 0;

  const ordersStore = getStore("orders");
  const orders = await ordersStore.get("all-orders", { type: "json" });
  if (!Array.isArray(orders)) return { scanned: 0, emailsSent: 0 };

  // Group by customer email — find last order date
  const customers = new Map();
  for (const o of orders) {
    const email = normalizeEmail(o.orderInfo?.email);
    if (!email) continue;
    const ts = o.createdAt ? new Date(o.createdAt).getTime() : 0;
    if (!Number.isFinite(ts) || ts === 0) continue;
    const existing = customers.get(email);
    if (!existing || ts > existing.lastOrderAt) {
      customers.set(email, {
        email,
        name: o.orderInfo?.fullName || "",
        lastOrderAt: ts,
      });
    }
  }

  for (const [email, customer] of customers) {
    if (isOptedOut(optouts, email)) continue;
    const daysSince = now - customer.lastOrderAt;
    if (daysSince < delayMs) continue;

    // Only send once per 90-day window
    const periodKey = `${Math.floor(customer.lastOrderAt / (90 * MS_PER_DAY))}`;
    if (wasSent(sent, email, "winback", periodKey)) continue;

    scanned++;
    const firstName = (customer.name || "").split(/\s+/)[0] || "there";
    const subject = cfg.subject || DEFAULT_TRIGGERS.winback.subject;
    const heading = cfg.heading || DEFAULT_TRIGGERS.winback.heading;

    const unsubToken = await buildUnsubToken(email);
    const unsubUrl = `${PUBLIC_SITE}/api/marketing-triggers/unsubscribe?e=${encodeURIComponent(email)}&t=${unsubToken}`;

    const bodyHtml = `
      <p style="margin:0 0 12px;">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 12px;">It\u2019s been a while since your last visit \u2014 we\u2019ve been adding new original paintings and we think you\u2019ll love what\u2019s new.</p>
      <p style="margin:0 0 16px;">Come take a look and see what catches your eye.</p>
      <p style="margin:16px 0;">
        <a href="${PUBLIC_SITE}" style="display:inline-block;padding:10px 28px;background:#1c1c1c;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:500;">Browse new arrivals</a>
      </p>
    `;

    const html = buildMarketingEmail(heading, bodyHtml, unsubUrl, chrome);
    const text = `Hi ${firstName},\n\nIt's been a while since your last visit. We've been adding new original paintings and we think you'll love what's new.\n\nBrowse new arrivals: ${PUBLIC_SITE}\n\nUnsubscribe: ${unsubUrl}`;
    const fromEmail = (chrome?.fromEmail || "order@canvhub.com").trim();
    const fromName = (chrome?.fromName || "Canvas Hub").trim();
    const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

    const result = await sendEmail({ to: email, subject, html, text, from });
    if (result.delivered) {
      markSent(sent, email, "winback", periodKey);
      emailsSent++;
    }
  }

  return { scanned, emailsSent };
};

// ── 3. Back-in-stock ────────────────────────────────────────────────────
const processBackInStock = async (cfg, chrome, optouts, sent, metaStore) => {
  if (cfg.enabled === false) return { skipped: true };
  let emailsSent = 0;
  let scanned = 0;

  const notifyMe = await readNotifyMe(metaStore);
  if (!Object.keys(notifyMe).length) return { scanned: 0, emailsSent: 0 };

  const productsStore = getStore("products");
  const products = await productsStore.get("all-products", { type: "json" });
  if (!Array.isArray(products)) return { scanned: 0, emailsSent: 0 };

  const productMap = new Map();
  for (const p of products) {
    if (p && p.id) productMap.set(p.id, p);
  }

  let notifyMeChanged = false;

  for (const [productId, entries] of Object.entries(notifyMe)) {
    if (!Array.isArray(entries) || !entries.length) continue;
    const product = productMap.get(productId);
    if (!product) continue;
    if (product.availability !== "available") continue;

    // Product is now available — notify everyone on the list
    for (const entry of entries) {
      const email = normalizeEmail(entry.email);
      if (!email || !isValidEmail(email)) continue;
      if (isOptedOut(optouts, email)) continue;
      if (wasSent(sent, email, "backInStock", productId)) continue;

      scanned++;
      const title = product.title || "your item";
      const subject = (
        cfg.subject || DEFAULT_TRIGGERS.backInStock.subject
      ).replace(/\{\{title\}\}/g, title);
      const heading = cfg.heading || DEFAULT_TRIGGERS.backInStock.heading;

      const unsubToken = await buildUnsubToken(email);
      const unsubUrl = `${PUBLIC_SITE}/api/marketing-triggers/unsubscribe?e=${encodeURIComponent(email)}&t=${unsubToken}`;
      const productUrl = `${PUBLIC_SITE}/gallery/${encodeURIComponent(productId)}`;

      const rawImg =
        (product.images && product.images[0]?.url) || product.image || "";
      const imgSrc = rawImg.startsWith("/")
        ? `${PUBLIC_SITE}${rawImg}`
        : rawImg;
      const imageHtml =
        imgSrc && /^https?:\/\//i.test(imgSrc)
          ? `<p style="margin:0 0 16px;text-align:center;"><img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(title)}" style="max-width:280px;border-radius:4px;" /></p>`
          : "";

      const bodyHtml = `
        <p style="margin:0 0 12px;">Great news \u2014 <strong>${escapeHtml(title)}</strong> is back in stock!</p>
        ${imageHtml}
        <p style="margin:0 0 12px;">You asked us to let you know when it became available. Original artwork is one-of-a-kind, so act fast.</p>
        <p style="margin:16px 0;">
          <a href="${escapeHtml(productUrl)}" style="display:inline-block;padding:10px 28px;background:#1c1c1c;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:500;">View painting</a>
        </p>
      `;

      const html = buildMarketingEmail(heading, bodyHtml, unsubUrl, chrome);
      const text = `Great news — ${title} is back in stock!\n\nView it here: ${productUrl}\n\nUnsubscribe: ${unsubUrl}`;
      const fromEmail = (chrome?.fromEmail || "order@canvhub.com").trim();
      const fromName = (chrome?.fromName || "Canvas Hub").trim();
      const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

      const result = await sendEmail({ to: email, subject, html, text, from });
      if (result.delivered) {
        markSent(sent, email, "backInStock", productId);
        emailsSent++;
      }
    }

    // Clear the notify-me list for this product since it's available now
    delete notifyMe[productId];
    notifyMeChanged = true;
  }

  if (notifyMeChanged) {
    await metaStore.setJSON(NOTIFY_ME_KEY, notifyMe);
  }

  return { scanned, emailsSent };
};

// ── 4. Price-drop alert ─────────────────────────────────────────────────
const PRICE_SNAPSHOT_KEY = "price-snapshot";

const processPriceDrop = async (cfg, chrome, optouts, sent, metaStore) => {
  if (cfg.enabled === false) return { skipped: true };
  let emailsSent = 0;
  let scanned = 0;

  const productsStore = getStore("products");
  const products = await productsStore.get("all-products", { type: "json" });
  if (!Array.isArray(products)) return { scanned: 0, emailsSent: 0 };

  // Load previous price snapshot
  let prevSnapshot;
  try {
    prevSnapshot = await metaStore.get(PRICE_SNAPSHOT_KEY, { type: "json" });
  } catch {
    prevSnapshot = null;
  }
  if (!prevSnapshot || typeof prevSnapshot !== "object") prevSnapshot = {};

  // Build new snapshot and detect drops
  const newSnapshot = {};
  const drops = [];
  for (const p of products) {
    if (!p || !p.id) continue;
    if (p.availability !== "available") continue;
    const currentPrice =
      p.salePrice && Number(p.salePrice) > 0
        ? Number(p.salePrice)
        : Number(p.price) || 0;
    newSnapshot[p.id] = currentPrice;

    const prevPrice = prevSnapshot[p.id];
    if (
      typeof prevPrice === "number" &&
      prevPrice > 0 &&
      currentPrice > 0 &&
      currentPrice < prevPrice
    ) {
      drops.push({
        id: p.id,
        title: p.title || "Untitled",
        price: currentPrice,
        prevPrice,
        image: (p.images && p.images[0]?.url) || p.image || "",
      });
    }
  }

  // Save new snapshot for next run
  await metaStore.setJSON(PRICE_SNAPSHOT_KEY, newSnapshot);

  if (!drops.length) return { scanned: 0, emailsSent: 0 };

  // Email newsletter subscribers about price drops
  const newsletterStore = getStore("newsletter");
  let subscribers;
  try {
    subscribers = await newsletterStore.get("subscribers", { type: "json" });
  } catch {
    subscribers = null;
  }
  if (!Array.isArray(subscribers) || !subscribers.length) {
    return { scanned: 0, emailsSent: 0 };
  }

  for (const sub of subscribers) {
    const email = normalizeEmail(sub.email);
    if (!email || !isValidEmail(email)) continue;
    if (isOptedOut(optouts, email)) continue;
    if (sub.unsubscribedAt) continue;

    // Send one email per subscriber per cron run (batch all drops)
    const dedupKey = drops
      .map((d) => d.id)
      .sort()
      .join(",");
    if (wasSent(sent, email, "priceDrop", dedupKey)) continue;

    scanned++;
    const firstName = (sub.name || "").split(/\s+/)[0] || "there";

    const singleDrop = drops.length === 1;
    const subject = singleDrop
      ? (cfg.subject || DEFAULT_TRIGGERS.priceDrop.subject)
          .replace(/\{\{title\}\}/g, drops[0].title)
          .replace(/\{\{price\}\}/g, formatPHP(drops[0].price))
      : `${drops.length} paintings just went on sale`;

    const heading = cfg.heading || DEFAULT_TRIGGERS.priceDrop.heading;

    const unsubToken = await buildUnsubToken(email);
    const unsubUrl = `${PUBLIC_SITE}/api/marketing-triggers/unsubscribe?e=${encodeURIComponent(email)}&t=${unsubToken}`;

    const dropsHtml = drops
      .slice(0, 6)
      .map((d) => {
        const productUrl = `${PUBLIC_SITE}/gallery/${encodeURIComponent(d.id)}`;
        return `
          <tr>
            <td style="padding:8px 0;font-size:13px;color:#1c1c1c;">
              <a href="${escapeHtml(productUrl)}" style="color:#1c1c1c;text-decoration:underline;">${escapeHtml(d.title)}</a>
            </td>
            <td style="padding:8px 0;font-size:13px;text-align:right;color:#7a7468;text-decoration:line-through;">
              ${formatPHP(d.prevPrice)}
            </td>
            <td style="padding:8px 0;font-size:13px;text-align:right;color:#1c1c1c;font-weight:600;">
              ${formatPHP(d.price)}
            </td>
          </tr>`;
      })
      .join("");

    const bodyHtml = `
      <p style="margin:0 0 12px;">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 16px;">Great news \u2014 ${singleDrop ? "a painting you might love just" : `${drops.length} paintings just`} dropped in price:</p>
      <table role="presentation" width="100%" style="border-top:1px solid #efece4;border-bottom:1px solid #efece4;margin:0 0 16px;">
        ${dropsHtml}
      </table>
      <p style="margin:16px 0;">
        <a href="${PUBLIC_SITE}" style="display:inline-block;padding:10px 28px;background:#1c1c1c;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:500;">Shop the sale</a>
      </p>
    `;

    const html = buildMarketingEmail(heading, bodyHtml, unsubUrl, chrome);
    const text = `Hi ${firstName},\n\n${singleDrop ? `${drops[0].title} just dropped to ${formatPHP(drops[0].price)}!` : `${drops.length} paintings just went on sale.`}\n\nShop the sale: ${PUBLIC_SITE}\n\nUnsubscribe: ${unsubUrl}`;
    const fromEmail = (chrome?.fromEmail || "order@canvhub.com").trim();
    const fromName = (chrome?.fromName || "Canvas Hub").trim();
    const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

    const result = await sendEmail({ to: email, subject, html, text, from });
    if (result.delivered) {
      markSent(sent, email, "priceDrop", dedupKey);
      emailsSent++;
    }
  }

  return { scanned, emailsSent, drops: drops.length };
};

// ── 5. Birthday ─────────────────────────────────────────────────────────
// Iterates the USERS namespace, finds users whose stored `birthday`
// (MM-DD or YYYY-MM-DD) matches today's UTC date, mints (or reuses) a
// BDAY-XXX promo code for them via `ensurePersonalReward`, and sends an
// email containing the code. Dedup key is the current UTC year, so we
// can only send once per customer per calendar year.
const processBirthday = async (cfg, chrome, optouts, sent) => {
  if (cfg.enabled === false) return { skipped: true };
  const env = getCloudflareEnv();
  if (!env?.USERS) return { scanned: 0, emailsSent: 0 };
  const usersStore = makeStore(env.USERS);
  const usersBlob = await usersStore.get("users-by-email", { type: "json" });
  if (!usersBlob || typeof usersBlob !== "object") {
    return { scanned: 0, emailsSent: 0 };
  }

  let emailsSent = 0;
  let scanned = 0;
  const periodKey = String(new Date().getUTCFullYear());

  for (const user of Object.values(usersBlob)) {
    if (!user || typeof user !== "object") continue;
    const email = normalizeEmail(user.email);
    if (!email || !isValidEmail(email)) continue;
    if (isOptedOut(optouts, email)) continue;
    // user.birthday is "MM-DD" (anonymised) or "YYYY-MM-DD" (raw input).
    // isBirthdayToday accepts MM-DD; pull the last 5 chars for the
    // YYYY-MM-DD form so both shapes work.
    const bd = String(user.birthday || "");
    const mmdd = bd.length === 10 ? bd.slice(5) : bd;
    if (!isBirthdayToday(mmdd)) continue;
    if (wasSent(sent, email, "birthday", periodKey)) continue;

    scanned++;
    const firstName =
      (user.name || user.fullName || "").split(/\s+/)[0] || "there";
    const subject = cfg.subject || DEFAULT_TRIGGERS.birthday.subject;
    const heading = cfg.heading || DEFAULT_TRIGGERS.birthday.heading;

    // Mint (or reuse) the per-user BDAY-XXX code. Idempotent — same
    // (user, year) tuple always resolves to the same code.
    let reward = null;
    try {
      reward = await ensurePersonalReward({
        user,
        kind: "birthday",
        periodKey,
      });
    } catch {
      reward = null;
    }
    const code = reward?.code;
    const promo = reward?.promo;
    const codeValue = Number(promo?.value) || 500;

    const unsubToken = await buildUnsubToken(email);
    const unsubUrl = `${PUBLIC_SITE}/api/marketing-triggers/unsubscribe?e=${encodeURIComponent(email)}&t=${unsubToken}`;

    const codeBlock = code
      ? `
        <p style="margin:0 0 12px;">Use code <strong style="font-family:'EB Garamond',Georgia,serif;letter-spacing:0.04em;">${escapeHtml(code)}</strong> for ${formatPHP(codeValue)} off your next order — valid for 30 days.</p>
        <p style="margin:16px 0;">
          <a href="${PUBLIC_SITE}" style="display:inline-block;padding:10px 28px;background:#1c1c1c;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:500;">Claim your gift</a>
        </p>`
      : `
        <p style="margin:0 0 12px;">Treat yourself to a piece you'll love — fresh originals are always landing in the gallery.</p>
        <p style="margin:16px 0;">
          <a href="${PUBLIC_SITE}" style="display:inline-block;padding:10px 28px;background:#1c1c1c;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:500;">Browse the gallery</a>
        </p>`;

    const bodyHtml = `
      <p style="margin:0 0 12px;">Happy birthday, ${escapeHtml(firstName)} \u{1F389}</p>
      ${codeBlock}
    `;

    const html = buildMarketingEmail(heading, bodyHtml, unsubUrl, chrome);
    const text = code
      ? `Happy birthday, ${firstName}!\n\nUse code ${code} for ${formatPHP(codeValue)} off your next order — valid for 30 days.\n\nShop: ${PUBLIC_SITE}\n\nUnsubscribe: ${unsubUrl}`
      : `Happy birthday, ${firstName}!\n\nBrowse new arrivals: ${PUBLIC_SITE}\n\nUnsubscribe: ${unsubUrl}`;
    const fromEmail = (chrome?.fromEmail || "order@canvhub.com").trim();
    const fromName = (chrome?.fromName || "Canvas Hub").trim();
    const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

    const result = await sendEmail({ to: email, subject, html, text, from });
    if (result.delivered) {
      markSent(sent, email, "birthday", periodKey);
      emailsSent++;
    }
  }

  return { scanned, emailsSent };
};

// ── 6. Browse abandonment ───────────────────────────────────────────────
// Reaches out to signed-in customers who saved a painting to their
// wishlist N days ago but never ordered it. Source of truth is the
// WISHLISTS KV namespace (one entry per signed-in user); we cross-
// reference with the orders ledger so we don't nag someone who already
// bought what they wishlisted. Dedup key is the productId, so each
// (customer, painting) pair is emailed at most once.
const processBrowseAbandonment = async (cfg, chrome, optouts, sent) => {
  if (cfg.enabled === false) return { skipped: true };
  const env = getCloudflareEnv();
  if (!env?.WISHLISTS || !env?.USERS) {
    return { scanned: 0, emailsSent: 0 };
  }
  const wishlistsStore = makeStore(env.WISHLISTS);
  const usersStore = makeStore(env.USERS);
  const productsStore = getStore("products");

  const delayMs = (cfg.delayDays || 3) * MS_PER_DAY;
  const now = Date.now();
  let emailsSent = 0;
  let scanned = 0;

  // Build userId → user map from the USERS blob so we can resolve the
  // user/<userId> wishlist key back to an email.
  const usersBlob = await usersStore.get("users-by-email", { type: "json" });
  if (!usersBlob || typeof usersBlob !== "object") {
    return { scanned: 0, emailsSent: 0 };
  }
  const userById = new Map();
  for (const u of Object.values(usersBlob)) {
    if (u && typeof u === "object" && u.id) userById.set(u.id, u);
  }
  if (userById.size === 0) return { scanned: 0, emailsSent: 0 };

  // Pull the customer's full purchase history once so we can skip
  // wishlist entries that have already converted.
  const ordersStore = getStore("orders");
  const orders = await ordersStore.get("all-orders", { type: "json" });
  const purchasedByEmail = new Map();
  if (Array.isArray(orders)) {
    for (const o of orders) {
      const email = normalizeEmail(o.orderInfo?.email);
      if (!email) continue;
      if (!Array.isArray(o.items)) continue;
      let set = purchasedByEmail.get(email);
      if (!set) {
        set = new Set();
        purchasedByEmail.set(email, set);
      }
      for (const it of o.items) {
        if (it && typeof it.id === "string") set.add(it.id);
      }
    }
  }

  // Resolve product titles / images lazily.
  const products = await productsStore.get("all-products", { type: "json" });
  const productMap = new Map();
  if (Array.isArray(products)) {
    for (const p of products) {
      if (p && p.id) productMap.set(p.id, p);
    }
  }

  // Enumerate wishlist keys (up to 1000 per cron run is plenty for now —
  // KV.list() returns at most 1000 keys without paging).
  const listing = await wishlistsStore.list({ prefix: "user/" });
  for (const blob of listing.blobs || []) {
    const userId = blob.key.replace(/^user\//, "");
    const user = userById.get(userId);
    if (!user) continue;
    const email = normalizeEmail(user.email);
    if (!email || !isValidEmail(email)) continue;
    if (isOptedOut(optouts, email)) continue;

    const doc = await wishlistsStore.get(blob.key, { type: "json" });
    const items = Array.isArray(doc?.items) ? doc.items : [];
    if (!items.length) continue;
    const purchased = purchasedByEmail.get(email) || new Set();

    // Pick the oldest wishlist entry that's at least delayMs old, that
    // the customer hasn't already purchased, and that we haven't
    // already nudged them about.
    const sorted = [...items].sort((a, b) => {
      const at = a.addedAt ? new Date(a.addedAt).getTime() : 0;
      const bt = b.addedAt ? new Date(b.addedAt).getTime() : 0;
      return at - bt;
    });
    let target = null;
    for (const it of sorted) {
      if (!it || typeof it.id !== "string") continue;
      if (purchased.has(it.id)) continue;
      const addedAt = it.addedAt ? new Date(it.addedAt).getTime() : 0;
      if (!Number.isFinite(addedAt) || addedAt === 0) continue;
      if (now - addedAt < delayMs) continue;
      if (wasSent(sent, email, "browseAbandonment", it.id)) continue;
      target = it;
      break;
    }
    if (!target) continue;

    scanned++;
    const product = productMap.get(target.id);
    const title =
      (product && product.title) || target.title || "the piece you saved";
    const subject = cfg.subject || DEFAULT_TRIGGERS.browseAbandonment.subject;
    const heading = cfg.heading || DEFAULT_TRIGGERS.browseAbandonment.heading;
    const firstName =
      (user.name || user.fullName || "").split(/\s+/)[0] || "there";

    const unsubToken = await buildUnsubToken(email);
    const unsubUrl = `${PUBLIC_SITE}/api/marketing-triggers/unsubscribe?e=${encodeURIComponent(email)}&t=${unsubToken}`;
    const productUrl = `${PUBLIC_SITE}/gallery/${encodeURIComponent(target.id)}`;

    const rawImg =
      (product && product.images && product.images[0]?.url) ||
      (product && product.image) ||
      target.image ||
      "";
    const imgSrc = rawImg.startsWith("/") ? `${PUBLIC_SITE}${rawImg}` : rawImg;
    const imageHtml =
      imgSrc && /^https?:\/\//i.test(imgSrc)
        ? `<p style="margin:0 0 16px;text-align:center;"><img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(title)}" style="max-width:280px;border-radius:4px;" /></p>`
        : "";

    const bodyHtml = `
      <p style="margin:0 0 12px;">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 12px;">You saved <strong>${escapeHtml(title)}</strong> a few days back and it\u2019s still waiting for you. Original artwork is one-of-a-kind \u2014 if it speaks to you, it might not be here next week.</p>
      ${imageHtml}
      <p style="margin:16px 0;">
        <a href="${escapeHtml(productUrl)}" style="display:inline-block;padding:10px 28px;background:#1c1c1c;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:500;">View painting</a>
      </p>
    `;

    const html = buildMarketingEmail(heading, bodyHtml, unsubUrl, chrome);
    const text = `Hi ${firstName},\n\nYou saved "${title}" a few days back and it's still waiting for you.\n\nView it here: ${productUrl}\n\nUnsubscribe: ${unsubUrl}`;
    const fromEmail = (chrome?.fromEmail || "order@canvhub.com").trim();
    const fromName = (chrome?.fromName || "Canvas Hub").trim();
    const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

    const result = await sendEmail({ to: email, subject, html, text, from });
    if (result.delivered) {
      markSent(sent, email, "browseAbandonment", target.id);
      emailsSent++;
    }
  }

  return { scanned, emailsSent };
};

// ── 7. Post-purchase upsell ─────────────────────────────────────────────
// Email customers N days after their order is marked "received" with
// three curated paintings — same category as their purchase when we
// have one, otherwise newest available. Dedup key is the order id so
// each order triggers at most one upsell email.
const processPostPurchaseUpsell = async (cfg, chrome, optouts, sent) => {
  if (cfg.enabled === false) return { skipped: true };
  const delayMs = (cfg.delayDays || 14) * MS_PER_DAY;
  const now = Date.now();
  let emailsSent = 0;
  let scanned = 0;

  const ordersStore = getStore("orders");
  const orders = await ordersStore.get("all-orders", { type: "json" });
  if (!Array.isArray(orders)) return { scanned: 0, emailsSent: 0 };

  const productsStore = getStore("products");
  const products = await productsStore.get("all-products", { type: "json" });
  if (!Array.isArray(products) || products.length === 0) {
    return { scanned: 0, emailsSent: 0 };
  }
  const availableProducts = products.filter(
    (p) => p && p.id && p.availability === "available",
  );
  if (availableProducts.length === 0) return { scanned: 0, emailsSent: 0 };

  for (const o of orders) {
    if (o.status !== "received") continue;
    const email = o.orderInfo?.email;
    if (!email || !isValidEmail(email)) continue;
    if (isOptedOut(optouts, email)) continue;
    if (wasSent(sent, email, "postPurchaseUpsell", o.id)) continue;

    const receivedAt = findReceivedTimestamp(o);
    if (!receivedAt) continue;
    if (now - receivedAt < delayMs) continue;

    // Find the category to target. Use the category of any item from
    // this order whose product still exists.
    const orderProductIds = new Set();
    let targetCategory = "";
    if (Array.isArray(o.items)) {
      for (const it of o.items) {
        if (!it || typeof it.id !== "string") continue;
        orderProductIds.add(it.id);
        if (!targetCategory) {
          const match = products.find((p) => p && p.id === it.id);
          if (match && match.category) targetCategory = match.category;
        }
      }
    }

    // Pick 3 candidates: same category preferred, skip anything the
    // customer already owns.
    const candidates = availableProducts.filter(
      (p) => !orderProductIds.has(p.id),
    );
    const sameCat = targetCategory
      ? candidates.filter((p) => p.category === targetCategory)
      : [];
    const picks =
      sameCat.length >= 3 ? sameCat.slice(0, 3) : candidates.slice(0, 3);
    if (picks.length === 0) continue;

    scanned++;
    const firstName = (o.orderInfo.fullName || "").split(/\s+/)[0] || "there";
    const subject = cfg.subject || DEFAULT_TRIGGERS.postPurchaseUpsell.subject;
    const heading = cfg.heading || DEFAULT_TRIGGERS.postPurchaseUpsell.heading;

    const unsubToken = await buildUnsubToken(email);
    const unsubUrl = `${PUBLIC_SITE}/api/marketing-triggers/unsubscribe?e=${encodeURIComponent(email)}&t=${unsubToken}`;

    const cardsHtml = picks
      .map((p) => {
        const productUrl = `${PUBLIC_SITE}/gallery/${encodeURIComponent(p.id)}`;
        const rawImg = (p.images && p.images[0]?.url) || p.image || "";
        const imgSrc = rawImg.startsWith("/")
          ? `${PUBLIC_SITE}${rawImg}`
          : rawImg;
        const price =
          p.salePrice && Number(p.salePrice) > 0
            ? Number(p.salePrice)
            : Number(p.price) || 0;
        const imgCell =
          imgSrc && /^https?:\/\//i.test(imgSrc)
            ? `<img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(p.title || "")}" style="width:96px;height:96px;object-fit:cover;border-radius:4px;display:block;" />`
            : "";
        return `
          <tr>
            <td style="padding:8px 12px 8px 0;width:96px;">${imgCell}</td>
            <td style="padding:8px 0;font-size:13px;color:#1c1c1c;vertical-align:top;">
              <a href="${escapeHtml(productUrl)}" style="color:#1c1c1c;text-decoration:underline;">${escapeHtml(p.title || "Untitled")}</a>
              <div style="font-size:12px;color:#7a7468;margin-top:4px;">${formatPHP(price)}</div>
            </td>
          </tr>`;
      })
      .join("");

    const bodyHtml = `
      <p style="margin:0 0 12px;">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 16px;">Hope your new piece is settling in well. Based on what you picked, we thought you might love one of these next:</p>
      <table role="presentation" width="100%" style="border-top:1px solid #efece4;border-bottom:1px solid #efece4;margin:0 0 16px;">
        ${cardsHtml}
      </table>
      <p style="margin:16px 0;">
        <a href="${PUBLIC_SITE}" style="display:inline-block;padding:10px 28px;background:#1c1c1c;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:500;">Browse the gallery</a>
      </p>
    `;

    const html = buildMarketingEmail(heading, bodyHtml, unsubUrl, chrome);
    const text = `Hi ${firstName},\n\nBased on your last order we thought you might love:\n${picks.map((p) => `- ${p.title} (${formatPHP(Number(p.salePrice) > 0 ? p.salePrice : p.price)})`).join("\n")}\n\nShop: ${PUBLIC_SITE}\n\nUnsubscribe: ${unsubUrl}`;
    const fromEmail = (chrome?.fromEmail || "order@canvhub.com").trim();
    const fromName = (chrome?.fromName || "Canvas Hub").trim();
    const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

    const result = await sendEmail({ to: email, subject, html, text, from });
    if (result.delivered) {
      markSent(sent, email, "postPurchaseUpsell", o.id);
      emailsSent++;
    }
  }

  return { scanned, emailsSent };
};

// ── process (cron) ──────────────────────────────────────────────────────
const handleProcess = async (env) => {
  const token = env.BACKUP_TOKEN;
  if (!token) return json(503, { error: "BACKUP_TOKEN not configured" });
  if (!isEmailConfigured()) {
    return json(200, {
      ok: true,
      skipped: true,
      reason: "email not configured",
    });
  }

  const cfg = await loadTriggersConfig();
  const chrome = await loadOrderEmailConfig();
  const metaStore = getStore("customer-meta");
  const optouts = await readOptouts(metaStore);
  const sent = await readSent(metaStore);

  const results = {};

  results.reviewFollowUp = await processReviewFollowUp(
    cfg.reviewFollowUp,
    chrome,
    optouts,
    sent,
  );

  results.winback = await processWinback(cfg.winback, chrome, optouts, sent);

  results.backInStock = await processBackInStock(
    cfg.backInStock,
    chrome,
    optouts,
    sent,
    metaStore,
  );

  results.priceDrop = await processPriceDrop(
    cfg.priceDrop,
    chrome,
    optouts,
    sent,
    metaStore,
  );

  results.birthday = await processBirthday(cfg.birthday, chrome, optouts, sent);

  results.browseAbandonment = await processBrowseAbandonment(
    cfg.browseAbandonment,
    chrome,
    optouts,
    sent,
  );

  results.postPurchaseUpsell = await processPostPurchaseUpsell(
    cfg.postPurchaseUpsell,
    chrome,
    optouts,
    sent,
  );

  // Persist updated sent log
  pruneSent(sent);
  await metaStore.setJSON(SENT_KEY, sent);

  return json(200, { ok: true, results });
};

// ── notify-me (public) ──────────────────────────────────────────────────
const handleNotifyMe = async (event, env) => {
  const limit = await consumeRateLimit(event, {
    bucket: "notify-me",
    windowMs: 60_000,
    max: 5,
  });
  if (!limit.allowed) return rateLimitResponse(limit);

  const data = parseBody(event.body);
  const email = normalizeEmail(data.email);
  if (!email || !isValidEmail(email)) {
    return json(400, { error: "Invalid email" });
  }
  const productId = String(data.productId || "")
    .trim()
    .slice(0, 200);
  if (!productId) return json(400, { error: "Missing productId" });

  const metaStore = getStore("customer-meta");
  const notifyMe = await readNotifyMe(metaStore);

  if (!Array.isArray(notifyMe[productId])) {
    notifyMe[productId] = [];
  }

  // Don't duplicate
  const already = notifyMe[productId].some(
    (e) => normalizeEmail(e.email) === email,
  );
  if (already) return json(200, { ok: true, status: "already_registered" });

  notifyMe[productId].push({
    email,
    registeredAt: new Date().toISOString(),
  });

  // Cap at 500 per product to keep KV doc size reasonable
  if (notifyMe[productId].length > 500) {
    notifyMe[productId] = notifyMe[productId].slice(-500);
  }

  await metaStore.setJSON(NOTIFY_ME_KEY, notifyMe);
  return json(200, { ok: true });
};

// ── unsubscribe ─────────────────────────────────────────────────────────
const handleUnsubscribe = async (url) => {
  const email = normalizeEmail(url.searchParams.get("e") || "");
  const t = url.searchParams.get("t") || "";

  if (!email || !t) {
    return new Response(unsubPage("Missing parameters."), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const expected = await buildUnsubToken(email);
  if (!constantTimeEqual(t, expected)) {
    return new Response(unsubPage("Invalid link."), {
      status: 403,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const metaStore = getStore("customer-meta");
  const optouts = await readOptouts(metaStore);
  optouts[email] = new Date().toISOString();
  await metaStore.setJSON(OPTOUT_KEY, optouts);

  return new Response(
    unsubPage(
      "You\u2019ve been unsubscribed from marketing emails. You\u2019ll still receive order-related updates.",
    ),
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
};

const unsubPage = (message) =>
  `
<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Unsubscribed \u2014 Canvas Hub</title></head>
<body style="margin:0;padding:48px 24px;background:#f5f3ee;font-family:Inter,Helvetica,Arial,sans-serif;color:#1c1c1c;text-align:center;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e5e1d8;border-radius:6px;padding:32px;">
    <div style="font-family:'Playfair Display',Georgia,serif;font-size:22px;margin-bottom:16px;">Canvas Hub</div>
    <p style="font-size:14px;line-height:1.6;color:#1c1c1c;">${message}</p>
    <p style="margin-top:24px;"><a href="https://canvhub.com" style="color:#7a7468;font-size:13px;">Back to Canvas Hub</a></p>
  </div>
</body>
</html>`.trim();

// ── stats (admin) ───────────────────────────────────────────────────────
const handleStats = async () => {
  const metaStore = getStore("customer-meta");
  const sent = await readSent(metaStore);
  const optouts = await readOptouts(metaStore);
  const notifyMe = await readNotifyMe(metaStore);

  // Count sent by trigger type
  const counts = {
    reviewFollowUp: 0,
    winback: 0,
    backInStock: 0,
    priceDrop: 0,
    birthday: 0,
    browseAbandonment: 0,
    postPurchaseUpsell: 0,
  };
  for (const key of Object.keys(sent)) {
    const parts = key.split(":");
    const trigger = parts[1];
    if (trigger && trigger in counts) counts[trigger]++;
  }

  let notifyMeTotal = 0;
  let notifyMeProducts = 0;
  for (const [, entries] of Object.entries(notifyMe)) {
    if (Array.isArray(entries) && entries.length > 0) {
      notifyMeProducts++;
      notifyMeTotal += entries.length;
    }
  }

  return json(200, {
    sent: counts,
    optedOut: Object.keys(optouts).length,
    notifyMe: { products: notifyMeProducts, registrations: notifyMeTotal },
  });
};

// ── router ──────────────────────────────────────────────────────────────
const handle = async ({ request, env }) => {
  const blocked = await initRequestContext({ request, env });
  if (blocked) return blocked;

  const url = new URL(request.url);
  const segments = url.pathname
    .replace(/^\/api\/marketing-triggers\/?/, "")
    .split("/")
    .filter(Boolean);
  const route = segments[0] || "";
  const method = request.method;

  if (method === "POST" && route === "process") {
    const auth = request.headers.get("Authorization") || "";
    const bearer = auth.replace(/^Bearer\s+/i, "").trim();
    if (!bearer || !constantTimeEqual(bearer, env.BACKUP_TOKEN || "")) {
      return json(401, { error: "Unauthorized" });
    }
    return handleProcess(env);
  }

  if (method === "POST" && route === "notify-me") {
    let event;
    try {
      event = await buildLambdaEvent(request);
    } catch (err) {
      if (err instanceof BodyTooLargeError) {
        return json(413, { error: "Request body too large" });
      }
      throw err;
    }
    return handleNotifyMe(event, env);
  }

  if (method === "GET" && route === "unsubscribe") {
    return handleUnsubscribe(url);
  }

  if (method === "GET" && route === "stats") {
    const event = await buildLambdaEvent(request);
    if (!(await isAuthenticated(event))) {
      return json(401, { error: "Not authenticated" });
    }
    return handleStats();
  }

  return json(404, { error: "Not found" });
};

export const onRequest = handle;
