// /api/push/* — Web Push subscription + admin endpoints.
//
// Routes:
//   GET  /api/push/vapid-key           Public read of the VAPID public key
//                                      (returned as base64url so the SW /
//                                      browser can pass it to PushManager).
//   POST /api/push/subscribe           Body: { email, subscription }.
//                                      Stores the subscription against the
//                                      shopper's email so future status
//                                      changes fan out to it.
//   POST /api/push/unsubscribe         Body: { email, endpoint }. Removes a
//                                      single device's subscription.
//   POST /api/push/test                Admin-only. Body: { email, kind?,
//                                      name? }. Sends a test push.
//
// Subscriptions are stored in the existing USERS KV namespace (see push.js).
// We don't authenticate the subscribe/unsubscribe routes because anyone with
// a valid push subscription has already proven the browser permission state;
// rate limiting and a per-email cap of 10 devices keep abuse bounded.

import { wrapHandler } from "../_lib/handler-wrapper.js";
import { connectLambda } from "../_lib/kv-stores.js";
import { isAuthenticated } from "../_lib/admin-auth.js";
import { withSecurityHeaders } from "../_lib/security-headers.js";
import { consumeRateLimit, rateLimitResponse } from "../_lib/rate-limit.js";
import {
  addPushSubscription,
  removePushSubscription,
  getVapidPublicKey,
  sendOrderTestPush,
  ORDER_PUSH_KINDS,
} from "../_lib/push.js";
import { isWebPushConfigured } from "../_lib/web-push.js";

const json = (statusCode, body) => ({
  statusCode,
  headers: withSecurityHeaders({ "Content-Type": "application/json" }),
  body: JSON.stringify(body),
});

const parseBody = (body) => {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
};

const handler = async (event) => {
  connectLambda(event);
  const method = event.httpMethod || "GET";
  // Pages Functions [[path]].js: event.path is the request pathname (e.g.
  // /api/push/subscribe). Strip to the trailing segment so we route on the
  // leaf without caring about the API prefix.
  const leaf =
    String(event.path || "")
      .split("/")
      .filter(Boolean)
      .pop() || "";

  if (method === "GET" && leaf === "vapid-key") {
    if (!isWebPushConfigured()) {
      return json(503, { error: "vapid-not-configured" });
    }
    const publicKey = getVapidPublicKey();
    return json(200, { publicKey });
  }

  if (method === "POST" && leaf === "subscribe") {
    const limit = await consumeRateLimit(event, {
      bucket: "push-subscribe",
      windowMs: 60_000,
      max: 20,
    });
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
    if (!isWebPushConfigured()) {
      return json(503, { error: "vapid-not-configured" });
    }
    const body = parseBody(event.body);
    const email = String(body.email || "").trim();
    const subscription = body.subscription;
    if (
      !email ||
      !email.includes("@") ||
      !subscription ||
      typeof subscription !== "object" ||
      typeof subscription.endpoint !== "string" ||
      !subscription.keys ||
      typeof subscription.keys.p256dh !== "string" ||
      typeof subscription.keys.auth !== "string"
    ) {
      return json(400, { error: "Invalid email or subscription" });
    }
    const ua = (event.headers && event.headers["user-agent"]) || "";
    const result = await addPushSubscription(email, subscription, ua);
    if (!result.added) {
      return json(400, { error: result.reason || "rejected" });
    }
    return json(200, { ok: true, count: result.count });
  }

  if (method === "POST" && leaf === "unsubscribe") {
    const limit = await consumeRateLimit(event, {
      bucket: "push-unsubscribe",
      windowMs: 60_000,
      max: 20,
    });
    if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
    const body = parseBody(event.body);
    const email = String(body.email || "").trim();
    const endpoint = String(body.endpoint || "").trim();
    if (!email || !endpoint) {
      return json(400, { error: "Invalid email or endpoint" });
    }
    const result = await removePushSubscription(email, endpoint);
    return json(200, {
      ok: true,
      removed: result.removed,
      count: result.count,
    });
  }

  if (method === "POST" && leaf === "test") {
    if (!(await isAuthenticated(event))) {
      return json(401, { error: "Not authenticated" });
    }
    const body = parseBody(event.body);
    const email = String(body.email || "").trim();
    const kindRaw = String(body.kind || "confirmed").trim();
    const kind = ORDER_PUSH_KINDS.includes(kindRaw) ? kindRaw : "confirmed";
    const name = String(body.name || "Canvas Hub collector").slice(0, 80);
    if (!email) return json(400, { error: "Missing email" });
    const result = await sendOrderTestPush({ email, kind, name });
    return json(200, { ok: !!result.delivered, result });
  }

  return json(404, { error: "Not found" });
};

export const onRequest = wrapHandler(handler);
