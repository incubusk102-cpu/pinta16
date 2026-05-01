// PH cascading address picker.
//
// Checkout's primary address input: Region → Province → City/Municipality
// → Barangay → Street + Landmark + Postal code. All four geographic
// levels are real cascading dropdowns now — region/province come from
// the static `ph-regions.ts` list, while city + barangay are sourced
// from the official PSA/PSGC dataset under `src/data/ph-psgc.json`.
// That JSON is dynamically imported the first time this component
// mounts, so it lands in its own Vite chunk (~190 KB gzipped) and
// doesn't bloat the initial page bundle.
//
// Region drives courier zone (Metro Manila / Luzon / Visayas /
// Mindanao) which auto-fills shipping fee at checkout. City + barangay
// have hundreds of entries each (Manila has 897 barangays alone) so we
// use a Popover + cmdk Combobox with type-ahead instead of a plain
// `<Select>`.
//
// Returns a single structured value object the parent can persist
// alongside the address book entry / order info.

import * as React from "react";
import { Building, Home, Hash, MapPin, Pin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PH_REGIONS,
  provincesForRegion,
  zoneForRegion,
  type ShippingZone,
} from "@/lib/ph-regions";
import {
  loadPhPsgcData,
  getCachedPhPsgcData,
  getCitiesForProvince,
  getBarangaysForCity,
  type PhPsgcData,
} from "@/lib/ph-psgc";
import { AddressCombobox } from "@/components/AddressCombobox";

export interface PhAddressValue {
  region: string;
  province: string;
  city: string;
  barangay: string;
  line1: string; // street, building, house no.
  landmark?: string;
  postalCode?: string;
  country: string;
  zone: ShippingZone | null;
}

export const EMPTY_PH_ADDRESS: PhAddressValue = {
  region: "",
  province: "",
  city: "",
  barangay: "",
  line1: "",
  landmark: "",
  postalCode: "",
  country: "Philippines",
  zone: null,
};

export interface PhAddressFieldsProps {
  value: PhAddressValue;
  onChange: (next: PhAddressValue) => void;
  /** Show a small zone hint chip next to the region label. */
  showZoneHint?: boolean;
  /** Disable all inputs (e.g. while submitting). */
  disabled?: boolean;
}

const PH_POSTAL_PATTERN = /^\d{4}$/;

export const isValidPhPostal = (raw: string): boolean =>
  !raw || PH_POSTAL_PATTERN.test(raw.trim());

export function PhAddressFields({
  value,
  onChange,
  showZoneHint = true,
  disabled = false,
}: PhAddressFieldsProps) {
  const provinceOptions = provincesForRegion(value.region);

  // Lazy-load PSGC data on mount; cached across instances so the
  // dynamic import only fires once per page load.
  const [psgc, setPsgc] = React.useState<PhPsgcData | null>(
    getCachedPhPsgcData(),
  );
  React.useEffect(() => {
    if (psgc) return;
    let cancelled = false;
    loadPhPsgcData()
      .then((data) => {
        if (!cancelled) setPsgc(data);
      })
      .catch(() => {
        // If the chunk fails to load (offline, CDN hiccup) we leave
        // psgc null — Combobox falls back to placeholder + the user's
        // saved value still renders, so they aren't blocked.
      });
    return () => {
      cancelled = true;
    };
  }, [psgc]);

  const cityOptions = React.useMemo(
    () => getCitiesForProvince(psgc, value.province),
    [psgc, value.province],
  );
  const barangayOptions = React.useMemo(
    () => getBarangaysForCity(psgc, value.province, value.city),
    [psgc, value.province, value.city],
  );

  const updateRegion = (regionId: string) => {
    const zone = zoneForRegion(regionId);
    const provinces = provincesForRegion(regionId);
    // If only one province (NCR), auto-select it so the user doesn't
    // have to click. Otherwise reset province because the old one
    // probably doesn't belong to the new region.
    const nextProvince = provinces.length === 1 ? provinces[0] : "";
    onChange({
      ...value,
      region: regionId,
      province: nextProvince,
      // Province changed → city + barangay are now stale.
      city: "",
      barangay: "",
      zone,
    });
  };

  const updateProvince = (province: string) => {
    // Province changed → reset dependent fields.
    onChange({ ...value, province, city: "", barangay: "" });
  };

  const updateCity = (city: string) => {
    // City changed → reset barangay (was tied to old city).
    onChange({ ...value, city, barangay: "" });
  };

  const updateBarangay = (barangay: string) => {
    onChange({ ...value, barangay });
  };

  return (
    <div className="space-y-3">
      {/* Region + Province */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <MapPin className="w-3.5 h-3.5" />
            Region
            {showZoneHint && value.zone && (
              <span className="ml-auto px-1.5 py-0.5 text-[10px] tracking-wider rounded bg-foreground/5 text-foreground/70">
                {value.zone === "metro_manila"
                  ? "Metro Manila zone"
                  : value.zone === "luzon"
                    ? "Luzon zone"
                    : value.zone === "visayas"
                      ? "Visayas zone"
                      : "Mindanao zone"}
              </span>
            )}
          </Label>
          <Select
            value={value.region}
            onValueChange={updateRegion}
            disabled={disabled}
          >
            <SelectTrigger className="h-10 text-sm">
              <SelectValue placeholder="Select region" />
            </SelectTrigger>
            <SelectContent>
              {PH_REGIONS.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <Building className="w-3.5 h-3.5" />
            Province
          </Label>
          <Select
            value={value.province}
            onValueChange={updateProvince}
            disabled={disabled || provinceOptions.length === 0}
          >
            <SelectTrigger className="h-10 text-sm">
              <SelectValue
                placeholder={
                  provinceOptions.length === 0
                    ? "Select region first"
                    : "Select province"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {provinceOptions.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* City + Barangay (cascading searchable dropdowns) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <Building className="w-3.5 h-3.5" />
            City / Municipality
          </Label>
          <AddressCombobox
            value={value.city}
            onChange={updateCity}
            options={cityOptions}
            loading={!psgc}
            disabled={disabled || !value.province}
            placeholder={
              !value.province
                ? "Select province first"
                : "Select city / municipality"
            }
            searchPlaceholder="Search city / municipality…"
            emptyHint={
              !value.province ? "Pick a province first." : "No matching city."
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <Pin className="w-3.5 h-3.5" />
            Barangay
          </Label>
          <AddressCombobox
            value={value.barangay}
            onChange={updateBarangay}
            options={barangayOptions}
            loading={!psgc}
            disabled={disabled || !value.city}
            placeholder={!value.city ? "Select city first" : "Select barangay"}
            searchPlaceholder="Search barangay…"
            emptyHint={
              !value.city ? "Pick a city first." : "No matching barangay."
            }
          />
        </div>
      </div>

      {/* Street / line1 */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          <Home className="w-3.5 h-3.5" />
          Street, building, unit
        </Label>
        <Input
          value={value.line1}
          onChange={(e) => onChange({ ...value, line1: e.target.value })}
          placeholder="e.g. 123 Maginhawa St., Unit 4B"
          disabled={disabled}
          className="h-10 text-sm"
        />
      </div>

      {/* Landmark + Postal code */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <MapPin className="w-3.5 h-3.5" />
            Landmark (optional)
          </Label>
          <Input
            value={value.landmark ?? ""}
            onChange={(e) => onChange({ ...value, landmark: e.target.value })}
            placeholder="e.g. across SM Annex, blue gate"
            disabled={disabled}
            className="h-10 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <Hash className="w-3.5 h-3.5" />
            Postal code
          </Label>
          <Input
            value={value.postalCode ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                postalCode: e.target.value.replace(/\D/g, "").slice(0, 4),
              })
            }
            placeholder="1101"
            inputMode="numeric"
            maxLength={4}
            disabled={disabled}
            className="h-10 text-sm font-mono"
          />
        </div>
      </div>
    </div>
  );
}

// Compose a single human-readable line out of a PH address. Used when
// we need to fit the full address into one string field (e.g. legacy
// `address` on OrderInfo or print-friendly waybills).
export const composePhAddressLine = (a: PhAddressValue): string => {
  const parts = [
    a.line1,
    a.barangay ? `Brgy. ${a.barangay}` : "",
    [a.city, a.province].filter(Boolean).join(", "),
    a.postalCode || "",
    a.country || "Philippines",
  ];
  return parts.filter(Boolean).join(", ");
};
