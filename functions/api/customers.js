import { wrapHandler } from "./_lib/handler-wrapper.js";
import { connectLambda, getStore } from "./_lib/kv-stores.js";
import { isAuthenticated } from "./_lib/admin-auth.js";
import { recordPiiAccess } from "./_lib/audit-log.js";
import { withSecurityHeaders } from "./_lib/security-headers.js";
import { logError } from "./_lib/redact.js";

const json = (statusCode, body) => ({
  statusCode,
  headers: withSecurityHeaders(),
  body: JSON.stringify(body),
});

const ORDERS_STORE = "orders";
const ORDERS_KEY = "all-orders";
const USERS_STORE = "users";
const USERS_KEY = "users-by-email";
const META_STORE = "customer-meta";
const META_KEY = "all-meta";

const SEGMENT_VIP_MIN_LTV = 10000;
const SEGMENT_REPEAT_MIN_ORDERS = 2;
const SEGMENT_AT_RISK_DAYS = 60;

const parseBody = (body) => {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
};

const getStores = (event) => {
  connectLambda(event);
  return {
    orders: getStore(ORDERS_STORE),
    users: getStore(USERS_STORE),
    meta: getStore(META_STORE),
  };
};

const readOrders = async (store) => {
  const v = await store.get(ORDERS_KEY, { type: "json" });
  return Array.isArray(v) ? v : [];
};

const readUsers = async (store) => {
  const v = await store.get(USERS_KEY, { type: "json" });
  return v && typeof v === "object" ? v : {};
};

const readMeta = async (store) => {
  const v = await store.get(META_KEY, { type: "json" });
  return v && typeof v === "object" ? v : {};
};

const normalizeEmail = (email) =>
  String(email || "")
    .trim()
    .toLowerCase();

// Build per-customer aggregates by joining users + orders by email.
const aggregate = (users, orders, meta) => {
  const map = new Map();

  const ensure = (email) => {
    const key = normalizeEmail(email);
    if (!key) return null;
    if (!map.has(key)) {
      map.set(key, {
        email: key,
        name: "",
        registered: false,
        registeredAt: "",
        lastSeenAt: "",
        ordersCount: 0,
        grossSpend: 0,
        netSpend: 0,
        refundedAmount: 0,
        firstOrderAt: "",
        lastOrderAt: "",
        cities: new Set(),
        notes: "",
        tags: [],
      });
    }
    return map.get(key);
  };

  // Seed with registered users
  for (const u of Object.values(users)) {
    if (!u || !u.email) continue;
    const c = ensure(u.email);
    if (!c) continue;
    c.name = u.name || c.name;
    c.registered = true;
    c.registeredAt = u.createdAt || "";
    c.lastSeenAt = u.lastSeenAt || "";
  }

  // Layer in order data
  for (const o of orders) {
    const email = o?.orderInfo?.email;
    if (!email) continue;
    const c = ensure(email);
    if (!c) continue;
    if (!c.name && o.orderInfo.fullName) c.name = o.orderInfo.fullName;
    if (o.orderInfo.city) c.cities.add(o.orderInfo.city);
    const total = Number(o.total) || 0;
    const refunded =
      o.refund && o.refund.status === "succeeded"
        ? Number(o.refund.amount) || 0
        : 0;
    c.ordersCount += 1;
    c.grossSpend += total;
    c.refundedAmount += refunded;
    c.netSpend += total - refunded;
    const ts = o.createdAt || "";
    if (!c.firstOrderAt || (ts && ts < c.firstOrderAt)) c.firstOrderAt = ts;
    if (!c.lastOrderAt || (ts && ts > c.lastOrderAt)) c.lastOrderAt = ts;
  }

  // Layer in admin meta
  for (const [email, m] of Object.entries(meta)) {
    const c = ensure(email);
    if (!c || !m) continue;
    c.notes = String(m.notes || "");
    c.tags = Array.isArray(m.tags) ? m.tags.map((t) => String(t)) : [];
  }

  // Compute segment + finalize
  const now = Date.now();
  const result = [];
  for (const c of map.values()) {
    let segment = "new";
    const lastTs = c.lastOrderAt ? Date.parse(c.lastOrderAt) : NaN;
    const daysSinceOrder = Number.isFinite(lastTs)
      ? Math.floor((now - lastTs) / 86400000)
      : null;
    if (c.netSpend >= SEGMENT_VIP_MIN_LTV) {
      segment = "vip";
    } else if (
      c.ordersCount > 0 &&
      daysSinceOrder !== null &&
      daysSinceOrder > SEGMENT_AT_RISK_DAYS
    ) {
      segment = "at_risk";
    } else if (c.ordersCount >= SEGMENT_REPEAT_MIN_ORDERS) {
      segment = "repeat";
    } else if (c.ordersCount === 1) {
      segment = "one_time";
    } else {
      segment = "lead"; // registered but no orders yet
    }
    result.push({
      email: c.email,
      name: c.name,
      registered: c.registered,
      registeredAt: c.registeredAt,
      lastSeenAt: c.lastSeenAt,
      ordersCount: c.ordersCount,
      grossSpend: Math.round(c.grossSpend * 100) / 100,
      netSpend: Math.round(c.netSpend * 100) / 100,
      refundedAmount: Math.round(c.refundedAmount * 100) / 100,
      firstOrderAt: c.firstOrderAt,
      lastOrderAt: c.lastOrderAt,
      daysSinceOrder,
      cities: Array.from(c.cities),
      notes: c.notes,
      tags: c.tags,
      segment,
    });
  }
  // Sort by netSpend desc by default
  result.sort((a, b) => b.netSpend - a.netSpend);
  return result;
};

export const handler = async (event) => {
  try {
    const { orders, users, meta } = getStores(event);
    const params = event.queryStringParameters || {};
    const action = params.action || parseBody(event.body).action || "";

    if (event.httpMethod === "GET" && action === "list") {
      if (!(await isAuthenticated(event))) {
        return json(401, { error: "Admin authentication required" });
      }
      const [usersData, ordersData, metaData] = await Promise.all([
        readUsers(users),
        readOrders(orders),
        readMeta(meta),
      ]);
      const list = aggregate(usersData, ordersData, metaData);
      // Lightweight summary so the UI can render top-line stats without
      // recomputing on the client.
      const summary = list.reduce(
        (acc, c) => {
          acc.total += 1;
          if (c.segment === "vip") acc.vip += 1;
          if (c.segment === "repeat") acc.repeat += 1;
          if (c.segment === "at_risk") acc.atRisk += 1;
          if (c.segment === "lead") acc.leads += 1;
          if (c.segment === "one_time") acc.oneTime += 1;
          acc.totalLtv += c.netSpend;
          return acc;
        },
        {
          total: 0,
          vip: 0,
          repeat: 0,
          atRisk: 0,
          leads: 0,
          oneTime: 0,
          totalLtv: 0,
        },
      );
      summary.totalLtv = Math.round(summary.totalLtv * 100) / 100;
      await recordPiiAccess(event, {
        resource: "customer",
        action: "list",
        detail: `Listed ${list.length} customer(s)`,
      });
      return json(200, { customers: list, summary });
    }

    if (event.httpMethod === "GET" && action === "detail") {
      if (!(await isAuthenticated(event))) {
        return json(401, { error: "Admin authentication required" });
      }
      const email = normalizeEmail(params.email);
      if (!email) return json(400, { error: "email is required" });
      const ordersData = await readOrders(orders);
      const customerOrders = ordersData
        .filter((o) => normalizeEmail(o?.orderInfo?.email) === email)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      await recordPiiAccess(event, {
        resource: "customer",
        action: "view",
        target: email,
        detail: `Viewed customer detail (${customerOrders.length} order(s))`,
      });
      return json(200, { orders: customerOrders });
    }

    if (event.httpMethod === "POST" && action === "update-meta") {
      if (!(await isAuthenticated(event))) {
        return json(401, { error: "Admin authentication required" });
      }
      const body = parseBody(event.body);
      const email = normalizeEmail(body.email);
      if (!email) return json(400, { error: "email is required" });
      const notes = String(body.notes || "").slice(0, 4000);
      const tags = Array.isArray(body.tags)
        ? body.tags
            .map((t) => String(t).trim().slice(0, 32))
            .filter(Boolean)
            .slice(0, 16)
        : [];
      const existing = await readMeta(meta);
      existing[email] = { notes, tags, updatedAt: new Date().toISOString() };
      await meta.setJSON(META_KEY, existing);
      await recordPiiAccess(event, {
        resource: "customer",
        action: "update",
        target: email,
        detail: `Updated meta (${tags.length} tag(s), notes ${notes.length} chars)`,
      });
      return json(200, { ok: true, meta: existing[email] });
    }

    return json(400, { error: "Unknown action" });
  } catch (err) {
    logError("customers handler error:", err);
    return json(500, { error: "Internal error" });
  }
};

export const onRequest = wrapHandler(handler);
