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
        return json(200, { order });
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
        const serverId = `ORD-${crypto.randomUUID().split("-")[0].toUpperCase()}`;
        const safeOrder = { ...order, id: serverId };
        const orders = await readOrders(store);
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
