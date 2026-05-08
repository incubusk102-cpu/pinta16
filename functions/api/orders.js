import { wrapHandler } from "./_lib/handler-wrapper.js";
import { connectLambda, getStore } from "./_lib/kv-stores.js";
import { makeStore } from "./_lib/kv-store.js";
import { getCloudflareEnv } from "./_lib/context.js";
import crypto from "node:crypto";
import { isAuthenticated } from "./_lib/admin-auth.js";
import { captureRequestMeta } from "./_lib/request-info.js";
import { consumeRateLimit, rateLimitResponse } from "./_lib/rate-limit.js";
import { appendAuditEvent, recordPiiAccess } from "./_lib/audit-log.js";
import { withSecurityHeaders } from "./_lib/security-headers.js";
import { logError, logWarn } from "./_lib/redact.js";
import {
  verifyTurnstileToken,
  turnstileFailureResponse,
} from "./_lib/turnstile.js";
import {
  sendOrderEmail,
  sendNewOrderAdminAlert,
  isEmailConfigured,
  resolveEmailEnv,
} from "./_lib/email.js";
import { sendOrderPush } from "./_lib/push.js";
import {
  findUserByReferralCode,
  getCurrentUserFromSession,
  getUsersStore,
  normalizeEmail,
  readUsers,
  writeUsers,
} from "./_lib/user-auth.js";
import { ensurePersonalReward } from "./_lib/personal-rewards.js";
import {
  mirrorOrderToD1,
  isD1Available,
  recordCouponRedemption,
  customerCouponRedemptionCount,
} from "./_lib/d1.js";

const PAYMONGO_BASE = "https://api.paymongo.com";

const buildPayMongoAuth = (secretKey) =>
  `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;

const readPayMongoError = async (response) => {
  const text = await response.text();
  try {
    const payload = JSON.parse(text);
    return (
      payload?.errors
        ?.map((e) => e?.detail || e?.code)
        .filter(Boolean)
        .join("; ") || text
    );
  } catch {
    return text;
  }
};

const payMongoRequest = async (path, secretKey, body, method = "POST") => {
  const response = await fetch(`${PAYMONGO_BASE}${path}`, {
    method,
    headers: {
      Authorization: buildPayMongoAuth(secretKey),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(await readPayMongoError(response));
  }
  return response.json();
};

const getPaymongoSecret = () => {
  const key = process.env.PAYMONGO_SECRET_KEY?.trim();
  if (!key || !key.startsWith("sk_")) return null;
  return key;
};

const STORE_NAME = "orders";
const ORDERS_KEY = "all-orders";
const CONFIG_STORE_NAME = "storefront-config";
const CONFIG_KEY = "config";

// Build the auto-rotating "daily feature" promo for the current UTC day.
// Mirrors buildDailyToday() in storefront-config.js; kept inline here so
// place-order validation accepts today's code without persisting it.
const buildTodaysDailyPromo = (config) => {
  const df =
    config && typeof config.dailyFeature === "object"
      ? config.dailyFeature
      : null;
  if (!df || df.enabled !== true || !df.productId) return null;
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const code = `DAILY${yyyy}${mm}${dd}`;
  const expires = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      23,
      59,
      59,
    ),
  );
  const percent = Math.min(
    50,
    Math.max(1, Math.floor(Number(df.percent) || 5)),
  );
  return {
    code,
    type: "percent",
    value: percent,
    freeShipping: false,
    minSpend: 0,
    usageLimit: null,
    usageCount: 0,
    enabled: true,
    expiresAt: expires.toISOString(),
    description: "Daily feature — today only",
    _virtual: true,
  };
};

const findEligiblePromo = (config, code) => {
  if (!config) return null;
  const upper = String(code || "")
    .trim()
    .toUpperCase();
  if (!upper) return null;
  // Today's daily-feature code is virtual and not persisted in promoCodes,
  // so check it before falling back to the stored list.
  const daily = buildTodaysDailyPromo(config);
  if (daily && daily.code === upper) return daily;
  if (!Array.isArray(config.promoCodes)) return null;
  const promo = config.promoCodes.find((p) => p.code === upper);
  if (!promo) return null;
  if (promo.enabled === false) return null;
  if (promo.expiresAt && new Date(promo.expiresAt).getTime() < Date.now()) {
    return null;
  }
  if (
    promo.usageLimit !== null &&
    promo.usageLimit !== undefined &&
    (promo.usageCount || 0) >= promo.usageLimit
  ) {
    return null;
  }
  return promo;
};

const computeExpectedDiscount = (promo, subtotal) => {
  if (!promo) return 0;
  if (subtotal < (promo.minSpend || 0)) return 0;
  if (promo.type === "percent") {
    return Math.round((subtotal * promo.value) / 100);
  }
  if (promo.type === "flat") {
    // "Any order becomes ₱<value>" — discount is everything above the flat
    // price, capped to subtotal so we never go negative.
    return Math.max(0, Math.min(subtotal, subtotal - promo.value));
  }
  if (promo.type === "free_shipping") {
    // No subtotal discount — only shipping is subsidised, which is handled
    // separately via promoGrantsFreeShipping().
    return 0;
  }
  // "fixed" — fixed peso amount off, never below zero.
  return Math.min(promo.value, subtotal);
};

const promoGrantsFreeShipping = (promo) =>
  Boolean(promo) &&
  (promo.type === "free_shipping" || Boolean(promo.freeShipping));

// Compare-and-swap increment of usageCount. Validates the promo is still
// eligible (enabled, not expired, under limit) on every attempt so a malicious
// client can't deplete a usage cap by replaying the place action.
const incrementPromoUsage = async (event, code) => {
  if (!code || typeof code !== "string") return;
  try {
    connectLambda(event);
    const configStore = getStore(CONFIG_STORE_NAME);
    const upper = code.trim().toUpperCase();
    for (let attempt = 0; attempt < 5; attempt++) {
      const result = await configStore.getWithMetadata(CONFIG_KEY, {
        type: "json",
      });
      if (!result) return;
      const config = result.data;
      if (!config || !Array.isArray(config.promoCodes)) return;
      const promo = findEligiblePromo(config, upper);
      if (!promo) return; // no longer eligible — silently skip
      // Virtual / daily-feature codes are not persisted, so there's
      // nothing to bump.
      if (promo._virtual) return;
      const idx = config.promoCodes.findIndex((p) => p.code === upper);
      if (idx === -1) return;
      const next = { ...config };
      next.promoCodes = config.promoCodes.map((p, i) =>
        i === idx ? { ...p, usageCount: (p.usageCount || 0) + 1 } : p,
      );
      const writeOpts = result.etag ? { onlyIfMatch: result.etag } : {};
      const write = await configStore.setJSON(CONFIG_KEY, next, writeOpts);
      if (write.modified) return;
      // CAS conflict — retry with a fresh read.
    }
    logWarn("incrementPromoUsage: gave up after 5 CAS attempts", code);
  } catch (err) {
    logError("incrementPromoUsage failed:", err);
  }
};

// On a successful order, mark the customer's first-order date so we can
// fire anniversary rewards a year later. If the customer was referred by
// another user, mint reciprocal ₱200 codes for both parties — but only
// once, on the customer's true first paid order (avoids re-triggering
// when somebody re-uses the same email later).
const applyFirstOrderRewards = async ({ allOrders, order }) => {
  const email = normalizeEmail(order.orderInfo?.email);
  if (!email) return;
  const usersStore = getUsersStore();
  const users = await readUsers(usersStore);
  const customer = users[email];
  if (!customer) return;
  const isFirst =
    !customer.firstOrderAt &&
    allOrders.filter((o) => normalizeEmail(o.orderInfo?.email) === email)
      .length === 1;
  if (!isFirst) return;
  customer.firstOrderAt = order.createdAt;
  // If the customer applied a referral code at signup, mint a reward
  // for both inviter and invitee. We key on the customer's id to keep
  // it idempotent — re-running this hook won't duplicate codes.
  let inviter = null;
  if (customer.referredBy) {
    inviter = findUserByReferralCode(users, customer.referredBy);
  }
  await writeUsers(usersStore, users);
  if (!inviter) return;
  const periodKey = String(customer.id || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 8)
    .toUpperCase();
  await ensurePersonalReward({
    user: inviter,
    kind: "referral-give",
    periodKey,
    description: `Thanks for referring ${customer.name || "a friend"} — ₱200 off your next order`,
  });
  await ensurePersonalReward({
    user: customer,
    kind: "referral-get",
    periodKey,
    description: `Welcome gift from a friend — ₱200 off your next order`,
  });
};

const readStorefrontConfigDirect = async (event) => {
  try {
    connectLambda(event);
    const configStore = getStore(CONFIG_STORE_NAME);
    return await configStore.get(CONFIG_KEY, { type: "json" });
  } catch (err) {
    logError("readStorefrontConfigDirect failed:", err);
    return null;
  }
};

const json = (statusCode, body) => ({
  statusCode,
  headers: withSecurityHeaders(),
  body: JSON.stringify(body),
});

const maskEmail = (email) => {
  const s = String(email || "");
  const at = s.indexOf("@");
  if (at <= 1) return s ? "***" : "";
  const local = s.slice(0, at);
  const domain = s.slice(at);
  const visible = local.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(2, local.length - 1))}${domain}`;
};

const parseBody = (body) => {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
};

const getOrdersStore = (event) => {
  connectLambda(event);
  return getStore(STORE_NAME);
};

/**
 * Send a transactional email for the given notification entry and stamp the
 * delivery result back onto the entry in place. Never throws.
 */
const recordEmail = async (orderForEmail, notification, extra = {}) => {
  try {
    const result = await sendOrderEmail({
      kind: notification.type,
      order: orderForEmail,
      extra,
    });
    if (result.delivered) {
      notification.delivered = true;
      notification.provider = result.provider;
      if (result.providerId) notification.providerId = result.providerId;
    } else if (result.skipped) {
      notification.delivered = false;
      notification.skipped = true;
      if (result.reason) notification.skipReason = result.reason;
    } else if (result.error) {
      notification.delivered = false;
      notification.error = String(result.error).slice(0, 400);
      if (result.provider) notification.provider = result.provider;
    }
  } catch (err) {
    notification.delivered = false;
    notification.error = err instanceof Error ? err.message : String(err);
  }
  return notification;
};

/**
 * Fire a Web Push notification for the same status change the email
 * pipeline just covered, and stamp the result onto a `push` sub-object on
 * the notification entry. Never throws — push is a free, best-effort
 * channel that runs alongside email; its failure must not block status
 * persistence.
 *
 * The push payload, recipient resolution, and per-kind admin gating all
 * live in functions/api/_lib/push.js (mirroring email.js).
 */
const recordPush = async (orderForPush, notification, extra = {}) => {
  try {
    const result = await sendOrderPush({
      kind: notification.type,
      order: orderForPush,
      extra,
    });
    notification.push = {
      delivered: !!result.delivered,
      ...(result.skipped ? { skipped: true } : {}),
      ...(result.reason ? { reason: String(result.reason).slice(0, 120) } : {}),
      ...(result.provider ? { provider: result.provider } : {}),
      ...(typeof result.attempted === "number"
        ? { attempted: result.attempted }
        : {}),
      ...(typeof result.successful === "number"
        ? { successful: result.successful }
        : {}),
      ...(typeof result.expired === "number" && result.expired > 0
        ? { expired: result.expired }
        : {}),
    };
  } catch (err) {
    notification.push = {
      delivered: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  return notification;
};

const readOrders = async (store) => {
  const orders = await store.get(ORDERS_KEY, { type: "json" });
  return Array.isArray(orders) ? orders : [];
};

export const handler = async (event) => {
  const method = event.httpMethod;
  const params = event.queryStringParameters || {};

  try {
    const store = getOrdersStore(event);

    if (method === "GET") {
      if (params.reviews === "all") {
        // Admin-only: list every review across orders, including unpublished
        // ones, with extra fields needed by the admin Reviews section.
        if (!(await isAuthenticated(event))) {
          return json(401, { error: "Not authenticated" });
        }
        const orders = await readOrders(store);
        const reviews = [];
        for (const o of orders) {
          const reviewsList = Array.isArray(o.reviews)
            ? o.reviews
            : o.review
              ? [o.review]
              : [];
          if (reviewsList.length === 0) continue;
          const fullName = (o.orderInfo?.fullName || "").trim();
          for (const r of reviewsList) {
            reviews.push({
              orderId: o.id,
              rating: r.rating,
              text: r.text,
              images: Array.isArray(r.images) ? r.images : [],
              submittedAt: r.submittedAt,
              publishedToHomepage: Boolean(r.publishedToHomepage),
              customerName: fullName || "Customer",
              customerEmail: o.orderInfo?.email || "",
              customerCity: o.orderInfo?.city || "",
              productId: r.productId || "",
              productTitle: r.productTitle || "",
              productImage: r.productImage || "",
              adminReply: r.adminReply || null,
            });
          }
        }
        reviews.sort(
          (a, b) =>
            new Date(b.submittedAt).getTime() -
            new Date(a.submittedAt).getTime(),
        );
        return json(200, { reviews });
      }

      if (params.reviews === "published") {
        const filterProductId =
          typeof params.productId === "string" && params.productId.trim()
            ? params.productId.trim()
            : "";
        const orders = await readOrders(store);
        const reviews = [];
        for (const o of orders) {
          const reviewsList = Array.isArray(o.reviews)
            ? o.reviews
            : o.review
              ? [o.review]
              : [];
          if (reviewsList.length === 0) continue;
          const firstName = (o.orderInfo?.fullName || "")
            .trim()
            .split(/\s+/)[0];
          for (const r of reviewsList) {
            if (filterProductId) {
              if ((r.productId || "") !== filterProductId) continue;
              if (!r.publishedToHomepage) continue;
            } else if (!r.publishedToHomepage) {
              continue;
            }
            reviews.push({
              orderId: o.id,
              rating: r.rating,
              text: r.text,
              images: Array.isArray(r.images) ? r.images : [],
              submittedAt: r.submittedAt,
              customerName: firstName || "Customer",
              customerCity: o.orderInfo?.city || "",
              productId: r.productId || undefined,
              productTitle: r.productTitle || undefined,
              productImage: r.productImage || undefined,
              adminReply: r.adminReply || null,
            });
          }
        }
        reviews.sort(
          (a, b) =>
            new Date(b.submittedAt).getTime() -
            new Date(a.submittedAt).getTime(),
        );
        return json(200, { reviews });
      }

      if (params.recent === "sold") {
        // Public-facing "last sold" feed for the homepage social-proof
        // ticker. Anonymous on purpose: only the painting itself + a
        // timestamp. We deliberately do NOT return the buyer's first
        // name or city — combining either with the (one-of-one)
        // painting title is enough to re-identify the buyer to anyone
        // who knows them. Capped at 20 items.
        //
        // We also drop any orders that belong to the signed-in viewer
        // so collectors never see their own purchases narrated back
        // to them in the strip.
        const orders = await readOrders(store);
        const limit = Math.min(Math.max(Number(params.limit) || 8, 1), 20);
        const viewer = await getCurrentUserFromSession(event).catch(() => null);
        const viewerEmail = viewer?.email ? normalizeEmail(viewer.email) : null;
        const eligible = orders.filter((o) => {
          if (!o.status || o.status === "cancelled") return false;
          if (o.refund?.status === "succeeded") return false;
          if (!Array.isArray(o.items) || o.items.length === 0) return false;
          if (
            viewerEmail &&
            normalizeEmail(o.orderInfo?.email || "") === viewerEmail
          ) {
            return false;
          }
          return true;
        });
        eligible.sort(
          (a, b) =>
            new Date(b.createdAt || 0).getTime() -
            new Date(a.createdAt || 0).getTime(),
        );
        const sales = eligible.slice(0, limit).map((o) => {
          const item = o.items[0] || {};
          return {
            productTitle: String(item.title || "").slice(0, 200),
            productImage: typeof item.image === "string" ? item.image : "",
            productId: String(item.id || ""),
            soldAt: o.createdAt,
          };
        });
        return json(200, { sales });
      }

      if (params.id) {
        const orders = await readOrders(store);
        const order = orders.find((o) => o.id === params.id);
        if (!order) return json(404, { error: "Order not found" });
        // Strip admin-only fields before returning to the public.
        const {
          orderInfo,
          requestMeta: _requestMeta,
          activityLog: _activityLog,
          ...rest
        } = order;
        const publicOrderInfo = orderInfo
          ? {
              fullName: orderInfo.fullName,
              city: orderInfo.city,
              email: maskEmail(orderInfo.email),
            }
          : undefined;
        return json(200, {
          order: { ...rest, orderInfo: publicOrderInfo },
        });
      }

      if (params.metrics === "email-status") {
        if (!(await isAuthenticated(event))) {
          return json(401, { error: "Not authenticated" });
        }
        const provider = process.env.RESEND_API_KEY
          ? "resend"
          : process.env.BREVO_API_KEY
            ? "brevo"
            : null;
        // Show the actual from address that order emails will use.
        // sendOrderEmail now resolves from storefront config first
        // (default: "order@canvhub.com"), then env vars.
        const envFrom = resolveEmailEnv("FROM", "order") || null;
        const orderEmailCfg = await (async () => {
          try {
            const cfgStore = getStore(CONFIG_STORE_NAME);
            const cfg = await cfgStore.get(CONFIG_KEY, { type: "json" });
            return cfg?.orderEmail || null;
          } catch {
            return null;
          }
        })();
        const cfgEmail = (
          orderEmailCfg?.fromEmail || "order@canvhub.com"
        ).trim();
        const cfgName = (orderEmailCfg?.fromName || "Canvas Hub").trim();
        const effectiveFrom = cfgEmail
          ? cfgName
            ? `${cfgName} <${cfgEmail}>`
            : cfgEmail
          : envFrom;
        return json(200, {
          email: {
            configured: Boolean(provider),
            provider,
            from: effectiveFrom || envFrom,
            replyTo: resolveEmailEnv("REPLY_TO", "order") || null,
          },
        });
      }

      if (params.metrics === "analytics") {
        if (!(await isAuthenticated(event))) {
          return json(401, { error: "Not authenticated" });
        }
        const days = Math.min(Math.max(Number(params.days) || 30, 7), 90);
        const orders = await readOrders(store);
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const series = [];
        const dayMap = new Map();
        for (let i = days - 1; i >= 0; i--) {
          const d = new Date(today.getTime() - i * 86400000);
          const key = d.toISOString().slice(0, 10);
          const entry = { date: key, orders: 0, revenue: 0, refunded: 0 };
          dayMap.set(key, entry);
          series.push(entry);
        }
        const productMap = new Map();
        const statusCounts = {
          confirmed: 0,
          in_progress: 0,
          out_for_delivery: 0,
          received: 0,
        };
        for (const o of orders) {
          const total = Number(o.total) || 0;
          const refunded =
            o.refund && o.refund.status === "succeeded"
              ? Number(o.refund.amount) || 0
              : 0;
          if (statusCounts[o.status] !== undefined) {
            statusCounts[o.status] += 1;
          }
          const created = new Date(o.createdAt);
          if (!Number.isNaN(created.getTime())) {
            const key = created.toISOString().slice(0, 10);
            const entry = dayMap.get(key);
            if (entry) {
              entry.orders += 1;
              entry.revenue += total;
              entry.refunded += refunded;
            }
          }
          for (const item of o.items || []) {
            const id = item.id || item.title;
            if (!id) continue;
            const cur = productMap.get(id) || {
              id,
              title: item.title || id,
              image: item.image || "",
              units: 0,
              revenue: 0,
            };
            const qty = Number(item.quantity) || 1;
            cur.units += qty;
            cur.revenue += (Number(item.price) || 0) * qty;
            productMap.set(id, cur);
          }
        }
        const topProducts = Array.from(productMap.values())
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5);
        return json(200, {
          analytics: {
            days,
            series,
            topProducts,
            statusCounts,
          },
        });
      }

      if (params.metrics === "promos") {
        if (!(await isAuthenticated(event))) {
          return json(401, { error: "Not authenticated" });
        }
        const orders = await readOrders(store);
        const config = await readStorefrontConfigDirect(event);
        const knownCodes = Array.isArray(config?.promoCodes)
          ? config.promoCodes
          : [];
        const stats = new Map();
        // Seed every configured code so admins see them even with zero uses.
        for (const p of knownCodes) {
          stats.set(p.code, {
            code: p.code,
            type: p.type,
            value: p.value,
            freeShipping: Boolean(p.freeShipping),
            enabled: p.enabled,
            usageLimit: p.usageLimit,
            expiresAt: p.expiresAt,
            description: p.description || "",
            uses: 0,
            totalDiscount: 0,
            grossRevenue: 0,
            lastUsedAt: "",
          });
        }
        for (const o of orders) {
          const code = String(o.voucherCode || "")
            .trim()
            .toUpperCase();
          if (!code) continue;
          const discount = Number(o.discount) || 0;
          if (discount <= 0) continue;
          if (!stats.has(code)) {
            stats.set(code, {
              code,
              type: "unknown",
              value: 0,
              enabled: false,
              usageLimit: null,
              expiresAt: null,
              description: "(deleted)",
              uses: 0,
              totalDiscount: 0,
              grossRevenue: 0,
              lastUsedAt: "",
            });
          }
          const s = stats.get(code);
          s.uses += 1;
          s.totalDiscount += discount;
          s.grossRevenue += Number(o.total) || 0;
          const ts = o.createdAt || "";
          if (!s.lastUsedAt || ts > s.lastUsedAt) s.lastUsedAt = ts;
        }
        const promos = Array.from(stats.values())
          .map((p) => ({
            ...p,
            totalDiscount: Math.round(p.totalDiscount * 100) / 100,
            grossRevenue: Math.round(p.grossRevenue * 100) / 100,
          }))
          .sort((a, b) => b.uses - a.uses);
        return json(200, { promos });
      }

      if (params.metrics === "summary") {
        if (!(await isAuthenticated(event))) {
          return json(401, { error: "Not authenticated" });
        }
        const orders = await readOrders(store);
        const summary = orders.reduce(
          (acc, o) => {
            const total = Number(o.total) || 0;
            const refundedAmount =
              o.refund && o.refund.status === "succeeded"
                ? Number(o.refund.amount) || 0
                : 0;
            acc.totalOrders += 1;
            acc.grossRevenue += total;
            acc.refundedAmount += refundedAmount;
            acc.netRevenue += total - refundedAmount;
            if (o.status === "confirmed") acc.confirmedCount += 1;
            if (o.status === "in_progress") acc.inProgressCount += 1;
            if (o.status === "out_for_delivery") acc.outForDeliveryCount += 1;
            if (o.status === "received") acc.completedCount += 1;
            if (
              o.status !== "received" &&
              !(o.refund && o.refund.status === "succeeded")
            ) {
              acc.pendingShipOutCount += 1;
            }
            if (o.refund?.status === "pending") acc.refundPendingCount += 1;
            if (o.refund?.status === "succeeded") acc.refundSucceededCount += 1;
            if (o.refund?.status === "failed") acc.refundFailedCount += 1;
            // Reviews waiting for an admin reply — drives the "Today's
            // tasks" widget on the dashboard. We only count reviews
            // submitted within the last 30 days to avoid hassling admin
            // about ancient untouched reviews.
            const reviewsList = Array.isArray(o.reviews)
              ? o.reviews
              : o.review
                ? [o.review]
                : [];
            for (const r of reviewsList) {
              if (r.adminReply && r.adminReply.text) continue;
              const submittedAt = r.submittedAt
                ? new Date(r.submittedAt).getTime()
                : 0;
              if (
                submittedAt > 0 &&
                Date.now() - submittedAt <= 30 * 24 * 60 * 60 * 1000
              ) {
                acc.reviewsWaitingReplyCount += 1;
              }
            }
            return acc;
          },
          {
            totalOrders: 0,
            grossRevenue: 0,
            refundedAmount: 0,
            netRevenue: 0,
            confirmedCount: 0,
            inProgressCount: 0,
            outForDeliveryCount: 0,
            completedCount: 0,
            pendingShipOutCount: 0,
            refundPendingCount: 0,
            refundSucceededCount: 0,
            refundFailedCount: 0,
            reviewsWaitingReplyCount: 0,
          },
        );
        // Recent activity: collect activity log entries from all orders
        const recentActivity = [];
        for (const o of orders) {
          const log = Array.isArray(o.activityLog) ? o.activityLog : [];
          for (const entry of log) {
            recentActivity.push({
              orderId: o.id,
              customerName: o.orderInfo?.fullName || "Unknown",
              ...entry,
            });
          }
          // Also add a "placed" event from createdAt if no activityLog entry
          if (log.length === 0 && o.createdAt) {
            recentActivity.push({
              orderId: o.id,
              customerName: o.orderInfo?.fullName || "Unknown",
              at: o.createdAt,
              type: "placed",
              actor: "customer",
            });
          }
        }
        recentActivity.sort((a, b) => (b.at || "").localeCompare(a.at || ""));
        return json(200, {
          summary,
          recentActivity: recentActivity.slice(0, 15),
        });
      }

      // Customer-facing: list every order belonging to the *signed-in*
      // user, scoped strictly by the email on their session token. This
      // is what powers `/account → My Orders`. Without it the customer
      // page falls back to localStorage, which is shared across every
      // Google account that ever signed in on the same browser — so
      // signing out and signing back in with a second Google account
      // would leak the first account's order history into the second.
      // Email match is normalized to handle case differences between
      // the Google profile email and what the customer typed at
      // checkout.
      if (params.mine === "1" || params.action === "mine") {
        const user = await getCurrentUserFromSession(event);
        if (!user) {
          return json(401, { error: "Not signed in" });
        }
        const userEmail = normalizeEmail(user.email);
        if (!userEmail) {
          return json(200, { orders: [] });
        }
        const all = await readOrders(store);
        const mine = all
          .filter((o) => normalizeEmail(o?.orderInfo?.email) === userEmail)
          .sort((a, b) =>
            String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
          );
        return json(200, { orders: mine });
      }

      if (!(await isAuthenticated(event))) {
        return json(401, { error: "Not authenticated" });
      }
      const orders = await readOrders(store);
      await recordPiiAccess(event, {
        resource: "orders",
        action: "list",
        detail: `Listed ${orders.length} order(s)`,
      });
      return json(200, { orders });
    }

    if (method === "POST") {
      const body = parseBody(event.body);
      const action = body.action;

      // Customer-initiated resync of an order whose original /place
      // POST never reached the server (Cloudflare challenge, body-size
      // cap, network blip during checkout). The original Turnstile
      // token has long since been consumed, so the regular `place`
      // path will reject the retry with "Verification failed". We
      // bypass Turnstile here by requiring (a) a valid user session
      // cookie and (b) that the buyer email on the order matches the
      // signed-in user — abusers without a real Google login can't
      // hit this path. Rate-limited and idempotent like `place`.
      if (action === "resync") {
        const user = await getCurrentUserFromSession(event);
        if (!user) {
          return json(401, { error: "Sign in to retry the order" });
        }
        const limit = await consumeRateLimit(event, {
          bucket: "orders-resync",
          windowMs: 60_000,
          max: 5,
        });
        if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
        const order = body.order;
        if (!order?.items?.length) {
          return json(400, { error: "Invalid order" });
        }
        const info = order.orderInfo;
        if (
          !info ||
          typeof info.fullName !== "string" ||
          !info.fullName.trim() ||
          typeof info.email !== "string" ||
          !info.email.trim() ||
          typeof info.phone !== "string" ||
          !info.phone.trim() ||
          typeof info.address !== "string" ||
          !info.address.trim() ||
          typeof info.city !== "string" ||
          !info.city.trim()
        ) {
          return json(400, { error: "Order is missing required information" });
        }
        if (normalizeEmail(info.email) !== normalizeEmail(user.email)) {
          return json(403, {
            error:
              "This order isn't on your account; ask support to recover it.",
          });
        }
        const orderId =
          typeof order.id === "string" && /^ORD-[A-Z0-9]+$/.test(order.id)
            ? order.id
            : null;
        if (!orderId) {
          return json(400, { error: "Invalid order ID" });
        }
        const orders = await readOrders(store);
        if (orders.some((o) => o.id === orderId)) {
          return json(409, { error: "Order already saved" });
        }
        const safeItems = order.items.slice(0, 50).map((item) => ({
          id: String(item.id || "").slice(0, 100),
          title: String(item.title || "").slice(0, 300),
          price: Number(item.price) || 0,
          quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
          image:
            typeof item.image === "string" ? item.image.slice(0, 2000) : "",
        }));
        const meta = captureRequestMeta(event);
        const safeOrder = {
          id: orderId,
          items: safeItems,
          orderInfo: {
            fullName: String(info.fullName).slice(0, 200),
            email: String(info.email).slice(0, 200),
            phone: String(info.phone).slice(0, 50),
            address: String(info.address).slice(0, 500),
            city: String(info.city).slice(0, 200),
            notes: String(info.notes || "").slice(0, 1000),
            ...(typeof info.region === "string"
              ? { region: info.region.slice(0, 60) }
              : {}),
            ...(typeof info.province === "string"
              ? { province: info.province.slice(0, 120) }
              : {}),
            ...(typeof info.barangay === "string"
              ? { barangay: info.barangay.slice(0, 120) }
              : {}),
          },
          subtotal: Number(order.subtotal) || 0,
          shippingFee: Number(order.shippingFee) || 0,
          freeShipping: Boolean(order.freeShipping),
          discount: Number(order.discount) || 0,
          total: Number(order.total) || 0,
          estimatedCreationDays:
            typeof order.estimatedCreationDays === "string"
              ? order.estimatedCreationDays.slice(0, 60)
              : "",
          createdAt: order.createdAt || new Date().toISOString(),
          status: [
            "confirmed",
            "in_progress",
            "out_for_delivery",
            "received",
          ].includes(order.status)
            ? order.status
            : "confirmed",
          paymentIntentId:
            typeof order.paymentIntentId === "string"
              ? order.paymentIntentId.slice(0, 200)
              : "",
          voucherCode:
            typeof order.voucherCode === "string"
              ? order.voucherCode.toUpperCase().slice(0, 30)
              : "",
          notifications: [],
          serverSynced: true,
          activityLog: [
            {
              at: new Date().toISOString(),
              type: "placed",
              actor: "customer-resync",
              detail: "Recovered via customer Sync now",
              ...meta,
            },
          ],
        };
        await store.setJSON(ORDERS_KEY, [safeOrder, ...orders]);
        await appendAuditEvent(event, {
          type: "order.resync",
          outcome: "success",
          subject: safeOrder.id,
          detail: `Resynced by ${user.email}`,
          ...meta,
        });
        return json(200, { order: safeOrder });
      }

      if (action === "place") {
        const limit = await consumeRateLimit(event, {
          bucket: "orders-place",
          windowMs: 60_000,
          max: 10,
        });
        if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
        // Honeypot — checkout form ships a hidden `<input name="website">`
        // (display:none + aria-hidden + tabIndex=-1) that real users
        // never touch. A non-empty value at submit time is a strong
        // "this is a bot" signal; respond with the same generic 400 the
        // server returns for missing fields so the bot has no way to
        // distinguish honeypot detection from a real validation error.
        if (
          typeof body.website === "string" &&
          body.website.trim().length > 0
        ) {
          return json(400, { error: "Invalid order" });
        }
        // Cloudflare Turnstile — falls open (skipped) when
        // TURNSTILE_SECRET_KEY is not configured, so this is safe to ship
        // before the dashboard widget exists. When present, we still
        // accept the request if the token is missing during the soft /
        // off rollout phase (see _lib/turnstile.js + Admin → Security).
        const tsToken =
          typeof body.turnstileToken === "string" ? body.turnstileToken : "";
        const ts = await verifyTurnstileToken(event, { token: tsToken });
        if (!ts.allowed) {
          const r = turnstileFailureResponse(ts.reason);
          return json(r.statusCode, JSON.parse(r.body));
        }
        // Vacation-mode hard guard: when the gallery owner has paused
        // checkout, refuse new orders with a friendly message instead of
        // accepting them silently. Soft-pause (vacationMode.enabled but
        // pauseCheckout = false) still lets orders through.
        const vmConfig = await readStorefrontConfigDirect(event);
        const vm = vmConfig?.vacationMode;
        if (vm?.enabled && vm.pauseCheckout !== false) {
          const friendly =
            vm.message?.trim() ||
            (vm.returnDate
              ? `Canvas Hub is on a research trip until ${vm.returnDate}. New orders resume then — bookmark a piece and I'll reach out when I'm back.`
              : "Canvas Hub is briefly paused. New orders resume soon — bookmark a piece and I'll reach out when I'm back.");
          return json(423, {
            error: friendly,
            vacationMode: true,
            returnDate: vm.returnDate || null,
          });
        }
        const order = body.order;
        if (!order?.items?.length) {
          return json(400, { error: "Invalid order" });
        }
        const info = order.orderInfo;
        if (
          !info ||
          typeof info.fullName !== "string" ||
          !info.fullName.trim() ||
          typeof info.email !== "string" ||
          !info.email.trim() ||
          typeof info.phone !== "string" ||
          !info.phone.trim() ||
          typeof info.address !== "string" ||
          !info.address.trim() ||
          typeof info.city !== "string" ||
          !info.city.trim()
        ) {
          return json(400, { error: "Missing or invalid order info" });
        }
        if (typeof order.total !== "number" || order.total < 0) {
          return json(400, { error: "Invalid total" });
        }
        const orderId =
          typeof order.id === "string" && /^ORD-[A-Z0-9]+$/.test(order.id)
            ? order.id
            : `ORD-${crypto.randomUUID().split("-")[0].toUpperCase()}`;
        const orders = await readOrders(store);
        if (orders.some((o) => o.id === orderId)) {
          return json(409, { error: "Order already exists" });
        }
        const safeItems = order.items.slice(0, 50).map((item) => ({
          id: String(item.id || "").slice(0, 100),
          title: String(item.title || "").slice(0, 300),
          price: Number(item.price) || 0,
          quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
          image:
            typeof item.image === "string" ? item.image.slice(0, 2000) : "",
        }));
        // Server-side promo validation: only honor a voucher if it's still
        // eligible AND the client-supplied discount matches what the code
        // would actually grant. Otherwise drop the code so a malicious client
        // can't use a known code to drain usage caps with bogus discounts.
        let validatedVoucherCode = "";
        let validatedDiscount = 0;
        const clientVoucher =
          typeof order.voucherCode === "string"
            ? order.voucherCode.trim().toUpperCase().slice(0, 30)
            : "";
        const clientSubtotal = Number(order.subtotal) || 0;
        const clientDiscount = Number(order.discount) || 0;
        if (clientVoucher) {
          const config = await readStorefrontConfigDirect(event);
          const promo = findEligiblePromo(config, clientVoucher);
          if (promo) {
            const expected = computeExpectedDiscount(promo, clientSubtotal);
            const grantsFreeShip = promoGrantsFreeShipping(promo);
            const discountMatches = Math.abs(expected - clientDiscount) <= 1;
            // Accept the code if the discount math checks out AND the code
            // grants at least one tangible benefit (a real discount or free
            // shipping). free_shipping-only codes have expected === 0 and
            // were previously dropped — they are now honored.
            if (discountMatches && (expected > 0 || grantsFreeShip)) {
              // Per-customer cap: when the admin set
              // `maxRedemptionsPerCustomer > 0`, look the buyer up in the
              // D1 redemption ledger and refuse the discount if they're
              // already at the cap. Null return = D1 unbound, in which
              // case we silently fall through and rely on the global
              // KV `usageLimit` instead so the order still places.
              const cap = Math.max(
                0,
                Math.floor(Number(promo.maxRedemptionsPerCustomer) || 0),
              );
              let overCap = false;
              if (cap > 0) {
                const used = await customerCouponRedemptionCount(
                  info.email,
                  clientVoucher,
                );
                if (typeof used === "number" && used >= cap) overCap = true;
              }
              if (!overCap) {
                validatedVoucherCode = clientVoucher;
                validatedDiscount = expected;
              }
            }
          }
        }

        const safeOrder = {
          id: orderId,
          items: safeItems,
          orderInfo: {
            fullName: String(info.fullName).slice(0, 200),
            email: String(info.email).slice(0, 200),
            phone: String(info.phone).slice(0, 50),
            address: String(info.address).slice(0, 500),
            city: String(info.city).slice(0, 200),
            notes: String(info.notes || "").slice(0, 1000),
            // PH-specific fields collected from the cascading picker.
            // All optional — legacy clients that don't supply them
            // round-trip the same way as before.
            ...(typeof info.addressLine1 === "string"
              ? { addressLine1: info.addressLine1.slice(0, 300) }
              : {}),
            ...(typeof info.addressLine2 === "string"
              ? { addressLine2: info.addressLine2.slice(0, 300) }
              : {}),
            ...(typeof info.region === "string"
              ? { region: info.region.slice(0, 60) }
              : {}),
            ...(typeof info.province === "string"
              ? { province: info.province.slice(0, 120) }
              : {}),
            ...(typeof info.barangay === "string"
              ? { barangay: info.barangay.slice(0, 120) }
              : {}),
            ...(typeof info.landmark === "string"
              ? { landmark: info.landmark.slice(0, 240) }
              : {}),
            ...(typeof info.postalCode === "string"
              ? { postalCode: info.postalCode.slice(0, 20) }
              : {}),
            ...(typeof info.country === "string"
              ? { country: info.country.slice(0, 80) }
              : {}),
            ...(typeof info.courier === "string"
              ? { courier: info.courier.slice(0, 60) }
              : {}),
            ...(typeof info.shippingZone === "string"
              ? { shippingZone: info.shippingZone.slice(0, 40) }
              : {}),
            ...(typeof info.formattedAddress === "string"
              ? { formattedAddress: info.formattedAddress.slice(0, 500) }
              : {}),
            ...(typeof info.placeId === "string"
              ? { placeId: info.placeId.slice(0, 200) }
              : {}),
            ...(typeof info.latitude === "number"
              ? { latitude: info.latitude }
              : {}),
            ...(typeof info.longitude === "number"
              ? { longitude: info.longitude }
              : {}),
          },
          subtotal: clientSubtotal,
          shippingFee: Number(order.shippingFee) || 0,
          discount: validatedDiscount,
          // client total = subtotal - clientDiscount + shipping; if we strip
          // the discount, add back what we subtracted.
          total:
            (Number(order.total) || 0) + (clientDiscount - validatedDiscount),
          estimatedCreationDays: String(
            order.estimatedCreationDays || "",
          ).slice(0, 100),
          status: "confirmed",
          createdAt: new Date().toISOString(),
          paymentIntentId:
            typeof order.paymentIntentId === "string"
              ? order.paymentIntentId.slice(0, 200)
              : "",
          qrCodeImageUrl:
            typeof order.qrCodeImageUrl === "string"
              ? order.qrCodeImageUrl.slice(0, 4000)
              : "",
          voucherCode: validatedVoucherCode,
          notifications: [
            {
              type: "confirmed",
              message: "Your order has been confirmed.",
              recipient: String(info.email).slice(0, 200),
              sentAt: new Date().toISOString(),
            },
          ],
          review: null,
          requestMeta: captureRequestMeta(event),
          activityLog: [
            {
              at: new Date().toISOString(),
              type: "placed",
              actor: "customer",
              ...captureRequestMeta(event),
            },
          ],
        };
        // Send order-confirmation email and stamp delivery info onto the
        // notification entry. We persist after the email to capture the
        // provider id / error. Forward the client-built waybill PDF
        // (base64) when present so it can be attached to the email.
        const waybillPdfBase64 =
          typeof body.waybillPdfBase64 === "string" &&
          // Hard cap at ~3.5 MB base64 (≈2.6 MB raw) which is way over
          // any sane A6 waybill size; protects sendgrid/brevo limits.
          body.waybillPdfBase64.length > 0 &&
          body.waybillPdfBase64.length < 3_500_000
            ? body.waybillPdfBase64
            : "";
        await recordEmail(
          safeOrder,
          safeOrder.notifications[0],
          waybillPdfBase64 ? { waybillPdfBase64 } : {},
        );
        // Fire the parallel free Web Push channel. Almost always a no-op
        // here because the shopper hasn't opted in yet (the opt-in card
        // appears on the OrderConfirmation modal that's about to render).
        // Future status changes will land on this device once they tap
        // "Enable for free".
        await recordPush(safeOrder, safeOrder.notifications[0]);
        // Fire a separate "new order" alert to the admin so they get a
        // phone-push from Gmail/Outlook the moment an order lands. Best
        // effort — a delivery failure here must not block order
        // persistence (the customer has already paid by this point).
        try {
          await sendNewOrderAdminAlert({ order: safeOrder });
        } catch (err) {
          logWarn("admin order alert failed:", err);
        }
        const next = [safeOrder, ...orders];
        await store.setJSON(ORDERS_KEY, next);
        // D1 write-through: mirror order into SQL for analytics/CRM.
        // Best effort — never blocks the KV write or the response.
        try {
          if (isD1Available()) await mirrorOrderToD1(safeOrder);
        } catch (e) {
          logWarn("D1 mirror failed (place):", e);
        }
        if (safeOrder.voucherCode && safeOrder.discount > 0) {
          await incrementPromoUsage(event, safeOrder.voucherCode);
          // Mirror this redemption into D1 so the per-customer cap query
          // above stays accurate and the admin "top codes" report has
          // something to aggregate. Best-effort — the KV usageCount
          // increment above is the source of truth for the global cap.
          try {
            const sessionUser = await getCurrentUserFromSession(event).catch(
              () => null,
            );
            await recordCouponRedemption({
              code: safeOrder.voucherCode,
              order: safeOrder,
              customerId: sessionUser?.id || null,
            });
          } catch (err) {
            logWarn("D1 coupon redemption mirror failed:", err);
          }
        }
        try {
          await applyFirstOrderRewards({
            allOrders: next,
            order: safeOrder,
          });
        } catch (err) {
          logWarn("first-order rewards hook failed:", err);
        }
        await appendAuditEvent(event, {
          type: "order.placed",
          outcome: "success",
          subject: safeOrder.id,
          detail: `Total ₱${safeOrder.total.toLocaleString()}`,
          ...captureRequestMeta(event),
        });
        // Mark the abandoned-cart entry as converted so the cron doesn't
        // send recovery emails for a cart that already checked out.
        try {
          const acBinding = getCloudflareEnv().ABANDONED_CARTS;
          if (acBinding) {
            const acStore = makeStore(acBinding);
            const acEmail = (safeOrder.orderInfo?.email || "")
              .trim()
              .toLowerCase();
            if (acEmail) {
              const entry = await acStore.get(acEmail, { type: "json" });
              if (entry && !entry.convertedAt) {
                entry.convertedAt = new Date().toISOString();
                await acStore.setJSON(acEmail, entry);
              }
            }
          }
        } catch {
          // Best effort — never block order persistence.
        }
        return json(200, { order: safeOrder });
      }

      // Admin-only manual order entry. Used to recover orders whose
      // client-side POST never reached the server (Cloudflare challenge,
      // body-size cap, network blip). Bypasses voucher / Turnstile /
      // honeypot / CSRF checks because the admin is already
      // authenticated; we still validate the order shape so the
      // resulting record is well-formed.
      if (action === "admin-create") {
        if (!(await isAuthenticated(event))) {
          return json(401, { error: "Not authenticated" });
        }
        const order = body.order;
        if (!order || typeof order !== "object") {
          return json(400, { error: "Missing order body" });
        }
        if (!Array.isArray(order.items) || order.items.length === 0) {
          return json(400, { error: "Order has no items" });
        }
        const info = order.orderInfo;
        if (
          !info ||
          typeof info !== "object" ||
          !info.fullName ||
          !info.email ||
          !info.phone ||
          !info.address ||
          !info.city
        ) {
          return json(400, { error: "Order is missing required information" });
        }
        const orderId =
          typeof order.id === "string" && /^ORD-[A-Z0-9]+$/.test(order.id)
            ? order.id
            : `ORD-${crypto.randomUUID().split("-")[0].toUpperCase()}`;
        const orders = await readOrders(store);
        if (orders.some((o) => o.id === orderId)) {
          return json(409, { error: "Order already exists" });
        }
        const safeItems = order.items.slice(0, 50).map((item) => ({
          id: String(item.id || "").slice(0, 100),
          title: String(item.title || "").slice(0, 300),
          price: Number(item.price) || 0,
          quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
          image:
            typeof item.image === "string" ? item.image.slice(0, 2000) : "",
        }));
        const meta = captureRequestMeta(event);
        const status = [
          "confirmed",
          "in_progress",
          "out_for_delivery",
          "received",
        ].includes(order.status)
          ? order.status
          : "confirmed";
        const safeOrder = {
          id: orderId,
          items: safeItems,
          orderInfo: {
            fullName: String(info.fullName).slice(0, 200),
            email: String(info.email).slice(0, 200),
            phone: String(info.phone).slice(0, 50),
            address: String(info.address).slice(0, 500),
            city: String(info.city).slice(0, 200),
            notes: String(info.notes || "").slice(0, 1000),
            ...(typeof info.region === "string"
              ? { region: info.region.slice(0, 60) }
              : {}),
            ...(typeof info.province === "string"
              ? { province: info.province.slice(0, 120) }
              : {}),
            ...(typeof info.barangay === "string"
              ? { barangay: info.barangay.slice(0, 120) }
              : {}),
          },
          subtotal: Number(order.subtotal) || 0,
          shippingFee: Number(order.shippingFee) || 0,
          freeShipping: Boolean(order.freeShipping),
          discount: Number(order.discount) || 0,
          total: Number(order.total) || 0,
          estimatedCreationDays:
            typeof order.estimatedCreationDays === "string"
              ? order.estimatedCreationDays.slice(0, 60)
              : "",
          createdAt: order.createdAt || new Date().toISOString(),
          status,
          paymentIntentId:
            typeof order.paymentIntentId === "string"
              ? order.paymentIntentId.slice(0, 200)
              : "",
          voucherCode:
            typeof order.voucherCode === "string"
              ? order.voucherCode.toUpperCase().slice(0, 30)
              : "",
          notifications: [],
          serverSynced: true,
          activityLog: [
            {
              at: new Date().toISOString(),
              type: "placed",
              actor: "admin",
              detail: "Created manually by admin",
              ...meta,
            },
          ],
        };
        const next = [safeOrder, ...orders];
        await store.setJSON(ORDERS_KEY, next);
        // D1 write-through for admin-created orders.
        try {
          if (isD1Available()) await mirrorOrderToD1(safeOrder);
        } catch (e) {
          logWarn("D1 mirror failed (admin-create):", e);
        }
        await appendAuditEvent(event, {
          type: "order.admin-create",
          outcome: "success",
          subject: safeOrder.id,
          detail: `Manual order ₱${safeOrder.total.toLocaleString()}`,
          ...meta,
        });
        await recordPiiAccess(event, {
          resource: "order",
          action: "create",
          target: safeOrder.orderInfo.email,
          detail: `${safeOrder.id} ₱${safeOrder.total.toLocaleString()}`,
        });
        return json(200, { order: safeOrder });
      }

      if (action === "update-status") {
        if (!(await isAuthenticated(event))) {
          return json(401, { error: "Not authenticated" });
        }
        const { orderId, status } = body;
        const validStatuses = [
          "confirmed",
          "in_progress",
          "out_for_delivery",
          "received",
        ];
        if (!orderId || !validStatuses.includes(status)) {
          return json(400, { error: "Invalid orderId or status" });
        }
        const orders = await readOrders(store);
        const idx = orders.findIndex((o) => o.id === orderId);
        if (idx === -1) return json(404, { error: "Order not found" });
        const existing = orders[idx];
        const notifications = Array.isArray(existing.notifications)
          ? [...existing.notifications]
          : [];
        const recipient = existing.orderInfo?.email || "";
        const statusChanged = existing.status !== status;
        const NOTIFICATION_MESSAGES = {
          confirmed: "Your order has been confirmed.",
          in_progress: "The artist has started working on your painting.",
          out_for_delivery: "Your order has shipped and is out for delivery!",
          received: "Your order is marked as received. We'd love your review!",
        };
        const meta = captureRequestMeta(event);
        const activityLog = Array.isArray(existing.activityLog)
          ? [...existing.activityLog]
          : [];
        if (statusChanged) {
          const note = {
            type: status,
            message: NOTIFICATION_MESSAGES[status],
            recipient,
            sentAt: new Date().toISOString(),
          };
          const statusEmailExtra = existing.shipment
            ? {
                shipment: existing.shipment,
                trackingUrl: existing.shipment.trackingUrl,
                courier: existing.shipment.courier,
                trackingNumber: existing.shipment.trackingNumber,
              }
            : {};
          await recordEmail(
            { ...existing, status, shipment: existing.shipment },
            note,
            statusEmailExtra,
          );
          await recordPush(
            { ...existing, status, shipment: existing.shipment },
            note,
            statusEmailExtra,
          );
          notifications.push(note);
          activityLog.push({
            at: new Date().toISOString(),
            type: `status:${status}`,
            actor: "admin",
            ...meta,
          });
          await appendAuditEvent(event, {
            type: "order.status",
            outcome: status,
            subject: orderId,
            detail: `Status -> ${status}`,
            ...meta,
          });
        }
        orders[idx] = { ...existing, status, notifications, activityLog };
        await store.setJSON(ORDERS_KEY, orders);
        // D1 write-through: update the order status in SQL.
        if (statusChanged) {
          try {
            if (isD1Available()) await mirrorOrderToD1(orders[idx]);
          } catch (e) {
            logWarn("D1 mirror failed (update-status):", e);
          }
        }
        // Return the latest notification so the admin UI can show email
        // delivery feedback (delivered / skipped / error).
        const latestNote = statusChanged
          ? notifications[notifications.length - 1]
          : null;
        await recordPiiAccess(event, {
          resource: "order",
          action: "update",
          target: recipient,
          detail: `${orderId} status -> ${status}`,
        });
        return json(200, { order: orders[idx], notification: latestNote });
      }

      if (action === "resend-email") {
        if (!(await isAuthenticated(event))) {
          return json(401, { error: "Not authenticated" });
        }
        const { orderId, notificationIndex } = body;
        if (!orderId || typeof orderId !== "string") {
          return json(400, { error: "Invalid orderId" });
        }
        const idx = Number(notificationIndex);
        if (!Number.isInteger(idx) || idx < 0) {
          return json(400, { error: "Invalid notificationIndex" });
        }
        const orders = await readOrders(store);
        const orderIdx = orders.findIndex((o) => o.id === orderId);
        if (orderIdx === -1) return json(404, { error: "Order not found" });
        const existing = orders[orderIdx];
        const notifications = Array.isArray(existing.notifications)
          ? [...existing.notifications]
          : [];
        if (idx >= notifications.length) {
          return json(404, { error: "Notification not found" });
        }
        const target = { ...notifications[idx] };
        delete target.delivered;
        delete target.error;
        delete target.skipped;
        delete target.skipReason;
        delete target.providerId;
        delete target.provider;
        target.recipient = existing.orderInfo?.email || target.recipient || "";
        target.sentAt = new Date().toISOString();
        const resendExtra = {
          shipment: existing.shipment,
          trackingUrl: existing.shipment?.trackingUrl,
          courier: existing.shipment?.courier,
          trackingNumber: existing.shipment?.trackingNumber,
          refundAmount: existing.refund?.amount,
          failureMessage: existing.refund?.failureMessage,
        };
        await recordEmail(existing, target, resendExtra);
        // Push uses the same per-kind config and gets re-fired here so an
        // admin "Resend" pushes to opted-in devices alongside the email.
        await recordPush(existing, target, resendExtra);
        notifications[idx] = target;
        orders[orderIdx] = { ...existing, notifications };
        await store.setJSON(ORDERS_KEY, orders);
        await recordPiiAccess(event, {
          resource: "order",
          action: "resend-email",
          target: existing.orderInfo?.email || "",
          detail: `${orderId} resent ${target.type || "notification"}`,
        });
        return json(200, { order: orders[orderIdx], notification: target });
      }

      if (action === "admin-note") {
        if (!(await isAuthenticated(event))) {
          return json(401, { error: "Not authenticated" });
        }
        const { orderId, note } = body;
        if (!orderId) return json(400, { error: "orderId required" });
        const orders = await readOrders(store);
        const idx = orders.findIndex((o) => o.id === orderId);
        if (idx === -1) return json(404, { error: "Order not found" });
        orders[idx] = { ...orders[idx], adminNote: note || "" };
        await store.setJSON(ORDERS_KEY, orders);
        await recordPiiAccess(event, {
          resource: "order",
          action: "update-note",
          target: orders[idx].orderInfo?.email || "",
          detail: `${orderId} admin note (${String(note || "").length} chars)`,
        });
        return json(200, { order: orders[idx] });
      }

      if (action === "update-shipment") {
        if (!(await isAuthenticated(event))) {
          return json(401, { error: "Not authenticated" });
        }
        const { orderId, shipment } = body;
        if (!orderId || typeof orderId !== "string") {
          return json(400, { error: "Invalid orderId" });
        }
        const orders = await readOrders(store);
        const idx = orders.findIndex((o) => o.id === orderId);
        if (idx === -1) return json(404, { error: "Order not found" });
        const existing = orders[idx];
        await recordPiiAccess(event, {
          resource: "order",
          action: "update-shipment",
          target: existing.orderInfo?.email || "",
          detail: `${orderId} shipment ${shipment === null ? "cleared" : "updated"}`,
        });
        const meta = captureRequestMeta(event);
        const activityLog = Array.isArray(existing.activityLog)
          ? [...existing.activityLog]
          : [];
        const notifications = Array.isArray(existing.notifications)
          ? [...existing.notifications]
          : [];

        if (shipment === null) {
          if (!existing.shipment) {
            return json(200, { order: existing });
          }
          const next = { ...existing };
          delete next.shipment;
          activityLog.push({
            at: new Date().toISOString(),
            type: "shipment:cleared",
            actor: "admin",
            ...meta,
          });
          orders[idx] = { ...next, activityLog, notifications };
          await store.setJSON(ORDERS_KEY, orders);
          return json(200, { order: orders[idx] });
        }

        if (!shipment || typeof shipment !== "object") {
          return json(400, { error: "Invalid shipment" });
        }
        const courier =
          typeof shipment.courier === "string"
            ? shipment.courier.trim().slice(0, 80)
            : "";
        const trackingNumber =
          typeof shipment.trackingNumber === "string"
            ? shipment.trackingNumber.trim().slice(0, 120)
            : "";
        const trackingUrlRaw =
          typeof shipment.trackingUrl === "string"
            ? shipment.trackingUrl.trim().slice(0, 400)
            : "";
        const notes =
          typeof shipment.notes === "string"
            ? shipment.notes.trim().slice(0, 400)
            : "";
        if (!courier || !trackingNumber) {
          return json(400, {
            error: "Courier and tracking number are required",
          });
        }
        if (trackingUrlRaw && !/^https?:\/\//i.test(trackingUrlRaw)) {
          return json(400, {
            error: "Tracking URL must start with http(s)://",
          });
        }
        // Optional shippedAt — admin can backfill the actual drop-off
        // date (e.g. "I shipped it yesterday but only typed the AWB
        // in now"). Defaults to the existing shippedAt on update, or
        // "now" on first set.
        const shippedAtRaw =
          typeof shipment.shippedAt === "string"
            ? shipment.shippedAt.trim()
            : "";
        let shippedAt;
        if (shippedAtRaw) {
          const t = new Date(shippedAtRaw).getTime();
          if (Number.isNaN(t)) {
            return json(400, { error: "Invalid shippedAt date" });
          }
          shippedAt = new Date(t).toISOString();
        } else {
          shippedAt = existing.shipment?.shippedAt || new Date().toISOString();
        }
        const safeShipment = {
          courier,
          trackingNumber,
          ...(trackingUrlRaw ? { trackingUrl: trackingUrlRaw } : {}),
          ...(notes ? { notes } : {}),
          shippedAt,
          updatedAt: new Date().toISOString(),
        };
        const isNew =
          !existing.shipment ||
          existing.shipment.trackingNumber !== safeShipment.trackingNumber ||
          existing.shipment.courier !== safeShipment.courier;
        if (isNew) {
          const note = {
            type: "shipped",
            message: `Your order has shipped via ${courier} (tracking ${trackingNumber}).`,
            recipient: existing.orderInfo?.email || "",
            sentAt: new Date().toISOString(),
          };
          const shipExtra = {
            shipment: safeShipment,
            trackingUrl: safeShipment.trackingUrl,
            courier: safeShipment.courier,
            trackingNumber: safeShipment.trackingNumber,
          };
          await recordEmail(
            { ...existing, shipment: safeShipment },
            note,
            shipExtra,
          );
          // Note.type is "shipped" (legacy), which is not in ORDER_PUSH_KINDS,
          // so recordPush will skip with reason="unknown kind". The actual
          // user-facing push for shipping fires via the matching
          // "out_for_delivery" status update.
          await recordPush(
            { ...existing, shipment: safeShipment },
            note,
            shipExtra,
          );
          notifications.push(note);
          activityLog.push({
            at: new Date().toISOString(),
            type: "shipment:set",
            actor: "admin",
            ...meta,
          });
          await appendAuditEvent(event, {
            type: "order.shipment",
            outcome: "set",
            subject: orderId,
            detail: `${courier} ${trackingNumber}`,
            ...meta,
          });
        } else {
          activityLog.push({
            at: new Date().toISOString(),
            type: "shipment:updated",
            actor: "admin",
            ...meta,
          });
        }
        // When the AWB is set on an order that's still in the
        // confirmed / in-progress phase, auto-bump status to
        // out_for_delivery so admin doesn't have to remember the
        // separate Mark-Shipped click. We deliberately DON'T fire the
        // status-change customer email here — the shipment-set email
        // above (with courier + AWB) already covers it, and we don't
        // want the buyer to receive two emails for one shipping event.
        let nextStatus = existing.status;
        if (
          isNew &&
          (existing.status === "confirmed" || existing.status === "in_progress")
        ) {
          nextStatus = "out_for_delivery";
          activityLog.push({
            at: new Date().toISOString(),
            type: "status:out_for_delivery",
            actor: "admin-auto",
            ...meta,
          });
          await appendAuditEvent(event, {
            type: "order.status",
            outcome: "out_for_delivery",
            subject: orderId,
            detail: "Auto-bumped via shipment set",
            ...meta,
          });
        }
        orders[idx] = {
          ...existing,
          status: nextStatus,
          shipment: safeShipment,
          notifications,
          activityLog,
        };
        await store.setJSON(ORDERS_KEY, orders);
        return json(200, { order: orders[idx] });
      }

      if (action === "submit-review") {
        const limit = await consumeRateLimit(event, {
          bucket: "submit-review",
          windowMs: 60_000,
          max: 5,
        });
        if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
        const { orderId, review } = body;
        if (!orderId || typeof orderId !== "string") {
          return json(400, { error: "Invalid orderId" });
        }
        if (!review || typeof review !== "object") {
          return json(400, { error: "Invalid review" });
        }
        const rating = Math.floor(Number(review.rating));
        if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
          return json(400, { error: "Rating must be between 1 and 5" });
        }
        const text = typeof review.text === "string" ? review.text.trim() : "";
        if (text.length > 5000) {
          return json(400, { error: "Review text too long" });
        }
        const rawImages = Array.isArray(review.images) ? review.images : [];
        if (rawImages.length > 5) {
          return json(400, { error: "Maximum 5 images allowed" });
        }
        const images = [];
        for (const img of rawImages) {
          if (typeof img !== "string") continue;
          if (img.length > 800_000) {
            return json(400, { error: "Image too large (max ~600KB each)" });
          }
          if (!/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(img)) {
            return json(400, { error: "Invalid image format" });
          }
          images.push(img);
        }
        const orders = await readOrders(store);
        const idx = orders.findIndex((o) => o.id === orderId);
        if (idx === -1) return json(404, { error: "Order not found" });
        if (orders[idx].status !== "received") {
          return json(400, {
            error: "Reviews can only be submitted after the order is received",
          });
        }
        const productId =
          typeof review.productId === "string" && review.productId.trim()
            ? review.productId.trim().slice(0, 200)
            : "";
        const productTitle =
          typeof review.productTitle === "string"
            ? review.productTitle.slice(0, 200)
            : undefined;
        const productImage =
          typeof review.productImage === "string" &&
          review.productImage.length <= 800_000
            ? review.productImage
            : undefined;
        const existingReviews = Array.isArray(orders[idx].reviews)
          ? orders[idx].reviews
          : orders[idx].review
            ? [orders[idx].review]
            : [];
        const alreadyReviewed = existingReviews.some(
          (r) => (r.productId || "") === productId,
        );
        if (alreadyReviewed) {
          return json(409, {
            error: productId
              ? "This painting has already been reviewed"
              : "Review already submitted",
          });
        }
        const safeReview = {
          rating,
          text: text.slice(0, 5000),
          images,
          submittedAt: new Date().toISOString(),
          ...(productId ? { productId } : {}),
          ...(productTitle ? { productTitle } : {}),
          ...(productImage ? { productImage } : {}),
        };
        const nextReviews = [...existingReviews, safeReview];
        const reviewMeta = captureRequestMeta(event);
        const reviewActivity = Array.isArray(orders[idx].activityLog)
          ? [...orders[idx].activityLog]
          : [];
        reviewActivity.push({
          at: new Date().toISOString(),
          type: "review",
          actor: "customer",
          ...reviewMeta,
        });
        orders[idx] = {
          ...orders[idx],
          review: safeReview,
          reviews: nextReviews,
          activityLog: reviewActivity,
        };
        await store.setJSON(ORDERS_KEY, orders);
        await appendAuditEvent(event, {
          type: "order.review",
          outcome: "submitted",
          subject: orderId,
          detail: `${rating}-star review`,
          ...reviewMeta,
        });
        const {
          orderInfo: _pii,
          requestMeta: _rm,
          activityLog: _al,
          ...publicOrder
        } = orders[idx];
        return json(200, { order: publicOrder });
      }

      if (action === "set-review-published") {
        if (!(await isAuthenticated(event))) {
          return json(401, { error: "Not authenticated" });
        }
        const { orderId, publishedToHomepage, productId } = body;
        if (!orderId || typeof orderId !== "string") {
          return json(400, { error: "Invalid orderId" });
        }
        if (typeof publishedToHomepage !== "boolean") {
          return json(400, { error: "publishedToHomepage must be a boolean" });
        }
        const targetProductId =
          typeof productId === "string" ? productId.trim() : "";
        const orders = await readOrders(store);
        const idx = orders.findIndex((o) => o.id === orderId);
        if (idx === -1) return json(404, { error: "Order not found" });
        const existing = orders[idx];
        const reviewsList = Array.isArray(existing.reviews)
          ? existing.reviews
          : existing.review
            ? [existing.review]
            : [];
        if (reviewsList.length === 0) {
          return json(400, { error: "Order has no review" });
        }
        let matched = false;
        const updatedReviews = reviewsList.map((r) => {
          if ((r.productId || "") === targetProductId) {
            matched = true;
            return { ...r, publishedToHomepage };
          }
          return r;
        });
        if (!matched) {
          return json(404, { error: "Review for that product not found" });
        }
        const legacyReview =
          existing.review &&
          (existing.review.productId || "") === targetProductId
            ? { ...existing.review, publishedToHomepage }
            : existing.review;
        orders[idx] = {
          ...existing,
          reviews: updatedReviews,
          review: legacyReview,
        };
        await store.setJSON(ORDERS_KEY, orders);
        return json(200, { order: orders[idx] });
      }

      if (action === "update-review") {
        if (!(await isAuthenticated(event))) {
          return json(401, { error: "Not authenticated" });
        }
        const { orderId, productId, rating, text } = body;
        if (!orderId || typeof orderId !== "string") {
          return json(400, { error: "Invalid orderId" });
        }
        const targetProductId =
          typeof productId === "string" ? productId.trim() : "";
        const patch = {};
        if (rating !== undefined) {
          const r = Math.floor(Number(rating));
          if (!Number.isFinite(r) || r < 1 || r > 5) {
            return json(400, { error: "Rating must be between 1 and 5" });
          }
          patch.rating = r;
        }
        if (text !== undefined) {
          if (typeof text !== "string") {
            return json(400, { error: "Invalid review text" });
          }
          if (text.trim().length === 0) {
            return json(400, { error: "Review text cannot be empty" });
          }
          if (text.length > 5000) {
            return json(400, { error: "Review text too long" });
          }
          patch.text = text.slice(0, 5000);
        }
        if (Object.keys(patch).length === 0) {
          return json(400, { error: "Nothing to update" });
        }
        const orders = await readOrders(store);
        const idx = orders.findIndex((o) => o.id === orderId);
        if (idx === -1) return json(404, { error: "Order not found" });
        const existing = orders[idx];
        const reviewsList = Array.isArray(existing.reviews)
          ? existing.reviews
          : existing.review
            ? [existing.review]
            : [];
        if (reviewsList.length === 0) {
          return json(400, { error: "Order has no review" });
        }
        let matched = false;
        const updatedReviews = reviewsList.map((r) => {
          if ((r.productId || "") === targetProductId) {
            matched = true;
            return { ...r, ...patch, editedAt: new Date().toISOString() };
          }
          return r;
        });
        if (!matched) {
          return json(404, { error: "Review for that product not found" });
        }
        const legacyReview =
          existing.review &&
          (existing.review.productId || "") === targetProductId
            ? {
                ...existing.review,
                ...patch,
                editedAt: new Date().toISOString(),
              }
            : existing.review;
        orders[idx] = {
          ...existing,
          reviews: updatedReviews,
          review: legacyReview,
        };
        await store.setJSON(ORDERS_KEY, orders);
        await appendAuditEvent(event, {
          type: "order.review",
          outcome: "edited",
          subject: orderId,
          detail: `Edited review for product ${targetProductId || "(legacy)"}`,
        });
        return json(200, { order: orders[idx] });
      }

      if (action === "delete-review") {
        if (!(await isAuthenticated(event))) {
          return json(401, { error: "Not authenticated" });
        }
        const { orderId, productId } = body;
        if (!orderId || typeof orderId !== "string") {
          return json(400, { error: "Invalid orderId" });
        }
        const targetProductId =
          typeof productId === "string" ? productId.trim() : "";
        const orders = await readOrders(store);
        const idx = orders.findIndex((o) => o.id === orderId);
        if (idx === -1) return json(404, { error: "Order not found" });
        const existing = orders[idx];
        const reviewsList = Array.isArray(existing.reviews)
          ? existing.reviews
          : existing.review
            ? [existing.review]
            : [];
        if (reviewsList.length === 0) {
          return json(400, { error: "Order has no review" });
        }
        const remaining = reviewsList.filter(
          (r) => (r.productId || "") !== targetProductId,
        );
        if (remaining.length === reviewsList.length) {
          return json(404, { error: "Review for that product not found" });
        }
        const legacyReview =
          existing.review &&
          (existing.review.productId || "") === targetProductId
            ? null
            : existing.review;
        orders[idx] = {
          ...existing,
          reviews: remaining,
          review: legacyReview,
        };
        await store.setJSON(ORDERS_KEY, orders);
        await appendAuditEvent(event, {
          type: "order.review",
          outcome: "deleted",
          subject: orderId,
          detail: `Deleted review for product ${targetProductId || "(legacy)"}`,
        });
        return json(200, { order: orders[idx] });
      }

      if (action === "set-review-reply") {
        if (!(await isAuthenticated(event))) {
          return json(401, { error: "Not authenticated" });
        }
        const { orderId, productId, reply } = body;
        if (!orderId || typeof orderId !== "string") {
          return json(400, { error: "Invalid orderId" });
        }
        const targetProductId =
          typeof productId === "string" ? productId.trim() : "";
        if (typeof reply !== "string") {
          return json(400, { error: "Invalid reply" });
        }
        const trimmed = reply.trim().slice(0, 2000);
        const orders = await readOrders(store);
        const idx = orders.findIndex((o) => o.id === orderId);
        if (idx === -1) return json(404, { error: "Order not found" });
        const existing = orders[idx];
        const reviewsList = Array.isArray(existing.reviews)
          ? existing.reviews
          : existing.review
            ? [existing.review]
            : [];
        if (reviewsList.length === 0) {
          return json(400, { error: "Order has no review" });
        }
        let matched = false;
        const now = new Date().toISOString();
        const adminReply = trimmed ? { text: trimmed, repliedAt: now } : null;
        const updatedReviews = reviewsList.map((r) => {
          if ((r.productId || "") === targetProductId) {
            matched = true;
            return { ...r, adminReply };
          }
          return r;
        });
        if (!matched) {
          return json(404, { error: "Review for that product not found" });
        }
        const legacyReview =
          existing.review &&
          (existing.review.productId || "") === targetProductId
            ? { ...existing.review, adminReply }
            : existing.review;
        orders[idx] = {
          ...existing,
          reviews: updatedReviews,
          review: legacyReview,
        };
        await store.setJSON(ORDERS_KEY, orders);
        await appendAuditEvent(event, {
          type: "order.review",
          outcome: adminReply ? "replied" : "reply-cleared",
          subject: orderId,
          detail: `Admin reply on review for ${targetProductId || "(legacy)"}`,
        });
        return json(200, { order: orders[idx] });
      }

      if (action === "bulk-set-review-published") {
        if (!(await isAuthenticated(event))) {
          return json(401, { error: "Not authenticated" });
        }
        const { items, publishedToHomepage } = body;
        if (typeof publishedToHomepage !== "boolean") {
          return json(400, { error: "publishedToHomepage must be a boolean" });
        }
        if (!Array.isArray(items) || items.length === 0) {
          return json(400, { error: "items array required" });
        }
        const targets = new Map();
        for (const it of items) {
          if (!it || typeof it !== "object") continue;
          const oid = String(it.orderId || "");
          const pid = String(it.productId || "");
          if (!oid) continue;
          if (!targets.has(oid)) targets.set(oid, new Set());
          targets.get(oid).add(pid);
        }
        if (targets.size === 0) {
          return json(400, { error: "No valid items" });
        }
        const orders = await readOrders(store);
        let updated = 0;
        for (let i = 0; i < orders.length; i++) {
          const o = orders[i];
          const productSet = targets.get(o.id);
          if (!productSet) continue;
          const reviewsList = Array.isArray(o.reviews)
            ? o.reviews
            : o.review
              ? [o.review]
              : [];
          if (reviewsList.length === 0) continue;
          let changed = false;
          const updatedReviews = reviewsList.map((r) => {
            if (productSet.has(r.productId || "")) {
              changed = true;
              return { ...r, publishedToHomepage };
            }
            return r;
          });
          if (!changed) continue;
          const legacyReview =
            o.review && productSet.has(o.review.productId || "")
              ? { ...o.review, publishedToHomepage }
              : o.review;
          orders[i] = {
            ...o,
            reviews: updatedReviews,
            review: legacyReview,
          };
          updated += 1;
        }
        if (updated > 0) {
          await store.setJSON(ORDERS_KEY, orders);
          await appendAuditEvent(event, {
            type: "order.review",
            outcome: publishedToHomepage
              ? "bulk-published"
              : "bulk-unpublished",
            subject: `${updated} review(s)`,
            detail: `Bulk ${publishedToHomepage ? "published" : "unpublished"} ${updated} review(s)`,
          });
        }
        return json(200, { ok: true, updated });
      }

      if (action === "request-refund") {
        if (!(await isAuthenticated(event))) {
          return json(401, { error: "Not authenticated" });
        }
        const { orderId, reason } = body;
        const VALID_REASONS = new Set([
          "duplicate",
          "fraudulent",
          "requested_by_customer",
          "others",
        ]);
        const refundReason = VALID_REASONS.has(reason)
          ? reason
          : "requested_by_customer";
        if (!orderId || typeof orderId !== "string") {
          return json(400, { error: "Invalid orderId" });
        }
        const orders = await readOrders(store);
        const idx = orders.findIndex((o) => o.id === orderId);
        if (idx === -1) return json(404, { error: "Order not found" });
        const existing = orders[idx];
        if (existing.refund && existing.refund.status !== "failed") {
          return json(409, { error: "Refund already in progress" });
        }
        if (!existing.paymentIntentId) {
          return json(400, {
            error:
              "This order has no PayMongo paymentIntentId; cannot refund automatically",
          });
        }
        const secretKey = getPaymongoSecret();
        if (!secretKey) {
          return json(500, { error: "Payment not configured" });
        }
        let intent;
        try {
          intent = await payMongoRequest(
            `/v1/payment_intents/${existing.paymentIntentId}`,
            secretKey,
            null,
            "GET",
          );
        } catch (e) {
          return json(502, {
            error: "Could not load payment from PayMongo",
            detail: e instanceof Error ? e.message : String(e),
          });
        }
        const payments = intent?.data?.attributes?.payments;
        if (!Array.isArray(payments) || payments.length === 0) {
          return json(400, {
            error: "No completed payment to refund on this intent",
          });
        }
        const lastPayment = payments[payments.length - 1];
        const paymentId = lastPayment?.id;
        const paymentStatus = lastPayment?.attributes?.status;
        if (!paymentId || paymentStatus !== "paid") {
          return json(400, {
            error: `Payment is not refundable (status: ${paymentStatus || "unknown"})`,
          });
        }
        const amountInCentavos = Math.round(Number(existing.total || 0) * 100);
        if (amountInCentavos <= 0) {
          return json(400, { error: "Invalid refund amount" });
        }
        let refund;
        try {
          refund = await payMongoRequest("/v1/refunds", secretKey, {
            data: {
              attributes: {
                amount: amountInCentavos,
                payment_id: paymentId,
                reason: refundReason,
                currency: "PHP",
                notes: `Manual refund for order ${existing.id}`,
              },
            },
          });
        } catch (e) {
          return json(502, {
            error: "Refund creation failed",
            detail: e instanceof Error ? e.message : String(e),
          });
        }
        const refundData = refund?.data;
        const refundAttrs = refundData?.attributes || {};
        const refundRecord = {
          id: refundData?.id || "",
          paymentId,
          amount: Number(existing.total) || 0,
          status: refundAttrs.status || "pending",
          reason: refundReason,
          requestedAt: new Date().toISOString(),
          completedAt:
            refundAttrs.status === "succeeded" ||
            refundAttrs.status === "failed"
              ? new Date().toISOString()
              : undefined,
        };
        const recipient = existing.orderInfo?.email || "";
        const notifications = Array.isArray(existing.notifications)
          ? [...existing.notifications]
          : [];
        const refundRequestedNote = {
          type: "refund_requested",
          message: `Your refund of \u20b1${refundRecord.amount.toLocaleString()} has been initiated and is being processed via QR Ph back to your wallet.`,
          recipient,
          sentAt: new Date().toISOString(),
        };
        await recordEmail(
          { ...existing, refund: refundRecord },
          refundRequestedNote,
          { refundAmount: refundRecord.amount },
        );
        await recordPush(
          { ...existing, refund: refundRecord },
          refundRequestedNote,
          { refundAmount: refundRecord.amount },
        );
        notifications.push(refundRequestedNote);
        if (refundRecord.status === "succeeded") {
          const refundDoneNote = {
            type: "refund_succeeded",
            message: `Your refund of \u20b1${refundRecord.amount.toLocaleString()} has been completed.`,
            recipient,
            sentAt: new Date().toISOString(),
          };
          await recordEmail(
            { ...existing, refund: refundRecord },
            refundDoneNote,
            { refundAmount: refundRecord.amount },
          );
          await recordPush(
            { ...existing, refund: refundRecord },
            refundDoneNote,
            { refundAmount: refundRecord.amount },
          );
          notifications.push(refundDoneNote);
        }
        const refundMeta = captureRequestMeta(event);
        const refundActivity = Array.isArray(existing.activityLog)
          ? [...existing.activityLog]
          : [];
        refundActivity.push({
          at: new Date().toISOString(),
          type: "refund-requested",
          actor: "admin",
          ...refundMeta,
        });
        orders[idx] = {
          ...existing,
          refund: refundRecord,
          notifications,
          activityLog: refundActivity,
        };
        await store.setJSON(ORDERS_KEY, orders);
        await appendAuditEvent(event, {
          type: "order.refund",
          outcome: refundRecord.status,
          subject: orderId,
          detail: `Refund ₱${refundRecord.amount.toLocaleString()} (${refundReason})`,
          ...refundMeta,
        });
        await recordPiiAccess(event, {
          resource: "order",
          action: "refund",
          target: recipient,
          detail: `${orderId} refund ₱${refundRecord.amount.toLocaleString()} (${refundReason})`,
        });
        return json(200, { order: orders[idx] });
      }

      if (action === "check-refund") {
        const { orderId } = body;
        if (!orderId || typeof orderId !== "string") {
          return json(400, { error: "Invalid orderId" });
        }
        const orders = await readOrders(store);
        const idx = orders.findIndex((o) => o.id === orderId);
        if (idx === -1) return json(404, { error: "Order not found" });
        const existing = orders[idx];
        const refund = existing.refund;
        if (!refund?.id) {
          return json(400, { error: "No refund on this order" });
        }
        const isAdmin = await isAuthenticated(event);
        const sanitize = (o) => {
          if (isAdmin) return o;
          const { orderInfo, requestMeta: _rm, activityLog: _al, ...rest } = o;
          return {
            ...rest,
            orderInfo: orderInfo
              ? {
                  fullName: orderInfo.fullName,
                  city: orderInfo.city,
                  email: maskEmail(orderInfo.email),
                }
              : undefined,
          };
        };
        if (refund.status === "succeeded" || refund.status === "failed") {
          return json(200, { order: sanitize(existing) });
        }
        const secretKey = getPaymongoSecret();
        if (!secretKey) {
          return json(500, { error: "Payment not configured" });
        }
        let latest;
        try {
          latest = await payMongoRequest(
            `/v1/refunds/${refund.id}`,
            secretKey,
            null,
            "GET",
          );
        } catch (e) {
          return json(502, {
            error: "Could not load refund status from PayMongo",
            detail: e instanceof Error ? e.message : String(e),
          });
        }
        const attrs = latest?.data?.attributes || {};
        const newStatus = attrs.status || refund.status;
        const notifications = Array.isArray(existing.notifications)
          ? [...existing.notifications]
          : [];
        const recipient = existing.orderInfo?.email || "";
        const updatedRefund = { ...refund, status: newStatus };
        if (newStatus !== refund.status) {
          if (newStatus === "succeeded") {
            updatedRefund.completedAt = new Date().toISOString();
            const note = {
              type: "refund_succeeded",
              message: `Your refund of \u20b1${refund.amount.toLocaleString()} has been completed and credited back to your QR Ph wallet.`,
              recipient,
              sentAt: new Date().toISOString(),
            };
            await recordEmail({ ...existing, refund: updatedRefund }, note, {
              refundAmount: refund.amount,
            });
            await recordPush({ ...existing, refund: updatedRefund }, note, {
              refundAmount: refund.amount,
            });
            notifications.push(note);
          } else if (newStatus === "failed") {
            updatedRefund.completedAt = new Date().toISOString();
            updatedRefund.failureMessage =
              attrs.failure_reason || attrs.failure_message || "Refund failed";
            const note = {
              type: "refund_failed",
              message: `Your refund could not be processed: ${updatedRefund.failureMessage}. Please contact support.`,
              recipient,
              sentAt: new Date().toISOString(),
            };
            await recordEmail({ ...existing, refund: updatedRefund }, note, {
              refundAmount: refund.amount,
              failureMessage: updatedRefund.failureMessage,
            });
            await recordPush({ ...existing, refund: updatedRefund }, note, {
              refundAmount: refund.amount,
              failureMessage: updatedRefund.failureMessage,
            });
            notifications.push(note);
          }
        }
        orders[idx] = {
          ...existing,
          refund: updatedRefund,
          notifications,
        };
        await store.setJSON(ORDERS_KEY, orders);
        return json(200, { order: sanitize(orders[idx]) });
      }

      return json(400, { error: "Unknown action" });
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    logError("orders handler error:", error);
    return json(500, { error: "Internal error" });
  }
};

export const onRequest = wrapHandler(handler);
