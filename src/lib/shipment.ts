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

// ---------------------------------------------------------------------
// Distance-based Lalamove fare estimate
//
// When the admin has filled in a warehouse origin + per-km rate, we can
// give the customer a single peso figure ("Estimated Lalamove fare:
// ₱185 — 5.4 km from our studio") instead of just a per-province band.
// The math is a straight-line Haversine distance from the warehouse to
// the buyer's province centroid (province capital coordinates) — it's
// indicative only, the rider quotes the real fare on dispatch.
//
// Admin defaults match the live storefront origin (Bagong Silang,
// Caloocan) and a conservative ₱25/km × ₱50 base fee + ₱100 minimum
// (typical Lalamove sedan flag-down). Admin can override all of these
// from /admin → Storefront → Lalamove fare estimate.
// ---------------------------------------------------------------------

export interface LalamoveFareConfig {
  /**
   * Master switch. When off, the checkout disclosure falls back to the
   * legacy `LALAMOVE_RANGE_BY_PROVINCE` band. Admin can flip this to
   * `true` once they've validated the per-km rate against actual rider
   * receipts.
   */
  enabled: boolean;
  /** Warehouse / studio coordinates (decimal degrees, WGS84). */
  warehouseLat: number;
  warehouseLng: number;
  /** Human-readable origin label shown next to the fare estimate. */
  warehouseLabel: string;
  /** Peso per km, multiplied against straight-line distance. */
  perKmRate: number;
  /** Flat fee added on top of distance × rate. */
  baseFee: number;
  /** Floor — rider rarely accepts below this; ignored when 0. */
  minFare: number;
}

export const DEFAULT_LALAMOVE_FARE: LalamoveFareConfig = {
  enabled: true,
  warehouseLat: 14.7406,
  warehouseLng: 121.0269,
  warehouseLabel: "Bagong Silang, Caloocan",
  perKmRate: 25,
  baseFee: 50,
  minFare: 100,
};

// Province centroid (lowercased province name → [lat, lng]). Coordinates
// are the province capital's centre — accurate enough for an indicative
// fare since Lalamove's sedan rate is mostly linear in distance. Limited
// to Luzon since that's where Lalamove can deliver from a fixed origin.
export const PROVINCE_CENTROIDS: Record<string, [number, number]> = {
  // NCR
  "metro manila": [14.5995, 120.9842],
  // Region III — Central Luzon
  bulacan: [14.7942, 120.8794],
  pampanga: [15.0794, 120.62],
  bataan: [14.6418, 120.4818],
  "nueva ecija": [15.5841, 120.9676],
  tarlac: [15.4869, 120.5879],
  zambales: [15.5081, 119.9798],
  aurora: [15.7475, 121.5616],
  // Region IV-A — CALABARZON
  cavite: [14.4791, 120.897],
  laguna: [14.1693, 121.2418],
  rizal: [14.5879, 121.175],
  batangas: [13.7565, 121.0583],
  quezon: [13.9376, 121.6324],
  // Region I — Ilocos
  "ilocos norte": [18.1647, 120.7115],
  "ilocos sur": [17.5757, 120.3869],
  "la union": [16.6159, 120.3209],
  pangasinan: [15.8949, 120.2863],
  // Region II — Cagayan Valley
  batanes: [20.4488, 121.9719],
  cagayan: [17.6132, 121.7269],
  isabela: [16.9754, 121.81],
  "nueva vizcaya": [16.331, 121.1711],
  quirino: [16.2729, 121.5375],
  // CAR — Cordillera
  abra: [17.5951, 120.7983],
  apayao: [17.9897, 121.1828],
  benguet: [16.4023, 120.5961],
  ifugao: [16.832, 121.1719],
  kalinga: [17.4748, 121.36],
  "mountain province": [17.0747, 120.9893],
  // Region V — Bicol
  albay: [13.142, 123.7438],
  "camarines norte": [14.1389, 122.7633],
  "camarines sur": [13.5251, 123.3486],
  catanduanes: [13.7089, 124.2422],
  masbate: [12.366, 123.6217],
  sorsogon: [12.9742, 124.0058],
  // MIMAROPA — island provinces (still get a centroid so the estimate
  // shows; the per-province "boat ride extra" note covers the gap)
  marinduque: [13.4767, 121.9032],
  "occidental mindoro": [13.1024, 121.0436],
  "oriental mindoro": [13.4137, 121.1779],
  palawan: [9.8349, 118.7384],
  romblon: [12.5778, 122.2695],
};

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance between two WGS84 points, in km. */
export const haversineKm = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number => {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
};

export interface LalamoveFareEstimate {
  fare: number;
  distanceKm: number;
  warehouseLabel: string;
  provinceLabel: string;
}

/**
 * Compute a distance-based fare estimate from the configured warehouse
 * origin to the buyer's province centroid. Returns `null` when the
 * config is disabled, missing fields, or the province isn't on our
 * Luzon centroid table (in which case the caller should fall back to
 * the per-province range).
 */
export const computeLalamoveFareEstimate = (
  cfg: LalamoveFareConfig | null | undefined,
  province: string,
): LalamoveFareEstimate | null => {
  if (!cfg || !cfg.enabled) return null;
  if (!Number.isFinite(cfg.warehouseLat) || !Number.isFinite(cfg.warehouseLng))
    return null;
  if (!Number.isFinite(cfg.perKmRate) || cfg.perKmRate <= 0) return null;
  if (!province) return null;
  const centroid = PROVINCE_CENTROIDS[province.trim().toLowerCase()];
  if (!centroid) return null;
  const distanceKm = haversineKm(
    cfg.warehouseLat,
    cfg.warehouseLng,
    centroid[0],
    centroid[1],
  );
  const raw = (cfg.baseFee || 0) + distanceKm * cfg.perKmRate;
  const fare = Math.max(cfg.minFare || 0, Math.round(raw));
  return {
    fare,
    distanceKm,
    warehouseLabel: cfg.warehouseLabel || "our studio",
    provinceLabel: province,
  };
};

export const formatLalamoveFareEstimate = (
  estimate: LalamoveFareEstimate,
): string => {
  const peso = `₱${estimate.fare.toLocaleString("en-PH")}`;
  const km = estimate.distanceKm.toFixed(1);
  return `${peso} (≈${km} km)`;
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
