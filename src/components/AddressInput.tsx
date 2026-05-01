// AddressInput — hybrid shipping address picker.
//
// Three tiers, all operating on the same structured value object so
// users can mix and match:
//
//   1. Search / autocomplete  — MapTiler Geocoding suggestions in a
//      dropdown. Picking a suggestion fills every structured field
//      below and drops the pin on the map.
//   2. Manual structured fields — line1 / line2 / city / province /
//      postal code. Always editable. If the customer's address isn't
//      in the index (rural barangays, new subdivisions, informal
//      landmarks) they can just type it in.
//   3. Map pin — draggable marker on a MapLibre canvas rendered with
//      MapTiler vector tiles. Dragging the marker reverse-geocodes
//      the point and fills the structured fields. "Use my location"
//      snaps to the device's GPS reading.
//
// The component reads its API key from /api/maps-config at runtime
// (single source of truth: a Cloudflare Pages env var) so we don't
// have to bake the key into the Vite bundle. When no key is
// configured the component degrades to manual fields only — no
// autocomplete, no map.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Map,
  Marker,
  NavigationControl,
  type MapRef,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Building2,
  Loader2,
  LocateFixed,
  MapPin,
  MapPinned,
  Navigation,
  Search,
  TreePine,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const DEFAULT_CENTER = { lat: 14.5995, lng: 120.9842 }; // Manila

// MapTiler's vector style URL — `streets-v2` is the general-purpose
// retail-friendly style. We append the API key as a query param. The
// open-source MapLibre GL renderer happily consumes this.
const tileStyleUrl = (apiKey: string): string =>
  `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(apiKey)}`;

// Philippines bounding box — constrains autocomplete results to PH.
const PH_BBOX = "116.95,4.59,126.6,21.12";

// Place-type filter options exposed to the user.
type PlaceTypeFilter = "all" | "address" | "street" | "poi" | "neighbourhood";

const PLACE_FILTERS: { value: PlaceTypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "address", label: "Address" },
  { value: "street", label: "Street" },
  { value: "poi", label: "Place / POI" },
  { value: "neighbourhood", label: "Barangay" },
];

const typeIcon = (types: string[] | undefined) => {
  if (!types?.length) return MapPinned;
  if (types.includes("poi")) return TreePine;
  if (types.includes("address")) return MapPin;
  if (types.includes("street")) return Navigation;
  if (
    types.includes("neighbourhood") ||
    types.includes("locality") ||
    types.includes("municipality")
  )
    return Building2;
  return MapPinned;
};

const typeLabel = (types: string[] | undefined): string => {
  if (!types?.length) return "place";
  if (types.includes("poi")) return "poi";
  if (types.includes("address")) return "address";
  if (types.includes("street")) return "street";
  if (types.includes("neighbourhood")) return "barangay";
  if (types.includes("locality")) return "locality";
  if (types.includes("municipality")) return "city";
  if (types.includes("region") || types.includes("subregion")) return "region";
  return types[0] || "place";
};

// MapTiler Geocoding API endpoints. Country-restricted to PH by
// default; configurable via the component's `countryBias` prop.
// Enhanced with proximity bias, bbox, and type filtering.
const forwardGeocodeUrl = (
  apiKey: string,
  query: string,
  countries: string,
  opts?: {
    proximity?: { lng: number; lat: number };
    types?: PlaceTypeFilter;
  },
): string => {
  const params = new URLSearchParams({
    key: apiKey,
    autocomplete: "true",
    fuzzyMatch: "true",
    limit: "10",
    country: countries,
    language: "en",
    bbox: PH_BBOX,
  });
  if (opts?.proximity) {
    params.set("proximity", `${opts.proximity.lng},${opts.proximity.lat}`);
  }
  if (opts?.types && opts.types !== "all") {
    params.set("types", opts.types);
  }
  return `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?${params.toString()}`;
};

const reverseGeocodeUrl = (
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

export interface AddressInputProps {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  /** Hide the map (autocomplete + manual fields only). */
  hideMap?: boolean;
  /** Wrapping classes. */
  className?: string;
  /** Comma-separated ISO 3166-1 alpha-2 codes biased into the geocoder. Defaults to "ph". */
  countryBias?: string;
}

interface MapsConfigResponse {
  apiKey: string | null;
  // Optional vector style override; default is MapTiler's streets-v2.
  styleUrl?: string | null;
}

const fetchMapsConfig = async (): Promise<MapsConfigResponse> => {
  try {
    const res = await fetch("/api/maps-config", {
      credentials: "same-origin",
    });
    if (!res.ok) return { apiKey: null };
    const data = (await res.json()) as MapsConfigResponse;
    return {
      apiKey: typeof data.apiKey === "string" ? data.apiKey : null,
      styleUrl: typeof data.styleUrl === "string" ? data.styleUrl : null,
    };
  } catch {
    return { apiKey: null };
  }
};

// MapTiler returns GeoJSON Features. The properties bag carries the
// structured pieces we need — but the field names vary slightly by
// place type (a region might use `name` while an address uses
// `street`). The `context` array holds the parent administrative
// hierarchy. We walk both to assemble a SavedAddress-shaped value.
interface MapTilerContextEntry {
  id?: string;
  text?: string;
  language?: string;
  // The id is namespaced like `country.123`, `region.456`, etc. We
  // pull the prefix to identify the level.
}

interface MapTilerFeature {
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

const featureToValue = (
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

interface FieldPair {
  key: keyof AddressValue;
  label: string;
  placeholder: string;
  full?: boolean;
  required?: boolean;
}

const MANUAL_FIELDS: FieldPair[] = [
  {
    key: "line1",
    label: "Street, building, unit",
    placeholder: "123 Mabini Street, Casa 4",
    full: true,
    required: true,
  },
  {
    key: "line2",
    label: "Barangay / subdivision (optional)",
    placeholder: "Brgy. San Lorenzo",
    full: true,
  },
  {
    key: "city",
    label: "City",
    placeholder: "Makati",
    required: true,
  },
  {
    key: "province",
    label: "Province / region",
    placeholder: "Metro Manila",
  },
  {
    key: "postalCode",
    label: "Postal code",
    placeholder: "1227",
  },
  {
    key: "country",
    label: "Country",
    placeholder: "Philippines",
  },
];

const ManualFields = ({
  value,
  onChange,
}: {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
}) => {
  const set = (key: keyof AddressValue) => (raw: string) => {
    onChange({ ...value, [key]: raw });
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {MANUAL_FIELDS.map((field) => (
        <div
          key={String(field.key)}
          className={field.full ? "sm:col-span-2" : undefined}
        >
          <label className="font-body text-[11px] uppercase tracking-wider text-muted-foreground mb-1 block">
            {field.label}
            {field.required && <span className="text-destructive"> *</span>}
          </label>
          <Input
            value={(value[field.key] as string) || ""}
            onChange={(e) => set(field.key)(e.target.value)}
            placeholder={field.placeholder}
            className="text-sm"
          />
        </div>
      ))}
    </div>
  );
};

const PlacesAutocomplete = ({
  value,
  onChange,
  apiKey,
  countryBias,
}: {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  apiKey: string;
  countryBias: string;
}) => {
  const [query, setQuery] = useState<string>(value.formatted || "");
  const [suggestions, setSuggestions] = useState<MapTilerFeature[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState<number>(-1);
  const [typeFilter, setTypeFilter] = useState<PlaceTypeFilter>("all");
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const proximity = useMemo(() => {
    if (
      typeof value.latitude === "number" &&
      typeof value.longitude === "number"
    ) {
      return { lat: value.latitude, lng: value.longitude };
    }
    return DEFAULT_CENTER;
  }, [value.latitude, value.longitude]);

  useEffect(() => {
    if (!query || query.length < 3) {
      setSuggestions([]);
      setSearched(false);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      setSearched(false);
      try {
        const res = await fetch(
          forwardGeocodeUrl(apiKey, query, countryBias, {
            proximity,
            types: typeFilter,
          }),
        );
        if (!res.ok) {
          setSuggestions([]);
          return;
        }
        const data = (await res.json()) as { features?: MapTilerFeature[] };
        setSuggestions(data.features || []);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
        setSearched(true);
      }
    }, 200);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, apiKey, countryBias, proximity, typeFilter]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (value.formatted && value.formatted !== query) {
      setQuery(value.formatted);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.formatted]);

  const pick = (feat: MapTilerFeature) => {
    const next = featureToValue(feat, value);
    onChange(next);
    setQuery(feat.place_name || query);
    setSuggestions([]);
    setOpen(false);
    setHighlightIdx(-1);
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (highlightIdx >= 0 && highlightIdx < suggestions.length) {
        e.preventDefault();
        pick(suggestions[highlightIdx]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative space-y-1.5">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          placeholder="Search address, landmark, or barangay…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="pl-9 text-sm"
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Type filter chips */}
      <div className="flex flex-wrap gap-1">
        {PLACE_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setTypeFilter(f.value);
              if (query.length >= 3) setOpen(true);
            }}
            className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
              typeFilter === f.value
                ? "bg-foreground text-background border-foreground"
                : "bg-transparent text-muted-foreground border-border/50 hover:border-foreground/30"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Suggestions dropdown */}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full max-h-80 overflow-y-auto rounded-md border border-border/40 bg-background shadow-md">
          {suggestions.map((s, i) => {
            const Icon = typeIcon(s.place_type);
            const badge = typeLabel(s.place_type);
            return (
              <li
                key={s.id || `${s.place_name}-${i}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
                onMouseEnter={() => setHighlightIdx(i)}
                className={`flex items-start gap-2.5 px-3 py-2 text-sm cursor-pointer ${
                  i === highlightIdx
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50"
                }`}
              >
                <Icon className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium leading-tight truncate">
                      {s.text}
                    </p>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {badge}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-tight truncate">
                    {s.place_name}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* No results message */}
      {open &&
        searched &&
        !loading &&
        suggestions.length === 0 &&
        query.length >= 3 && (
          <div className="absolute z-50 mt-1 w-full rounded-md border border-border/40 bg-background shadow-md px-3 py-4 text-center">
            <p className="text-sm text-muted-foreground">
              No results found for &ldquo;{query}&rdquo;
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Try a different spelling or use the fields below
            </p>
          </div>
        )}
    </div>
  );
};

const MapPicker = ({
  value,
  onChange,
  apiKey,
  styleUrl,
}: {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  apiKey: string;
  styleUrl: string;
}) => {
  const mapRef = useRef<MapRef | null>(null);
  const [reversing, setReversing] = useState(false);
  const [locating, setLocating] = useState(false);

  const center = useMemo(() => {
    if (
      typeof value.latitude === "number" &&
      typeof value.longitude === "number"
    ) {
      return { lat: value.latitude, lng: value.longitude };
    }
    return DEFAULT_CENTER;
  }, [value.latitude, value.longitude]);

  // Recenter the map when the value changes from outside (autocomplete
  // pick or "Use my location"). Without this, picking a place updates
  // the marker but the map stays parked at the previous spot.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (
      typeof value.latitude === "number" &&
      typeof value.longitude === "number"
    ) {
      map.flyTo({
        center: [value.longitude, value.latitude],
        zoom: 17,
        duration: 700,
      });
    }
  }, [value.latitude, value.longitude]);

  const reverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      setReversing(true);
      try {
        const res = await fetch(reverseGeocodeUrl(apiKey, lng, lat));
        if (!res.ok) {
          onChange({ ...value, latitude: lat, longitude: lng });
          return;
        }
        const data = (await res.json()) as { features?: MapTilerFeature[] };
        const feat = data.features?.[0];
        if (!feat) {
          onChange({ ...value, latitude: lat, longitude: lng });
          return;
        }
        onChange(
          featureToValue(feat, { ...value, latitude: lat, longitude: lng }),
        );
      } catch {
        onChange({ ...value, latitude: lat, longitude: lng });
      } finally {
        setReversing(false);
      }
    },
    [apiKey, onChange, value],
  );

  const useMyLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        void reverseGeocode(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  };

  const markerPosition: { lat: number; lng: number } | null =
    typeof value.latitude === "number" && typeof value.longitude === "number"
      ? { lat: value.latitude, lng: value.longitude }
      : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Drop a pin or drag the marker
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={useMyLocation}
          disabled={locating}
        >
          {locating ? (
            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
          ) : (
            <LocateFixed className="w-3.5 h-3.5 mr-1" />
          )}
          Use my location
        </Button>
      </div>
      <div className="h-64 w-full overflow-hidden rounded-md border border-border/40 relative">
        <Map
          ref={mapRef}
          mapStyle={styleUrl}
          initialViewState={{
            longitude: center.lng,
            latitude: center.lat,
            zoom: markerPosition ? 17 : 12,
          }}
          onClick={(e) => {
            void reverseGeocode(e.lngLat.lat, e.lngLat.lng);
          }}
          style={{ width: "100%", height: "100%" }}
        >
          <NavigationControl position="top-right" />
          {markerPosition && (
            <Marker
              longitude={markerPosition.lng}
              latitude={markerPosition.lat}
              draggable
              anchor="bottom"
              onDragEnd={(e) => {
                void reverseGeocode(e.lngLat.lat, e.lngLat.lng);
              }}
            >
              <MapPin className="w-7 h-7 fill-destructive text-destructive drop-shadow" />
            </Marker>
          )}
        </Map>
        {reversing && (
          <div className="absolute top-2 left-2 inline-flex items-center gap-2 rounded-md bg-background/95 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
            <Loader2 className="w-3 h-3 animate-spin" />
            Reading address…
          </div>
        )}
      </div>
      {markerPosition && (
        <p className="text-[10px] text-muted-foreground tabular-nums">
          {markerPosition.lat.toFixed(6)}, {markerPosition.lng.toFixed(6)}
        </p>
      )}
    </div>
  );
};

export const AddressInput = ({
  value,
  onChange,
  hideMap = false,
  className,
  countryBias = "ph",
}: AddressInputProps) => {
  const [config, setConfig] = useState<MapsConfigResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchMapsConfig().then((c) => {
      if (!cancelled) setConfig(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Loading state — keep the manual fields visible immediately so a
  // slow /api/maps-config response doesn't blank the form. The
  // autocomplete and map slot in once the key resolves.
  if (config === null) {
    return (
      <div className={className}>
        <ManualFields value={value} onChange={onChange} />
        <p className="text-[10px] text-muted-foreground mt-2 inline-flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading map…
        </p>
      </div>
    );
  }

  if (!config.apiKey) {
    return (
      <div className={className}>
        <ManualFields value={value} onChange={onChange} />
      </div>
    );
  }

  const styleUrl = config.styleUrl || tileStyleUrl(config.apiKey);

  return (
    <div className={className}>
      <div className="space-y-3">
        <PlacesAutocomplete
          value={value}
          onChange={onChange}
          apiKey={config.apiKey}
          countryBias={countryBias}
        />
        <ManualFields value={value} onChange={onChange} />
        {!hideMap && (
          <MapPicker
            value={value}
            onChange={onChange}
            apiKey={config.apiKey}
            styleUrl={styleUrl}
          />
        )}
      </div>
      <p className="text-[10px] text-muted-foreground mt-2 inline-flex items-center gap-1">
        <MapPin className="w-3 h-3" />
        Type to search, edit fields directly, or drag the pin — any of the three
        works.
      </p>
    </div>
  );
};

export default AddressInput;
