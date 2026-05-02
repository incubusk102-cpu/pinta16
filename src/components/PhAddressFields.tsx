// PH address picker (province / city / barangay as type-or-pick
// combobox inputs). Region is intentionally NOT a visible field —
// each PH province belongs to exactly one region, so we derive the
// region (and its courier zone: Metro Manila / Luzon / Visayas /
// Mindanao) from the picked province behind the scenes. The
// per-courier × per-zone shipping-fee math still works without
// asking the buyer to pick the region twice.
//
// Province / city / barangay each render an `AddressTypeahead`: a
// plain text input where the buyer can either type their place freely
// or click a matching suggestion from the dropdown. PSGC suggestions
// (sourced from `src/data/ph-psgc.json`) are *help, not a gate* — if a
// barangay is missing, misspelled in PSGC, or just not in the list at
// all (think remote sitios), the buyer types it themselves and moves
// on. Cascade resets only fire when the user explicitly *picks* a
// different parent value; free-typed edits leave dependent fields
// alone so a typo in the middle of "Cebu" doesn't wipe a city the
// buyer already filled in.
//
// The PSGC JSON is dynamically imported on first mount so it lands in
// its own Vite chunk (~190 KB gzipped) and stays out of the initial
// page bundle.
//
// Returns a single structured value object the parent can persist
// alongside the address book entry / order info.

import * as React from "react";
import { Building, Home, Hash, MapPin, Pin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ALL_PH_PROVINCES,
  regionForProvince,
  zoneForProvince,
  type ShippingZone,
} from "@/lib/ph-regions";
import {
  loadPhPsgcData,
  getCachedPhPsgcData,
  getCitiesForProvince,
  getBarangaysForCity,
  type PhPsgcData,
} from "@/lib/ph-psgc";
import { AddressTypeahead } from "@/components/AddressTypeahead";

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
  // Province dropdown is now flat (all 81+ PH provinces). Region is
  // hidden from the form; we derive region+zone from the picked
  // province behind the scenes so the per-courier × per-zone shipping
  // fee math still works.
  const provinceOptions = ALL_PH_PROVINCES;

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

  // Cascade reset only when the buyer explicitly picks a different
  // parent value (`picked=true`). Free-typed edits keep dependent
  // fields intact so mid-keystroke typos don't blow them away.
  // Region + zone are derived from province on every change so the
  // hidden-region UX stays consistent with the shipping-fee math.
  const updateProvince = (province: string, picked = false) => {
    const regionId = regionForProvince(province);
    const zone = zoneForProvince(province);
    if (picked) {
      onChange({
        ...value,
        province,
        region: regionId,
        zone,
        city: "",
        barangay: "",
      });
    } else {
      onChange({ ...value, province, region: regionId, zone });
    }
  };

  const updateCity = (city: string, picked = false) => {
    if (picked) {
      onChange({ ...value, city, barangay: "" });
    } else {
      onChange({ ...value, city });
    }
  };

  const updateBarangay = (barangay: string) => {
    onChange({ ...value, barangay });
  };

  return (
    <div className="space-y-3">
      {/* Province (region is hidden — derived behind the scenes) */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          <Building className="w-3.5 h-3.5" />
          Province
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
        <AddressTypeahead
          value={value.province}
          onChange={updateProvince}
          options={provinceOptions}
          disabled={disabled}
          placeholder="Type your province (suggestions below)"
        />
      </div>

      {/* City + Barangay (free-text with PSGC suggestions) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <Building className="w-3.5 h-3.5" />
            City / Municipality
          </Label>
          <AddressTypeahead
            value={value.city}
            onChange={updateCity}
            options={cityOptions}
            loading={!psgc}
            disabled={disabled}
            placeholder="Type your city / municipality"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <Pin className="w-3.5 h-3.5" />
            Barangay
          </Label>
          <AddressTypeahead
            value={value.barangay}
            onChange={updateBarangay}
            options={barangayOptions}
            loading={!psgc}
            disabled={disabled}
            placeholder="Type your barangay"
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
