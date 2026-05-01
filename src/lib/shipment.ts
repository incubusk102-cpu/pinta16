import type { ShippingZone } from "@/lib/ph-regions";

export interface CourierOption {
  id: string;
  label: string;
  trackingTemplate?: string;
}

export const COURIERS: CourierOption[] = [
  {
    id: "j&t",
    label: "J&T Express",
    trackingTemplate:
      "https://www.jtexpress.ph/index/query/gzquery.html?bills={tn}",
  },
  {
    id: "jrs",
    label: "JRS Express",
    trackingTemplate: "https://www.jrs-express.com/tracking/?tracking_no={tn}",
  },
  {
    id: "lbc",
    label: "LBC Express",
    trackingTemplate: "https://www.lbcexpress.com/track/?tn={tn}",
  },
  {
    id: "ninjavan",
    label: "Ninja Van",
    trackingTemplate: "https://www.ninjavan.co/en-ph/tracking?tracking_id={tn}",
  },
  {
    id: "flash",
    label: "Flash Express",
    trackingTemplate: "https://www.flashexpress.com.ph/tracking?tracking={tn}",
  },
  { id: "lalamove", label: "Lalamove" },
  { id: "grab", label: "Grab Express" },
  { id: "other", label: "Other / Self-pickup" },
];

// Couriers that are eligible to be picked at checkout for actual
// nationwide delivery — pickup-style options are excluded so customers
// don't accidentally choose them and then expect a real shipping fee.
export const SHIPPABLE_COURIER_IDS = ["j&t", "jrs", "lbc", "ninjavan", "flash"];

export const findCourierById = (id: string): CourierOption | undefined =>
  COURIERS.find((c) => c.id === id);

export const findCourierTemplate = (courier: string): string | undefined => {
  if (!courier) return undefined;
  const norm = courier.trim().toLowerCase();
  const direct = COURIERS.find((c) => c.id === norm);
  if (direct?.trackingTemplate) return direct.trackingTemplate;
  const match = COURIERS.find(
    (c) =>
      c.label.toLowerCase() === norm || c.label.toLowerCase().includes(norm),
  );
  return match?.trackingTemplate;
};

export const buildTrackingUrl = (
  courier: string,
  trackingNumber: string,
  override?: string,
): string | undefined => {
  if (override && /^https?:\/\//i.test(override)) return override;
  if (!trackingNumber) return undefined;
  const tpl = findCourierTemplate(courier);
  if (!tpl) return undefined;
  return tpl.replace("{tn}", encodeURIComponent(trackingNumber));
};

// Per-courier × per-zone fee, in pesos. Stored on the storefront config
// under `shippingRates`. Admin is the source of truth — these defaults
// are only used to seed the table on first use.
export interface ShippingRate {
  courierId: string;
  courierLabel: string;
  fees: Record<ShippingZone, number>;
}

export const DEFAULT_SHIPPING_RATES: ShippingRate[] = [
  {
    courierId: "j&t",
    courierLabel: "J&T Express",
    fees: { metro_manila: 120, luzon: 180, visayas: 220, mindanao: 260 },
  },
  {
    courierId: "lbc",
    courierLabel: "LBC Express",
    fees: { metro_manila: 150, luzon: 220, visayas: 280, mindanao: 320 },
  },
  {
    courierId: "jrs",
    courierLabel: "JRS Express",
    fees: { metro_manila: 130, luzon: 200, visayas: 260, mindanao: 300 },
  },
  {
    courierId: "ninjavan",
    courierLabel: "Ninja Van",
    fees: { metro_manila: 110, luzon: 180, visayas: 230, mindanao: 270 },
  },
  {
    courierId: "flash",
    courierLabel: "Flash Express",
    fees: { metro_manila: 100, luzon: 170, visayas: 220, mindanao: 260 },
  },
];

// Pull a per-courier × per-zone fee out of the rates table. Returns
// `null` when the table doesn't have an entry for that combination so
// callers can fall back to the legacy single shipping fee.
export const getShippingFee = (
  rates: ShippingRate[] | undefined,
  courierId: string,
  zone: ShippingZone | null | undefined,
): number | null => {
  if (!Array.isArray(rates) || !courierId || !zone) return null;
  const norm = courierId.trim().toLowerCase();
  const row = rates.find((r) => r.courierId.toLowerCase() === norm);
  if (!row) return null;
  const fee = row.fees?.[zone];
  return typeof fee === "number" && Number.isFinite(fee) && fee >= 0
    ? Math.floor(fee)
    : null;
};

// True when `rates` has at least one shippable-courier row with at
// least one non-zero zone fee. Used to decide whether the admin has
// actually configured the table or we should fall back to the legacy
// single fee.
export const hasShippingRates = (rates: ShippingRate[] | undefined): boolean =>
  Array.isArray(rates) &&
  rates.some(
    (r) =>
      r &&
      typeof r.courierId === "string" &&
      r.courierId &&
      r.fees &&
      Object.values(r.fees).some((v) => typeof v === "number" && v > 0),
  );
