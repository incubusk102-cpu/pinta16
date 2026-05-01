// Philippine Standard Geographic Code (PSGC) helpers backed by a
// pre-baked dataset under `src/data/ph-psgc.json` (~580 KB raw,
// ~190 KB gzipped). The dataset is dynamically imported so it lands
// in its own Vite chunk and only loads when a customer reaches the
// checkout / address-book — not on initial page load.
//
// Data preparation:
//   - Source: @jobuntux/psgc 2025-2Q (PSA official release).
//   - All highly-urbanized cities (e.g. City of Cebu, City of Davao)
//     are merged back under their geographic parent province so the
//     cascading picker stays intuitive ("Cebu" → "City of Cebu",
//     not under a separate pseudo-province).
//   - Manila is collapsed: PSGC splits Manila into 14 administrative
//     sub-districts (Tondo, Binondo, Quiapo, …) — we expose a single
//     "City of Manila" entry whose barangay list is the union of all
//     897 sub-district barangays.
//   - NCR's 17 city/municipality codes are surfaced under a single
//     "Metro Manila" pseudo-province to match `ph-regions.ts`.
//
// Exposed shape:
//
//   {
//     citiesByProvince: { "Cebu": ["Alcantara", "Alcoy", …], … },
//     cityCode:         { "Cebu||Alcantara": "07201", … },
//     brgyByCityCode:   { "07201": ["Bayog", "Buenavista", …], … },
//   }

export interface PhPsgcData {
  version: string;
  provinces: string[];
  citiesByProvince: Record<string, string[]>;
  cityCode: Record<string, string>;
  brgyByCityCode: Record<string, string[]>;
}

let cached: PhPsgcData | null = null;
let pending: Promise<PhPsgcData> | null = null;

/**
 * Load the PSGC dataset. Cached after first call; returns the same
 * promise across concurrent callers so we never double-fetch.
 */
export const loadPhPsgcData = (): Promise<PhPsgcData> => {
  if (cached) return Promise.resolve(cached);
  if (pending) return pending;
  pending = import("@/data/ph-psgc.json").then((mod) => {
    // Vite returns either the json as `default` or as the module
    // namespace itself depending on plugin config; handle both.
    const data = ((mod as unknown as { default?: PhPsgcData }).default ??
      mod) as PhPsgcData;
    cached = data;
    return data;
  });
  return pending;
};

/** Return the cached dataset synchronously, or null if not loaded yet. */
export const getCachedPhPsgcData = (): PhPsgcData | null => cached;

/** All cities for a given province name, sorted. Empty when not loaded yet. */
export const getCitiesForProvince = (
  data: PhPsgcData | null,
  provinceName: string,
): string[] => {
  if (!data || !provinceName) return [];
  return data.citiesByProvince[provinceName] ?? [];
};

/** Lookup the PSGC munCityCode for (province, city). */
export const getCityCode = (
  data: PhPsgcData | null,
  provinceName: string,
  cityName: string,
): string | null => {
  if (!data || !provinceName || !cityName) return null;
  return data.cityCode[`${provinceName}||${cityName}`] ?? null;
};

/** All barangays for a (province, city), sorted. Empty when not loaded yet. */
export const getBarangaysForCity = (
  data: PhPsgcData | null,
  provinceName: string,
  cityName: string,
): string[] => {
  const code = getCityCode(data, provinceName, cityName);
  if (!data || !code) return [];
  return data.brgyByCityCode[code] ?? [];
};
