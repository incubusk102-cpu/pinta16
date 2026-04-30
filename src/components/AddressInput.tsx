// AddressInput — hybrid shipping address picker.
//
// Three tiers, all operating on the same structured value object so
// users can mix and match:
//
//   1. Search / autocomplete  — Google Places dropdown. Picking a
//      suggestion fills every structured field below and drops the pin
//      on the map.
//   2. Manual structured fields — line1 / line2 / city / province /
//      postal code. Always editable. If the customer's address isn't
//      in Google's index (rural barangays, new subdivisions, informal
//      landmarks) they can just type it in.
//   3. Map pin — draggable marker on a Google Map. Dragging the marker
//      reverse-geocodes the point and fills the structured fields.
//      "Use my location" snaps to the device's GPS reading.
//
// The component reads its API key from /api/maps-config at runtime
// (single source of truth: a Cloudflare Pages env var) so we don't have
// to bake the key into the Vite bundle. When no key is configured the
// component degrades to manual fields only — no autocomplete, no map.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  ControlPosition,
  MapControl,
  useApiIsLoaded,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { Loader2, LocateFixed, MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const DEFAULT_CENTER = { lat: 14.5995, lng: 120.9842 }; // Manila

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
  /** Default country code biased into Places autocomplete (ISO 3166-1 alpha-2). Defaults to "ph". */
  countryBias?: string;
}

interface MapsConfigResponse {
  apiKey: string | null;
  mapId: string | null;
}

const fetchMapsConfig = async (): Promise<MapsConfigResponse> => {
  try {
    const res = await fetch("/api/maps-config", {
      credentials: "same-origin",
    });
    if (!res.ok) return { apiKey: null, mapId: null };
    const data = (await res.json()) as MapsConfigResponse;
    return {
      apiKey: typeof data.apiKey === "string" ? data.apiKey : null,
      mapId: typeof data.mapId === "string" ? data.mapId : null,
    };
  } catch {
    return { apiKey: null, mapId: null };
  }
};

// Walk Google's address_components blob and extract our structured
// fields. Google sends a flat list of {long_name, short_name, types[]}
// where types tags identify the role (street_number, route,
// administrative_area_level_2, postal_code, etc.). The mapping below
// matches what Philippine addresses look like in the Places API.
const componentsToValue = (
  place: google.maps.places.PlaceResult,
  prev: AddressValue,
): AddressValue => {
  const components = place.address_components || [];
  const get = (typeKey: string, useShort = false): string => {
    const c = components.find((x) => x.types.includes(typeKey));
    if (!c) return "";
    return useShort ? c.short_name : c.long_name;
  };

  const streetNumber = get("street_number");
  const route = get("route");
  const sublocality =
    get("sublocality_level_1") ||
    get("sublocality") ||
    get("neighborhood") ||
    "";
  const locality = get("locality") || get("administrative_area_level_2") || "";
  const province = get("administrative_area_level_1");
  const postalCode = get("postal_code");
  const country = get("country");

  const line1 = [streetNumber, route].filter(Boolean).join(" ").trim();

  return {
    ...prev,
    line1: line1 || prev.line1 || place.name || "",
    line2: sublocality || prev.line2 || "",
    city: locality || prev.city || "",
    province: province || prev.province || "",
    postalCode: postalCode || prev.postalCode || "",
    country: country || prev.country || "Philippines",
    latitude: place.geometry?.location?.lat() ?? prev.latitude ?? null,
    longitude: place.geometry?.location?.lng() ?? prev.longitude ?? null,
    formatted: place.formatted_address || prev.formatted || "",
    placeId: place.place_id || prev.placeId,
  };
};

// Same shape as componentsToValue, but for results that come back from
// the standalone Geocoder (used by the map pin's reverse-geocode).
const geocodeResultToValue = (
  result: google.maps.GeocoderResult,
  prev: AddressValue,
): AddressValue => {
  const components = result.address_components || [];
  const get = (typeKey: string): string => {
    const c = components.find((x) => x.types.includes(typeKey));
    return c ? c.long_name : "";
  };
  const streetNumber = get("street_number");
  const route = get("route");
  const sublocality =
    get("sublocality_level_1") ||
    get("sublocality") ||
    get("neighborhood") ||
    "";
  const locality = get("locality") || get("administrative_area_level_2") || "";
  const province = get("administrative_area_level_1");
  const postalCode = get("postal_code");
  const country = get("country");
  const line1 = [streetNumber, route].filter(Boolean).join(" ").trim();
  return {
    ...prev,
    line1: line1 || prev.line1 || "",
    line2: sublocality || prev.line2 || "",
    city: locality || prev.city || "",
    province: province || prev.province || "",
    postalCode: postalCode || prev.postalCode || "",
    country: country || prev.country || "Philippines",
    latitude: result.geometry?.location?.lat() ?? prev.latitude ?? null,
    longitude: result.geometry?.location?.lng() ?? prev.longitude ?? null,
    formatted: result.formatted_address || prev.formatted || "",
    placeId: result.place_id || prev.placeId,
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
  countryBias,
}: {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  countryBias: string;
}) => {
  const places = useMapsLibrary("places");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const acRef = useRef<google.maps.places.Autocomplete | null>(null);

  useEffect(() => {
    if (!places || !inputRef.current) return;
    if (acRef.current) return;
    const ac = new places.Autocomplete(inputRef.current, {
      fields: [
        "address_components",
        "formatted_address",
        "geometry.location",
        "name",
        "place_id",
      ],
      componentRestrictions: { country: [countryBias] },
    });
    acRef.current = ac;
    const listener = ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      if (!place) return;
      onChange(componentsToValue(place, value));
    });
    return () => {
      listener.remove();
      acRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, countryBias]);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      <Input
        ref={inputRef}
        type="text"
        placeholder="Search address, landmark, or barangay…"
        defaultValue={value.formatted || ""}
        className="pl-9 text-sm"
        autoComplete="off"
      />
    </div>
  );
};

const MapPicker = ({
  value,
  onChange,
  mapId,
}: {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  mapId: string | null;
}) => {
  const apiLoaded = useApiIsLoaded();
  const map = useMap();
  const geocoding = useMapsLibrary("geocoding");
  const [reversing, setReversing] = useState(false);
  const [locating, setLocating] = useState(false);

  const center = useMemo<google.maps.LatLngLiteral>(() => {
    if (
      typeof value.latitude === "number" &&
      typeof value.longitude === "number"
    ) {
      return { lat: value.latitude, lng: value.longitude };
    }
    return DEFAULT_CENTER;
  }, [value.latitude, value.longitude]);

  // Recenter when the value's lat/lng changes from outside (e.g. an
  // autocomplete pick or manual edit). Without this, picking a place
  // updates the marker but the map stays parked at the previous spot.
  useEffect(() => {
    if (!map) return;
    if (
      typeof value.latitude === "number" &&
      typeof value.longitude === "number"
    ) {
      map.panTo({ lat: value.latitude, lng: value.longitude });
    }
  }, [map, value.latitude, value.longitude]);

  const reverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      if (!geocoding) return;
      setReversing(true);
      try {
        const geocoder = new geocoding.Geocoder();
        const { results } = await geocoder.geocode({
          location: { lat, lng },
        });
        const result = results?.[0];
        if (!result) {
          // Even if Google has no human address for the point, keep the
          // pin coordinates — courier APIs care about lat/lng.
          onChange({ ...value, latitude: lat, longitude: lng });
          return;
        }
        onChange(
          geocodeResultToValue(result, {
            ...value,
            latitude: lat,
            longitude: lng,
          }),
        );
      } catch {
        onChange({ ...value, latitude: lat, longitude: lng });
      } finally {
        setReversing(false);
      }
    },
    [geocoding, onChange, value],
  );

  const handleMarkerDragEnd = (e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    void reverseGeocode(lat, lng);
  };

  const handleMapClick = (e: {
    detail: { latLng: google.maps.LatLngLiteral | null };
  }) => {
    const ll = e.detail?.latLng;
    if (!ll) return;
    void reverseGeocode(ll.lat, ll.lng);
  };

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

  const markerPosition: google.maps.LatLngLiteral | null =
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
          disabled={!apiLoaded || locating}
        >
          {locating ? (
            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
          ) : (
            <LocateFixed className="w-3.5 h-3.5 mr-1" />
          )}
          Use my location
        </Button>
      </div>
      <div className="h-64 w-full overflow-hidden rounded-md border border-border/40">
        <Map
          defaultCenter={center}
          defaultZoom={markerPosition ? 17 : 12}
          mapId={mapId || undefined}
          gestureHandling="greedy"
          disableDefaultUI={false}
          clickableIcons={false}
          onClick={handleMapClick}
          style={{ width: "100%", height: "100%" }}
        >
          {markerPosition && (
            <AdvancedMarker
              position={markerPosition}
              draggable
              onDragEnd={handleMarkerDragEnd}
              title="Drag to refine"
            />
          )}
          {reversing && (
            <MapControl position={ControlPosition.TOP_CENTER}>
              <div className="m-2 inline-flex items-center gap-2 rounded-md bg-background/95 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
                <Loader2 className="w-3 h-3 animate-spin" />
                Reading address…
              </div>
            </MapControl>
          )}
        </Map>
      </div>
      {markerPosition && (
        <p className="text-[10px] text-muted-foreground tabular-nums">
          {markerPosition.lat.toFixed(6)}, {markerPosition.lng.toFixed(6)}
        </p>
      )}
    </div>
  );
};

const PoweredByGoogleApi = ({
  value,
  onChange,
  hideMap,
  countryBias,
  mapId,
}: {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  hideMap: boolean;
  countryBias: string;
  mapId: string | null;
}) => (
  <div className="space-y-3">
    <PlacesAutocomplete
      value={value}
      onChange={onChange}
      countryBias={countryBias}
    />
    <ManualFields value={value} onChange={onChange} />
    {!hideMap && <MapPicker value={value} onChange={onChange} mapId={mapId} />}
  </div>
);

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

  return (
    <div className={className}>
      <APIProvider apiKey={config.apiKey} libraries={["places", "geocoding"]}>
        <PoweredByGoogleApi
          value={value}
          onChange={onChange}
          hideMap={hideMap}
          countryBias={countryBias}
          mapId={config.mapId}
        />
      </APIProvider>
      <p className="text-[10px] text-muted-foreground mt-2 inline-flex items-center gap-1">
        <MapPin className="w-3 h-3" />
        Type to search, edit fields directly, or drag the pin — any of the three
        works.
      </p>
    </div>
  );
};

export default AddressInput;
