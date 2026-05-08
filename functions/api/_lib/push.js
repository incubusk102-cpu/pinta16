// High-level Web Push helpers — the equivalent of email.js' sendOrderEmail
// for the push channel. Mirrors the email pipeline 1:1:
//
//   loadOrderPushConfig()  ⇄  loadOrderEmailConfig()
//   sendOrderPush({ kind, order, extra })  ⇄  sendOrderEmail(...)
//   sendOrderTestPush(...)  ⇄  sendOrderTestEmail(...)
//
// Subscriptions are stored in the existing USERS KV namespace under keys of
// the form `push:sub:<normalizedEmail>`. The value is a JSON array of
// PushSubscription objects (so a single shopper can have multiple devices).
// We piggyback on USERS instead of provisioning a new KV namespace so that
// the deploy works out of the box without any new wrangler.toml binding.

import { getStore } from "./kv-stores.js";
import { getVapidEnv, isWebPushConfigured, sendPush } from "./web-push.js";

const SUBS_KEY = (email) => `push:sub:${email}`;

const normalizeEmail = (email) =>
  String(email || "")
    .trim()
    .toLowerCase()
    .slice(0, 200);

// All 7 status kinds the email pipeline already covers, plus two Push-only
// kinds for the in-progress sub-states:
//
//   - `production_stage` for the cut → frame → paint → varnish → packed
//     transitions themselves.
//   - `production_photo` for when the artist uploads a behind-the-scenes
//     photo at the current stage. This is the bigger UX win — a tiny
//     thumbnail in the customer's notification tray ("Your canvas is
//     being painted!") is much more reassuring than a text-only update.
//
// Email is not wired for either of these on purpose — adding 5–10 extra
// emails per order would feel spammy. A single tap-through native push
// is the right surface for both.
export const ORDER_PUSH_KINDS = [
  "confirmed",
  "in_progress",
  "out_for_delivery",
  "received",
  "refund_requested",
  "refund_succeeded",
  "refund_failed",
  "production_stage",
  "production_photo",
];

const ORIGIN = "https://canvhub.com";

// Defaults — admin can override per-kind via storefront-config. Keep titles
// short (~40 chars) and bodies tight (~110 chars) so they render cleanly in
// Android/iOS notification trays without truncation.
//
// Mustache placeholders mirror the email side: {{name}}, {{orderId}},
// {{trackingNumber}}, {{courier}}, {{trackingUrl}}, {{refundAmount}},
// {{failureMessage}}.
export const DEFAULT_ORDER_PUSH = {
  enabled: true,
  kinds: {
    confirmed: {
      enabled: true,
      title: "Order {{orderId}} confirmed",
      body: "Hi {{name}}, your Canvas Hub order is confirmed. We'll let you know when it's on the way.",
    },
    in_progress: {
      enabled: true,
      title: "Your painting is in progress",
      body: "The artist has started working on order {{orderId}}. You'll get another nudge when it ships.",
    },
    out_for_delivery: {
      enabled: true,
      title: "Order {{orderId}} is on the way",
      body: "{{courier}} has your painting. Track it anytime from your Canvas Hub account.",
    },
    received: {
      enabled: true,
      title: "Order {{orderId}} delivered",
      body: "Welcome home, painting. We'd love a quick review when you've had a chance to live with it.",
    },
    refund_requested: {
      enabled: true,
      title: "Refund request received",
      body: "We've logged your refund for order {{orderId}}. We'll update you once it's processed.",
    },
    refund_succeeded: {
      enabled: true,
      title: "Refund completed",
      body: "Refund of ₱{{refundAmount}} for order {{orderId}} has landed. Allow up to 5 business days for posting.",
    },
    refund_failed: {
      enabled: true,
      title: "Refund needs attention",
      body: "Your refund for order {{orderId}} could not be completed: {{failureMessage}}. We'll reach out.",
    },
    production_stage: {
      enabled: true,
      title: "Order {{orderId}} · {{stageLabel}}",
      body: "{{stageMessage}}",
    },
    production_photo: {
      enabled: true,
      title: "New photo · {{stageLabel}}",
      body: "The artist just shared a progress shot of order {{orderId}}. Tap to peek.",
    },
  },
};

export const sanitizeOrderPush = (raw) => {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_ORDER_PUSH };
  const out = {
    enabled: raw.enabled !== false,
    kinds: { ...DEFAULT_ORDER_PUSH.kinds },
  };
  if (raw.kinds && typeof raw.kinds === "object") {
    for (const kind of ORDER_PUSH_KINDS) {
      const dflt = DEFAULT_ORDER_PUSH.kinds[kind];
      const k = raw.kinds[kind];
      if (k && typeof k === "object") {
        out.kinds[kind] = {
          enabled: k.enabled !== false,
          title:
            typeof k.title === "string" && k.title.trim()
              ? k.title.trim().slice(0, 80)
              : dflt.title,
          body:
            typeof k.body === "string" && k.body.trim()
              ? k.body.trim().slice(0, 240)
              : dflt.body,
        };
      } else {
        out.kinds[kind] = dflt;
      }
    }
  }
  return out;
};

export const loadOrderPushConfig = async () => {
  try {
    const store = getStore("storefront-config");
    const raw = await store.get("config", { type: "json" });
    if (!raw || typeof raw !== "object") return null;
    if (!raw.orderPush || typeof raw.orderPush !== "object") return null;
    return sanitizeOrderPush(raw.orderPush);
  } catch {
    return null;
  }
};

const fillMustache = (template, vars) =>
  String(template || "").replace(
    /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g,
    (_, k) => {
      const v = vars?.[k];
      if (v == null) return "";
      return String(v);
    },
  );

const buildPushPayload = (kind, order, extra, cfg) => {
  const kindCfg =
    (cfg && cfg.kinds && cfg.kinds[kind]) || DEFAULT_ORDER_PUSH.kinds[kind];
  const vars = {
    name: order?.orderInfo?.fullName?.split(/\s+/)[0] || "there",
    orderId: order?.id || "",
    trackingNumber:
      extra?.trackingNumber || order?.shipment?.trackingNumber || "",
    courier: extra?.courier || order?.shipment?.courier || "Your courier",
    trackingUrl:
      extra?.trackingUrl || order?.shipment?.trackingUrl || `${ORIGIN}/account`,
    refundAmount:
      typeof extra?.refundAmount === "number"
        ? extra.refundAmount.toLocaleString("en-PH")
        : typeof order?.refund?.amount === "number"
          ? order.refund.amount.toLocaleString("en-PH")
          : "",
    failureMessage:
      extra?.failureMessage || order?.refund?.failureMessage || "",
    stage: extra?.stage || order?.productionStage || "",
    stageLabel: extra?.stageLabel || "",
    stageMessage: extra?.stageMessage || "",
  };
  const title = fillMustache(kindCfg.title, vars);
  const body = fillMustache(kindCfg.body, vars);
  // For `production_photo`, lift the actual photo URL into the payload
  // image field so the OS shows it as a thumbnail in the notification
  // tray. We only honour absolute URLs (or our own /api/r/... paths
  // resolved against ORIGIN) — never raw user input — to avoid stuffing
  // arbitrary data into the OS-level notification surface.
  let image;
  if (kind === "production_photo" && typeof extra?.photoUrl === "string") {
    const raw = extra.photoUrl.trim();
    if (raw.startsWith("/api/r/")) image = `${ORIGIN}${raw}`;
    else if (raw.startsWith("https://")) image = raw;
  }
  return {
    title: title.slice(0, 80),
    body: body.slice(0, 240),
    icon: `${ORIGIN}/icon-192.png`,
    badge: `${ORIGIN}/icon-192.png`,
    ...(image ? { image } : {}),
    tag: order?.id ? `order-${order.id}-${kind}` : `order-${kind}`,
    url: order?.id
      ? `/account?orderId=${encodeURIComponent(order.id)}`
      : "/account",
    kind,
    orderId: order?.id || "",
  };
};

// Read all subscriptions for a normalized email.
const readSubs = async (store, email) => {
  if (!email) return [];
  try {
    const v = await store.get(SUBS_KEY(email), { type: "json" });
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

const writeSubs = async (store, email, subs) => {
  if (!email) return;
  if (!subs || subs.length === 0) {
    try {
      await store.delete(SUBS_KEY(email));
    } catch {
      /* ignore */
    }
    return;
  }
  await store.setJSON(SUBS_KEY(email), subs);
};

export const addPushSubscription = async (email, subscription, ua = "") => {
  const norm = normalizeEmail(email);
  if (!norm) return { added: false, reason: "no email" };
  if (
    !subscription ||
    !subscription.endpoint ||
    !subscription.keys?.p256dh ||
    !subscription.keys?.auth
  ) {
    return { added: false, reason: "invalid subscription" };
  }
  const store = getStore("users");
  const existing = await readSubs(store, norm);
  const filtered = existing.filter((s) => s.endpoint !== subscription.endpoint);
  filtered.push({
    endpoint: String(subscription.endpoint).slice(0, 2000),
    keys: {
      p256dh: String(subscription.keys.p256dh).slice(0, 200),
      auth: String(subscription.keys.auth).slice(0, 200),
    },
    ua: String(ua || "").slice(0, 200),
    createdAt: new Date().toISOString(),
  });
  // Cap to 10 devices per email to bound KV size.
  const trimmed = filtered.slice(-10);
  await writeSubs(store, norm, trimmed);
  return { added: true, count: trimmed.length };
};

export const removePushSubscription = async (email, endpoint) => {
  const norm = normalizeEmail(email);
  if (!norm) return { removed: false, reason: "no email" };
  const store = getStore("users");
  const existing = await readSubs(store, norm);
  const filtered = existing.filter((s) => s.endpoint !== endpoint);
  await writeSubs(store, norm, filtered);
  return {
    removed: existing.length !== filtered.length,
    count: filtered.length,
  };
};

const pruneExpired = async (store, email, expiredEndpoints) => {
  if (!expiredEndpoints.length) return;
  const norm = normalizeEmail(email);
  const existing = await readSubs(store, norm);
  const filtered = existing.filter(
    (s) => !expiredEndpoints.includes(s.endpoint),
  );
  await writeSubs(store, norm, filtered);
};

// Send an order-status push to all subscriptions registered against the
// order's customer email. Returns a summary; never throws — so callers can
// safely fire-and-forget alongside email.
export const sendOrderPush = async ({ kind, order, extra }) => {
  if (!ORDER_PUSH_KINDS.includes(kind)) {
    return { delivered: false, skipped: true, reason: "unknown kind" };
  }
  const recipient = normalizeEmail(order?.orderInfo?.email);
  if (!recipient) {
    return { delivered: false, skipped: true, reason: "no recipient" };
  }
  if (!isWebPushConfigured()) {
    return {
      delivered: false,
      skipped: true,
      reason: "vapid not configured",
    };
  }
  const cfg = (await loadOrderPushConfig()) || DEFAULT_ORDER_PUSH;
  if (cfg.enabled === false) {
    return { delivered: false, skipped: true, reason: "disabled" };
  }
  const kindCfg = cfg.kinds?.[kind] || DEFAULT_ORDER_PUSH.kinds[kind];
  if (kindCfg.enabled === false) {
    return { delivered: false, skipped: true, reason: "kind disabled" };
  }
  const store = getStore("users");
  const subs = await readSubs(store, recipient);
  if (subs.length === 0) {
    return {
      delivered: false,
      skipped: true,
      reason: "no subscriptions",
      provider: "webpush",
    };
  }
  const vapid = getVapidEnv();
  const payload = JSON.stringify(buildPushPayload(kind, order, extra, cfg));
  const expired = [];
  let okCount = 0;
  for (const sub of subs) {
    const res = await sendPush(sub, payload, vapid, { ttl: 86400 });
    if (res.ok) okCount += 1;
    else if (res.expired) expired.push(sub.endpoint);
  }
  if (expired.length) {
    pruneExpired(store, recipient, expired).catch(() => {
      /* swallow — we'll re-prune on next send */
    });
  }
  if (okCount === 0) {
    return {
      delivered: false,
      provider: "webpush",
      reason: "all targets failed or expired",
      attempted: subs.length,
      expired: expired.length,
    };
  }
  return {
    delivered: true,
    provider: "webpush",
    attempted: subs.length,
    successful: okCount,
    expired: expired.length,
  };
};

// Force-send a push to a single email so admins / opt-in flows can verify
// delivery without faking a real status change.
export const sendOrderTestPush = async ({ email, kind, name }) => {
  const recipient = normalizeEmail(email);
  if (!recipient)
    return { delivered: false, skipped: true, reason: "no recipient" };
  if (!isWebPushConfigured()) {
    return { delivered: false, skipped: true, reason: "vapid not configured" };
  }
  const safeKind = ORDER_PUSH_KINDS.includes(kind) ? kind : "confirmed";
  const fakeOrder = {
    id: "TEST-1234",
    orderInfo: { email: recipient, fullName: String(name || "Test collector") },
    shipment: { courier: "LBC", trackingNumber: "TEST-TRK-001" },
    refund: { amount: 1234, failureMessage: "" },
  };
  return await sendOrderPush({ kind: safeKind, order: fakeOrder, extra: {} });
};

// Public-facing handle so the frontend can grab the VAPID public key without
// hardcoding it in the client bundle (and so swapping keys server-side
// requires no client deploy).
export const getVapidPublicKey = () => {
  const env = getVapidEnv();
  return env ? env.publicKey : "";
};
