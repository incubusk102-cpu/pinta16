// Shared types + geocoding helpers used by both `AddressInput` (the
// container) and the lazily-loaded `AddressMapPicker`. Extracted so the
// map picker can import these without forming a circular dep on its
// parent component file.

export const DEFAULT_CENTER = { lat: 14.5995, lng: 120.9842 }; // Manila

export interface AddressValue {
  line1: string;
  line2?: string;
  city: string;
  province?: string;
  postalCode?: string;
  country?: string;
  latitude?: number | null;
  longitude?: number | null;
  formatted?: string;
  placeId?: string;
}

export interface MapTilerContextEntry {
  id?: string;
  text?: string;
  language?: string;
}

export interface MapTilerFeature {
  id?: string;
  type?: string;
  place_type?: string[];
  place_name?: string;
  text?: string;
  address?: string | number;
  properties?: {
    ref?: string;
    country_code?: string;
    postcode?: string;
  };
  context?: MapTilerContextEntry[];
  center?: [number, number]; // [lng, lat]
  geometry?: {
    type: "Point";
    coordinates: [number, number];
  };
}

const contextLevel = (entry: MapTilerContextEntry): string => {
  const id = entry.id || "";
  const dot = id.indexOf(".");
  return dot > 0 ? id.slice(0, dot) : id;
};

export const reverseGeocodeUrl = (
  apiKey: string,
  lng: number,
  lat: number,
): string => {
  const params = new URLSearchParams({
    key: apiKey,
    language: "en",
  });
  return `https://api.maptiler.com/geocoding/${lng},${lat}.json?${params.toString()}`;
};

export const featureToValue = (
  feat: MapTilerFeature,
  prev: AddressValue,
): AddressValue => {
  const ctx = feat.context || [];
  const find = (level: string): string => {
    const entry = ctx.find((c) => contextLevel(c) === level);
    return entry?.text || "";
  };
  // MapTiler's PH coverage uses these levels:
  //   country, region, subregion, county, joint_municipality,
  //   municipality, joint_district, municipal_district, locality,
  //   neighbourhood, place, postal_code, address, street.
  const country = find("country");
  const region = find("region");
  const subregion = find("subregion");
  const municipality =
    find("municipality") ||
    find("joint_municipality") ||
    find("municipal_district") ||
    find("place") ||
    "";
  const locality = find("locality") || find("neighbourhood") || "";
  const postcode = feat.properties?.postcode || find("postal_code") || "";

  const placeTypes = feat.place_type || [];
  let line1 = "";
  let line2 = "";

  if (placeTypes.includes("address")) {
    // For an exact address match, feat.address is the house number and
    // feat.text is the street name.
    const num =
      typeof feat.address === "number"
        ? String(feat.address)
        : feat.address || "";
    const street = feat.text || "";
    line1 =
      [num, street].filter(Boolean).join(" ").trim() || feat.place_name || "";
    line2 = locality;
  } else if (placeTypes.includes("street")) {
    line1 = feat.text || "";
    line2 = locality;
  } else if (
    placeTypes.includes("neighbourhood") ||
    placeTypes.includes("locality")
  ) {
    line2 = feat.text || "";
    line1 = prev.line1 || "";
  } else {
    line1 = prev.line1 || feat.text || feat.place_name || "";
    line2 = locality;
  }

  const lng = feat.center?.[0] ?? feat.geometry?.coordinates?.[0];
  const lat = feat.center?.[1] ?? feat.geometry?.coordinates?.[1];

  return {
    ...prev,
    line1: line1 || prev.line1 || "",
    line2: line2 || prev.line2 || "",
    city: municipality || prev.city || "",
    province: subregion || region || prev.province || "",
    postalCode: postcode || prev.postalCode || "",
    country: country || prev.country || "Philippines",
    latitude: typeof lat === "number" ? lat : (prev.latitude ?? null),
    longitude: typeof lng === "number" ? lng : (prev.longitude ?? null),
    formatted: feat.place_name || prev.formatted || "",
    placeId: feat.id || prev.placeId,
  };
};
