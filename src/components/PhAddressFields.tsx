// PH cascading address picker.
//
// Checkout's primary address input: Region → Province → City/Municipality
// → Barangay → Street + Landmark + Postal code. Region is a dropdown
// because we need it to compute the courier zone (Metro Manila / Luzon /
// Visayas / Mindanao). Province is a dropdown filtered by region.
// City/Municipality and Barangay are free-text (the PSGC has 1.6k
// cities and 42k barangays — we don't want to ship that bundle).
//
// Returns a single structured value object the parent can persist
// alongside the address book entry / order info.
//
// Designed to be a drop-in alongside the existing AddressInput map
// picker — that one stays available for an optional "set pin location"
// step but isn't required to checkout.

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
      zone,
    });
  };

  const updateProvince = (province: string) => {
    onChange({ ...value, province });
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

      {/* City + Barangay */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <Building className="w-3.5 h-3.5" />
            City / Municipality
          </Label>
          <Input
            value={value.city}
            onChange={(e) => onChange({ ...value, city: e.target.value })}
            placeholder="e.g. Quezon City"
            disabled={disabled}
            className="h-10 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <Pin className="w-3.5 h-3.5" />
            Barangay
          </Label>
          <Input
            value={value.barangay}
            onChange={(e) => onChange({ ...value, barangay: e.target.value })}
            placeholder="e.g. Barangay Bagong Pag-asa"
            disabled={disabled}
            className="h-10 text-sm"
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
