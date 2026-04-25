import { connectLambda, getStore } from "@netlify/blobs";
import crypto from "node:crypto";
import { isAuthenticated } from "../lib/admin-auth.js";

const STORE_NAME = "orders";
const ORDERS_KEY = "all-orders";

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
      if (params.id) {
        const orders = await readOrders(store);
        const order = orders.find((o) => o.id === params.id);
        if (!order) return json(404, { error: "Order not found" });
        const { orderInfo: _pii, ...publicOrder } = order;
        return json(200, { order: publicOrder });
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
          subtotal: Number(order.subtotal) || 0,
          shippingFee: Number(order.shippingFee) || 0,
          discount: Number(order.discount) || 0,
          total: Number(order.total),
          estimatedCreationDays: String(
            order.estimatedCreationDays || "",
          ).slice(0, 100),
          status: "confirmed",
          createdAt: new Date().toISOString(),
        };
        const next = [safeOrder, ...orders];
        await store.setJSON(ORDERS_KEY, next);
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
        orders[idx] = { ...orders[idx], status };
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
