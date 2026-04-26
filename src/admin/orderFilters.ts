/* Filter + saved-view helpers for the admin Orders screen. Pure logic and
 * localStorage glue; the actual UI lives inline in AdminPage.tsx so it can
 * share the orders state with the surrounding section.
 */

import type { CompletedOrder } from "@/contexts/CartContext";

export type OrderStatus = CompletedOrder["status"];

export const ORDER_STATUSES: OrderStatus[] = [
  "confirmed",
  "in_progress",
  "out_for_delivery",
  "received",
];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  confirmed: "Confirmed",
  in_progress: "In progress",
  out_for_delivery: "Out for delivery",
  received: "Received",
};

export type RefundFilter = "any" | "none" | "pending" | "succeeded" | "failed";
export type ShipmentFilter = "any" | "with" | "without";

export interface OrderFilter {
  search: string;
  statuses: OrderStatus[];
  refund: RefundFilter;
  shipment: ShipmentFilter;
  /** ISO date (yyyy-mm-dd) — inclusive lower bound. */
  from: string;
  /** ISO date (yyyy-mm-dd) — inclusive upper bound (end of day). */
  to: string;
}

export const EMPTY_FILTER: OrderFilter = {
  search: "",
  statuses: [],
  refund: "any",
  shipment: "any",
  from: "",
  to: "",
};

export const isFilterEmpty = (f: OrderFilter): boolean =>
  !f.search.trim() &&
  f.statuses.length === 0 &&
  f.refund === "any" &&
  f.shipment === "any" &&
  !f.from &&
  !f.to;

const lc = (v: unknown) =>
  typeof v === "string" ? v.toLowerCase() : String(v ?? "").toLowerCase();

const matchesSearch = (o: CompletedOrder, q: string): boolean => {
  if (!q) return true;
  const needle = q.toLowerCase();
  const haystack = [
    o.id,
    o.orderInfo?.fullName,
    o.orderInfo?.email,
    o.orderInfo?.phone,
    o.orderInfo?.address,
    o.orderInfo?.city,
    o.shipment?.trackingNumber,
    o.shipment?.courier,
    o.paymentIntentId,
    ...(o.items ?? []).map((i) => i.title),
  ]
    .map(lc)
    .join(" \u0001 ");
  return haystack.includes(needle);
};

const matchesDateRange = (
  o: CompletedOrder,
  from: string,
  to: string,
): boolean => {
  if (!from && !to) return true;
  const t = Date.parse(o.createdAt);
  if (Number.isNaN(t)) return false;
  if (from) {
    const fromTs = Date.parse(`${from}T00:00:00`);
    if (!Number.isNaN(fromTs) && t < fromTs) return false;
  }
  if (to) {
    const toTs = Date.parse(`${to}T23:59:59.999`);
    if (!Number.isNaN(toTs) && t > toTs) return false;
  }
  return true;
};

export const applyOrderFilter = (
  orders: CompletedOrder[],
  filter: OrderFilter,
): CompletedOrder[] => {
  return orders.filter((o) => {
    if (filter.statuses.length > 0 && !filter.statuses.includes(o.status)) {
      return false;
    }
    if (filter.refund === "none" && o.refund) return false;
    if (filter.refund !== "any" && filter.refund !== "none") {
      if (!o.refund || o.refund.status !== filter.refund) return false;
    }
    if (filter.shipment === "with" && !o.shipment?.trackingNumber) return false;
    if (filter.shipment === "without" && o.shipment?.trackingNumber) {
      return false;
    }
    if (!matchesDateRange(o, filter.from, filter.to)) return false;
    if (!matchesSearch(o, filter.search.trim())) return false;
    return true;
  });
};

/* ---------- Saved views (localStorage) ---------- */

const SAVED_VIEWS_KEY = "pintaterra_admin_order_views";

export interface SavedView {
  id: string;
  name: string;
  filter: OrderFilter;
  createdAt: string;
}

const safeRead = (): SavedView[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_VIEWS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is SavedView =>
        v &&
        typeof v === "object" &&
        typeof v.id === "string" &&
        typeof v.name === "string" &&
        v.filter &&
        typeof v.filter === "object",
    );
  } catch {
    return [];
  }
};

const safeWrite = (views: SavedView[]) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(views));
  } catch {
    /* quota / disabled storage — ignore */
  }
};

export const getSavedViews = (): SavedView[] => safeRead();

export const saveView = (name: string, filter: OrderFilter): SavedView[] => {
  const trimmed = name.trim();
  if (!trimmed) return safeRead();
  const views = safeRead();
  const existing = views.findIndex(
    (v) => v.name.toLowerCase() === trimmed.toLowerCase(),
  );
  const entry: SavedView = {
    id:
      existing >= 0
        ? views[existing].id
        : `view_${Date.now().toString(36)}_${Math.random()
            .toString(36)
            .slice(2, 8)}`,
    name: trimmed,
    filter: { ...EMPTY_FILTER, ...filter },
    createdAt: new Date().toISOString(),
  };
  if (existing >= 0) {
    views[existing] = entry;
  } else {
    views.push(entry);
  }
  safeWrite(views);
  return views;
};

export const deleteView = (id: string): SavedView[] => {
  const next = safeRead().filter((v) => v.id !== id);
  safeWrite(next);
  return next;
};

/* ---------- Description helper for the toolbar chips ---------- */

export const describeFilter = (f: OrderFilter): string => {
  const parts: string[] = [];
  if (f.search.trim()) parts.push(`"${f.search.trim()}"`);
  if (f.statuses.length > 0) {
    parts.push(f.statuses.map((s) => ORDER_STATUS_LABEL[s]).join(" / "));
  }
  if (f.refund !== "any") parts.push(`refund: ${f.refund}`);
  if (f.shipment !== "any") {
    parts.push(f.shipment === "with" ? "tracked" : "no tracking");
  }
  if (f.from || f.to) {
    parts.push(`${f.from || "…"} → ${f.to || "…"}`);
  }
  return parts.length === 0 ? "All orders" : parts.join(" · ");
};
