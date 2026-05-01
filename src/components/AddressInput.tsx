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

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Loader2,
  MapPin,
  MapPinned,
  Navigation,
  Search,
  TreePine,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  type AddressValue,
  type MapTilerFeature,
  DEFAULT_CENTER,
  featureToValue,
} from "@/components/addressInputShared";

// Lazy-load the MapLibre-based picker so `react-map-gl/maplibre` and
// the MapLibre stylesheet (~600 kB gzipped together) only ship when
// the customer actually opens the address picker. Without this, every
// route that imports CheckoutForm pulls the WebGL renderer into the
// initial bundle.
const AddressMapPicker = lazy(() => import("@/components/AddressMapPicker"));

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

export type { AddressValue } from "@/components/addressInputShared";

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

// MapTiler returns GeoJSON Features. The geocoding response shape and
// the helpers that flatten it into our `AddressValue` live in
// `addressInputShared.ts` so both this file and the lazily-loaded
// `AddressMapPicker` can use them without forming a circular import.

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
          <Suspense
            fallback={
              <div className="h-64 w-full rounded-md border border-border/40 bg-muted/30 flex items-center justify-center">
                <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Loading map…
                </span>
              </div>
            }
          >
            <AddressMapPicker
              value={value}
              onChange={onChange}
              apiKey={config.apiKey}
              styleUrl={styleUrl}
            />
          </Suspense>
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
