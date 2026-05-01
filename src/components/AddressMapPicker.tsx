// Heavy MapLibre-based map picker, broken out from `AddressInput.tsx` so
// it can be loaded via `React.lazy()`. `react-map-gl/maplibre` and the
// MapLibre stylesheet together pull ~600 kB gzipped of WebGL renderer
// that we don't want on the initial bundle for routes like /checkout
// and /account, where the map is only visible once the customer
// expands the address picker.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Map,
  Marker,
  NavigationControl,
  type MapRef,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { Loader2, LocateFixed, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type AddressValue,
  DEFAULT_CENTER,
  featureToValue,
  type MapTilerFeature,
  reverseGeocodeUrl,
} from "@/components/addressInputShared";

interface AddressMapPickerProps {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  apiKey: string;
  styleUrl: string;
}

const AddressMapPicker = ({
  value,
  onChange,
  apiKey,
  styleUrl,
}: AddressMapPickerProps) => {
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

export default AddressMapPicker;
