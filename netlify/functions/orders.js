import { connectLambda, getStore } from "@netlify/blobs";
import crypto from "node:crypto";
import { isAuthenticated } from "../lib/admin-auth.js";

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

const findEligiblePromo = (config, code) => {
  if (!config || !Array.isArray(config.promoCodes)) return null;
  const upper = String(code || "")
    .trim()
    .toUpperCase();
  if (!upper) return null;
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
  return Math.min(promo.value, subtotal);
};

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
      const idx = config.promoCodes.findIndex((p) => p.code === upper);
      const next = { ...config };
      next.promoCodes = config.promoCodes.map((p, i) =>
        i === idx ? { ...p, usageCount: (p.usageCount || 0) + 1 } : p,
      );
      const writeOpts = result.etag ? { onlyIfMatch: result.etag } : {};
      const write = await configStore.setJSON(CONFIG_KEY, next, writeOpts);
      if (write.modified) return;
      // CAS conflict — retry with a fresh read.
    }
    console.warn("incrementPromoUsage: gave up after 5 CAS attempts", code);
  } catch (err) {
    console.error("incrementPromoUsage failed:", err);
  }
};

const readStorefrontConfigDirect = async (event) => {
  try {
    connectLambda(event);
    const configStore = getStore(CONFIG_STORE_NAME);
    return await configStore.get(CONFIG_KEY, { type: "json" });
  } catch (err) {
    console.error("readStorefrontConfigDirect failed:", err);
    return null;
  }
};

const jsonHeaders = { "Content-Type": "application/json" };

const json = (statusCode, body) => ({
  statusCode,
  headers: jsonHeaders,
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

const getOrdersStore = (event) => {
  connectLambda(event);
  return getStore(STORE_NAME);
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
      if (params.reviews === "published") {
        const orders = await readOrders(store);
        const reviews = [];
        for (const o of orders) {
          if (!o.review || !o.review.publishedToHomepage) continue;
          const firstName = (o.orderInfo?.fullName || "")
            .trim()
            .split(/\s+/)[0];
          reviews.push({
            orderId: o.id,
            rating: o.review.rating,
            text: o.review.text,
            images: Array.isArray(o.review.images) ? o.review.images : [],
            submittedAt: o.review.submittedAt,
            customerName: firstName || "Customer",
            customerCity: o.orderInfo?.city || "",
          });
        }
        reviews.sort(
          (a, b) =>
            new Date(b.submittedAt).getTime() -
            new Date(a.submittedAt).getTime(),
        );
        return json(200, { reviews });
      }

      if (params.id) {
        const orders = await readOrders(store);
        const order = orders.find((o) => o.id === params.id);
        if (!order) return json(404, { error: "Order not found" });
        const { orderInfo, ...rest } = order;
        const publicOrderInfo = orderInfo
          ? {
              fullName: orderInfo.fullName,
              city: orderInfo.city,
              email: orderInfo.email,
            }
          : undefined;
        return json(200, {
          order: { ...rest, orderInfo: publicOrderInfo },
        });
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
          },
        );
        return json(200, { summary });
      }

      if (!(await isAuthenticated(event))) {
        return json(401, { error: "Not authenticated" });
      }
      const orders = await readOrders(store);
      return json(200, { orders });
    }

    if (method === "POST") {
      const body = parseBody(event.body);
      const action = body.action;

      if (action === "place") {
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
            if (expected > 0 && Math.abs(expected - clientDiscount) <= 1) {
              validatedVoucherCode = clientVoucher;
              validatedDiscount = expected;
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
          },
          subtotal: clientSubtotal,
          shippingFee: Number(order.shippingFee) || 0,
          discount: validatedDiscount,
          total:
            Number(order.total) - (clientDiscount - validatedDiscount) || 0,
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
          notifications: [],
          review: null,
        };
        const next = [safeOrder, ...orders];
        await store.setJSON(ORDERS_KEY, next);
        if (safeOrder.voucherCode && safeOrder.discount > 0) {
          await incrementPromoUsage(event, safeOrder.voucherCode);
        }
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
        if (statusChanged) {
          notifications.push({
            type: status,
            message: NOTIFICATION_MESSAGES[status],
            recipient,
            sentAt: new Date().toISOString(),
          });
        }
        orders[idx] = { ...existing, status, notifications };
        await store.setJSON(ORDERS_KEY, orders);
        return json(200, { order: orders[idx] });
      }

      if (action === "submit-review") {
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
        const text = typeof review.text === "string" ? review.text : "";
        if (text.trim().length < 500) {
          return json(400, {
            error: "Review text must be at least 500 characters",
          });
        }
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
        if (orders[idx].review) {
          return json(409, { error: "Review already submitted" });
        }
        const safeReview = {
          rating,
          text: text.slice(0, 5000),
          images,
          submittedAt: new Date().toISOString(),
        };
        orders[idx] = { ...orders[idx], review: safeReview };
        await store.setJSON(ORDERS_KEY, orders);
        const { orderInfo: _pii, ...publicOrder } = orders[idx];
        return json(200, { order: publicOrder });
      }

      if (action === "set-review-published") {
        if (!(await isAuthenticated(event))) {
          return json(401, { error: "Not authenticated" });
        }
        const { orderId, publishedToHomepage } = body;
        if (!orderId || typeof orderId !== "string") {
          return json(400, { error: "Invalid orderId" });
        }
        if (typeof publishedToHomepage !== "boolean") {
          return json(400, { error: "publishedToHomepage must be a boolean" });
        }
        const orders = await readOrders(store);
        const idx = orders.findIndex((o) => o.id === orderId);
        if (idx === -1) return json(404, { error: "Order not found" });
        const existing = orders[idx];
        if (!existing.review) {
          return json(400, { error: "Order has no review" });
        }
        const updatedReview = {
          ...existing.review,
          publishedToHomepage,
        };
        orders[idx] = { ...existing, review: updatedReview };
        await store.setJSON(ORDERS_KEY, orders);
        return json(200, { order: orders[idx] });
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
        notifications.push({
          type: "refund_requested",
          message: `Your refund of \u20b1${refundRecord.amount.toLocaleString()} has been initiated and is being processed via QR Ph back to your wallet.`,
          recipient,
          sentAt: new Date().toISOString(),
        });
        if (refundRecord.status === "succeeded") {
          notifications.push({
            type: "refund_succeeded",
            message: `Your refund of \u20b1${refundRecord.amount.toLocaleString()} has been completed.`,
            recipient,
            sentAt: new Date().toISOString(),
          });
        }
        orders[idx] = { ...existing, refund: refundRecord, notifications };
        await store.setJSON(ORDERS_KEY, orders);
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
        if (refund.status === "succeeded" || refund.status === "failed") {
          return json(200, { order: existing });
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
            notifications.push({
              type: "refund_succeeded",
              message: `Your refund of \u20b1${refund.amount.toLocaleString()} has been completed and credited back to your QR Ph wallet.`,
              recipient,
              sentAt: new Date().toISOString(),
            });
          } else if (newStatus === "failed") {
            updatedRefund.completedAt = new Date().toISOString();
            updatedRefund.failureMessage =
              attrs.failure_reason || attrs.failure_message || "Refund failed";
            notifications.push({
              type: "refund_failed",
              message: `Your refund could not be processed: ${updatedRefund.failureMessage}. Please contact support.`,
              recipient,
              sentAt: new Date().toISOString(),
            });
          }
        }
        orders[idx] = {
          ...existing,
          refund: updatedRefund,
          notifications,
        };
        await store.setJSON(ORDERS_KEY, orders);
        return json(200, { order: orders[idx] });
      }

      return json(400, { error: "Unknown action" });
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    console.error("orders handler error:", error);
    return json(500, { error: "Could not manage orders" });
  }
};
