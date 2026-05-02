// Philippine geographic data + courier zone mapping.
//
// Used by the checkout cascading address picker (Region → Province →
// City/Municipality → Barangay) and by the per-courier shipping-rate
// table on the storefront config (which is keyed by zone).
//
// Province lists follow the official PSA list (post-2022 BARMM split,
// post-2018 Davao Occidental etc.). City / municipality / barangay are
// free-text on the form because including all 42k barangays would bloat
// the bundle for no gain.

export type ShippingZone = "metro_manila" | "luzon" | "visayas" | "mindanao";

export const SHIPPING_ZONES: { id: ShippingZone; label: string }[] = [
  { id: "metro_manila", label: "Metro Manila" },
  { id: "luzon", label: "Luzon (outside Metro Manila)" },
  { id: "visayas", label: "Visayas" },
  { id: "mindanao", label: "Mindanao" },
];

export interface PhRegion {
  id: string;
  label: string;
  zone: ShippingZone;
  provinces: string[];
}

// Ordered roughly north-to-south so the dropdown reads geographically.
export const PH_REGIONS: PhRegion[] = [
  {
    id: "NCR",
    label: "NCR — National Capital Region",
    zone: "metro_manila",
    // NCR has no provinces; we expose Metro Manila as the single
    // "province" entry so the cascade UX stays consistent.
    provinces: ["Metro Manila"],
  },
  {
    id: "CAR",
    label: "CAR — Cordillera Administrative Region",
    zone: "luzon",
    provinces: [
      "Abra",
      "Apayao",
      "Benguet",
      "Ifugao",
      "Kalinga",
      "Mountain Province",
    ],
  },
  {
    id: "R1",
    label: "Region I — Ilocos Region",
    zone: "luzon",
    provinces: ["Ilocos Norte", "Ilocos Sur", "La Union", "Pangasinan"],
  },
  {
    id: "R2",
    label: "Region II — Cagayan Valley",
    zone: "luzon",
    provinces: ["Batanes", "Cagayan", "Isabela", "Nueva Vizcaya", "Quirino"],
  },
  {
    id: "R3",
    label: "Region III — Central Luzon",
    zone: "luzon",
    provinces: [
      "Aurora",
      "Bataan",
      "Bulacan",
      "Nueva Ecija",
      "Pampanga",
      "Tarlac",
      "Zambales",
    ],
  },
  {
    id: "R4A",
    label: "Region IV-A — CALABARZON",
    zone: "luzon",
    provinces: ["Batangas", "Cavite", "Laguna", "Quezon", "Rizal"],
  },
  {
    id: "MIMAROPA",
    label: "MIMAROPA Region",
    zone: "luzon",
    provinces: [
      "Marinduque",
      "Occidental Mindoro",
      "Oriental Mindoro",
      "Palawan",
      "Romblon",
    ],
  },
  {
    id: "R5",
    label: "Region V — Bicol Region",
    zone: "luzon",
    provinces: [
      "Albay",
      "Camarines Norte",
      "Camarines Sur",
      "Catanduanes",
      "Masbate",
      "Sorsogon",
    ],
  },
  {
    id: "R6",
    label: "Region VI — Western Visayas",
    zone: "visayas",
    provinces: [
      "Aklan",
      "Antique",
      "Capiz",
      "Guimaras",
      "Iloilo",
      "Negros Occidental",
    ],
  },
  {
    id: "R7",
    label: "Region VII — Central Visayas",
    zone: "visayas",
    provinces: ["Bohol", "Cebu", "Negros Oriental", "Siquijor"],
  },
  {
    id: "R8",
    label: "Region VIII — Eastern Visayas",
    zone: "visayas",
    provinces: [
      "Biliran",
      "Eastern Samar",
      "Leyte",
      "Northern Samar",
      "Samar",
      "Southern Leyte",
    ],
  },
  {
    id: "R9",
    label: "Region IX — Zamboanga Peninsula",
    zone: "mindanao",
    provinces: [
      "Zamboanga del Norte",
      "Zamboanga del Sur",
      "Zamboanga Sibugay",
    ],
  },
  {
    id: "R10",
    label: "Region X — Northern Mindanao",
    zone: "mindanao",
    provinces: [
      "Bukidnon",
      "Camiguin",
      "Lanao del Norte",
      "Misamis Occidental",
      "Misamis Oriental",
    ],
  },
  {
    id: "R11",
    label: "Region XI — Davao Region",
    zone: "mindanao",
    provinces: [
      "Davao de Oro",
      "Davao del Norte",
      "Davao del Sur",
      "Davao Occidental",
      "Davao Oriental",
    ],
  },
  {
    id: "R12",
    label: "Region XII — SOCCSKSARGEN",
    zone: "mindanao",
    provinces: ["Cotabato", "Sarangani", "South Cotabato", "Sultan Kudarat"],
  },
  {
    id: "R13",
    label: "Region XIII — Caraga",
    zone: "mindanao",
    provinces: [
      "Agusan del Norte",
      "Agusan del Sur",
      "Dinagat Islands",
      "Surigao del Norte",
      "Surigao del Sur",
    ],
  },
  {
    id: "BARMM",
    label: "BARMM — Bangsamoro",
    zone: "mindanao",
    provinces: [
      "Basilan",
      "Lanao del Sur",
      "Maguindanao del Norte",
      "Maguindanao del Sur",
      "Sulu",
      "Tawi-Tawi",
    ],
  },
];

export const findRegion = (regionId: string): PhRegion | undefined =>
  PH_REGIONS.find((r) => r.id === regionId);

export const provincesForRegion = (regionId: string): string[] =>
  findRegion(regionId)?.provinces ?? [];

export const zoneForRegion = (regionId: string): ShippingZone | null =>
  findRegion(regionId)?.zone ?? null;

// Flat, deduplicated list of every PH province (NCR exposed as
// "Metro Manila"). Used by the checkout address picker now that
// Region is hidden — the buyer types/picks a province directly and
// region+zone are derived behind the scenes for the per-courier ×
// per-zone shipping fee.
export const ALL_PH_PROVINCES: string[] = Array.from(
  new Set(PH_REGIONS.flatMap((r) => r.provinces)),
).sort((a, b) => a.localeCompare(b));

// Reverse map province → region. Built lazily once because the
// PH_REGIONS list is static. Lookups are O(1) after first call.
let provinceToRegionId: Map<string, string> | null = null;
const buildProvinceIndex = (): Map<string, string> => {
  if (provinceToRegionId) return provinceToRegionId;
  const map = new Map<string, string>();
  for (const r of PH_REGIONS) {
    for (const p of r.provinces) {
      // First-write wins. PSGC has no province shared across regions
      // so this is safe; the guard is just paranoia.
      if (!map.has(p.toLowerCase())) {
        map.set(p.toLowerCase(), r.id);
      }
    }
  }
  provinceToRegionId = map;
  return map;
};

export const regionForProvince = (province: string): string => {
  if (!province) return "";
  return buildProvinceIndex().get(province.trim().toLowerCase()) ?? "";
};

export const zoneForProvince = (province: string): ShippingZone | null => {
  const regionId = regionForProvince(province);
  return regionId ? zoneForRegion(regionId) : null;
};

export const zoneLabel = (zone: ShippingZone | null | undefined): string =>
  SHIPPING_ZONES.find((z) => z.id === zone)?.label ?? "";

// Best-effort PH mobile validator. Strict mode requires the canonical
// 09XX XXX XXXX or +63 9XX XXX XXXX shape; non-strict accepts 7-digit
// landlines (Manila/Cebu) and other PH formats.
export const isValidPhMobile = (raw: string): boolean => {
  const digits = (raw || "").replace(/\D/g, "");
  if (raw.trim().startsWith("+63")) {
    return digits.startsWith("63") && digits.length === 12;
  }
  if (digits.startsWith("09")) return digits.length === 11;
  if (digits.startsWith("9") && digits.length === 10) return true;
  return false;
};
