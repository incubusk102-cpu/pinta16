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
export const SHIPPABLE_COURIER_IDS = [
  "j&t",
  "jrs",
  "lbc",
  "ninjavan",
  "flash",
  "lalamove",
];

// canvhub currently has no fixed warehouse address, so we don't try to
// price shipping at checkout. Every order ships via Lalamove and the
// customer pays the rider directly in cash on delivery. The cart total
// excludes shipping; the checkout disclosure tells the buyer up front
// what range to expect for their province (see LALAMOVE_RANGE_BY_PROVINCE
// below) so there are no surprises when the rider arrives.
//
// Flip this back to `false` if a fixed origin is added later — the
// existing per-courier × per-zone rate table will take over again.
export const LALAMOVE_PAID_TO_RIDER = true;
export const LALAMOVE_COURIER_ID = "lalamove";

// Indicative Lalamove fee range (in pesos) by Luzon province, derived
// from Lalamove's published intra-city sedan fare table
// (₱100 base + ₱13/km after 2 km) plus a typical detour factor and
// driver acceptance margin for inter-province trips. These are
// *expectation-setters* shown on the checkout screen, NOT a price the
// site charges — the rider quotes the actual fare on dispatch.
//
// Buckets:
//   metro_manila   — within MM, sedan-route                     ₱100–₱250
//   adjacent       — Cavite/Laguna/Rizal/Bulacan/Pampanga       ₱250–₱500
//   greater_luzon  — Batangas/Tarlac/N.Ecija/Zambales/Aurora    ₱400–₱700
//   far_luzon      — Bicol/Ilocos/Cagayan Valley/Cordillera     ₱700–₱1500+
//   mimaropa       — island provinces (Mindoro/Palawan/Romblon) ₱1000+ (boat)
export interface LalamoveRange {
  min: number;
  max: number;
  // Optional badge appended after the price range on the disclosure
  // panel ("≈" / "boat ride extra" etc).
  note?: string;
}

const RANGE_MM: LalamoveRange = { min: 100, max: 250 };
const RANGE_ADJACENT: LalamoveRange = { min: 250, max: 500 };
const RANGE_GREATER: LalamoveRange = { min: 400, max: 700 };
const RANGE_FAR: LalamoveRange = { min: 700, max: 1500, note: "long route" };
const RANGE_MIMAROPA: LalamoveRange = {
  min: 1000,
  max: 2500,
  note: "boat ride extra",
};

// Province (lowercase, trimmed) → fee range. Anything not listed falls
// back to the "outside Luzon" message ("Lalamove doesn't currently
// serve this province — contact us for a quote.").
export const LALAMOVE_RANGE_BY_PROVINCE: Record<string, LalamoveRange> = {
  // NCR
  "metro manila": RANGE_MM,
  // Region III — Central Luzon (adjacent / greater)
  bulacan: RANGE_ADJACENT,
  pampanga: RANGE_ADJACENT,
  bataan: RANGE_GREATER,
  "nueva ecija": RANGE_GREATER,
  tarlac: RANGE_GREATER,
  zambales: RANGE_GREATER,
  aurora: RANGE_FAR,
  // Region IV-A — CALABARZON (adjacent / greater)
  cavite: RANGE_ADJACENT,
  laguna: RANGE_ADJACENT,
  rizal: RANGE_ADJACENT,
  batangas: RANGE_GREATER,
  quezon: RANGE_GREATER,
  // Region I — Ilocos
  "ilocos norte": RANGE_FAR,
  "ilocos sur": RANGE_FAR,
  "la union": RANGE_FAR,
  pangasinan: RANGE_FAR,
  // Region II — Cagayan Valley
  batanes: RANGE_FAR,
  cagayan: RANGE_FAR,
  isabela: RANGE_FAR,
  "nueva vizcaya": RANGE_FAR,
  quirino: RANGE_FAR,
  // CAR — Cordillera
  abra: RANGE_FAR,
  apayao: RANGE_FAR,
  benguet: RANGE_FAR,
  ifugao: RANGE_FAR,
  kalinga: RANGE_FAR,
  "mountain province": RANGE_FAR,
  // Region V — Bicol
  albay: RANGE_FAR,
  "camarines norte": RANGE_FAR,
  "camarines sur": RANGE_FAR,
  catanduanes: RANGE_FAR,
  masbate: RANGE_FAR,
  sorsogon: RANGE_FAR,
  // MIMAROPA — island provinces (Lalamove typically stops at Batangas
  // pier; rider flag-down + RoRo costs are extra hence the wider band)
  marinduque: RANGE_MIMAROPA,
  "occidental mindoro": RANGE_MIMAROPA,
  "oriental mindoro": RANGE_MIMAROPA,
  palawan: RANGE_MIMAROPA,
  romblon: RANGE_MIMAROPA,
};

export const formatLalamoveRange = (range: LalamoveRange): string => {
  const min = `₱${range.min.toLocaleString("en-PH")}`;
  const max = `₱${range.max.toLocaleString("en-PH")}`;
  const note = range.note ? ` (${range.note})` : "";
  return `${min}–${max}${note}`;
};

export const getLalamoveRange = (
  province: string,
): LalamoveRange | undefined => {
  if (!province) return undefined;
  return LALAMOVE_RANGE_BY_PROVINCE[province.trim().toLowerCase()];
};

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
