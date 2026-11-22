import { describe, it, expect } from "vitest";
import {
  COURIERS,
  SHIPPABLE_COURIER_IDS,
  LALAMOVE_PAID_TO_RIDER,
  LALAMOVE_COURIER_ID,
  LALAMOVE_RANGE_BY_PROVINCE,
  getLalamoveRange,
  formatLalamoveRange,
  PROVINCE_CENTROIDS,
  haversineKm,
  DEFAULT_LALAMOVE_FARE,
  computeLalamoveFareEstimate,
  findCourierById,
  findCourierTemplate,
  buildTrackingUrl,
  DEFAULT_SHIPPING_RATES,
  getShippingFee,
  hasShippingRates,
} from "@/lib/shipment";

describe("courier table", () => {
  it("only allows Lalamove as a checkout-time courier", () => {
    expect(SHIPPABLE_COURIER_IDS).toEqual(["lalamove"]);
    expect(LALAMOVE_PAID_TO_RIDER).toBe(true);
    expect(LALAMOVE_COURIER_ID).toBe("lalamove");
  });

  it("retains legacy couriers for resolving historical tracking links", () => {
    const ids = COURIERS.map((c) => c.id);
    for (const legacy of ["j&t", "jrs", "lbc", "ninjavan", "flash"]) {
      expect(ids).toContain(legacy);
    }
  });

  it("findCourierById returns the matching row or undefined", () => {
    expect(findCourierById("lalamove")?.label).toBe("Lalamove");
    expect(findCourierById("nonexistent")).toBeUndefined();
  });
});

describe("findCourierTemplate / buildTrackingUrl", () => {
  it("returns the tracking template for a known courier id", () => {
    expect(findCourierTemplate("lbc")).toContain("{tn}");
  });

  it("matches by case-insensitive label as a fallback", () => {
    expect(findCourierTemplate("J&T Express")).toContain("{tn}");
  });

  it("returns undefined when the courier is unknown", () => {
    expect(findCourierTemplate("totally-bogus")).toBeUndefined();
    expect(findCourierTemplate("")).toBeUndefined();
  });

  it("builds a URL by substituting the tracking number", () => {
    const url = buildTrackingUrl("lbc", "ABC123");
    expect(url).toContain("ABC123");
  });

  it("URI-encodes the tracking number to defend against template injection", () => {
    const url = buildTrackingUrl("lbc", "A B/C?d=1");
    expect(url).toContain("A%20B%2FC%3Fd%3D1");
  });

  it("returns the override URL when it looks like an HTTP(S) URL", () => {
    const override = "https://override.example.com/track/xyz";
    expect(buildTrackingUrl("lbc", "ignored", override)).toBe(override);
  });

  it("falls back to the template when override is not an HTTP URL", () => {
    expect(buildTrackingUrl("lbc", "ABC", "not-a-url")).toContain("ABC");
  });

  it("returns undefined when tracking number is empty and no override", () => {
    expect(buildTrackingUrl("lbc", "")).toBeUndefined();
  });
});

describe("Lalamove range lookups", () => {
  it("returns the MM range for 'metro manila' (case-insensitive, trimmed)", () => {
    const r = getLalamoveRange("  Metro Manila  ");
    expect(r).toBeDefined();
    expect(r?.min).toBe(LALAMOVE_RANGE_BY_PROVINCE["metro manila"].min);
  });

  it("returns undefined for an empty or unknown province", () => {
    expect(getLalamoveRange("")).toBeUndefined();
    expect(getLalamoveRange("atlantis")).toBeUndefined();
  });

  it("formats a range with a peso prefix and en-dash", () => {
    expect(formatLalamoveRange({ min: 100, max: 250 })).toBe("₱100–₱250");
  });

  it("appends the note in parens when present", () => {
    expect(
      formatLalamoveRange({ min: 700, max: 1500, note: "long route" }),
    ).toBe("₱700–₱1,500 (long route)");
  });
});

describe("haversineKm", () => {
  it("returns 0 for identical coordinates", () => {
    expect(haversineKm(14.6, 121.0, 14.6, 121.0)).toBeCloseTo(0, 5);
  });

  it("computes a known short distance within tolerance", () => {
    // ~111 km per degree of latitude near the equator/PH.
    const km = haversineKm(14, 121, 15, 121);
    expect(km).toBeGreaterThan(110);
    expect(km).toBeLessThan(112);
  });

  it("is symmetric (a→b == b→a)", () => {
    const ab = haversineKm(14, 121, 16, 122);
    const ba = haversineKm(16, 122, 14, 121);
    expect(ab).toBeCloseTo(ba, 6);
  });
});

describe("computeLalamoveFareEstimate", () => {
  it("returns null when config is missing or disabled", () => {
    expect(computeLalamoveFareEstimate(null, "metro manila")).toBeNull();
    expect(computeLalamoveFareEstimate(undefined, "metro manila")).toBeNull();
    expect(
      computeLalamoveFareEstimate(
        { ...DEFAULT_LALAMOVE_FARE, enabled: false },
        "metro manila",
      ),
    ).toBeNull();
  });

  it("returns null when province is empty or unknown", () => {
    expect(computeLalamoveFareEstimate(DEFAULT_LALAMOVE_FARE, "")).toBeNull();
    expect(
      computeLalamoveFareEstimate(DEFAULT_LALAMOVE_FARE, "atlantis"),
    ).toBeNull();
  });

  it("returns null when perKmRate is zero or negative", () => {
    expect(
      computeLalamoveFareEstimate(
        { ...DEFAULT_LALAMOVE_FARE, perKmRate: 0 },
        "metro manila",
      ),
    ).toBeNull();
  });

  it("respects the configured minimum fare", () => {
    const estimate = computeLalamoveFareEstimate(
      { ...DEFAULT_LALAMOVE_FARE, minFare: 5000 },
      "metro manila",
    );
    expect(estimate?.fare).toBe(5000);
  });

  it("returns a positive fare and distance for a non-MM Luzon province", () => {
    const estimate = computeLalamoveFareEstimate(
      DEFAULT_LALAMOVE_FARE,
      "batangas",
    );
    expect(estimate).not.toBeNull();
    expect(estimate!.fare).toBeGreaterThan(DEFAULT_LALAMOVE_FARE.baseFee);
    expect(estimate!.distanceKm).toBeGreaterThan(0);
    expect(estimate!.provinceLabel).toBe("batangas");
  });
});

describe("PROVINCE_CENTROIDS", () => {
  it("includes every province present in LALAMOVE_RANGE_BY_PROVINCE", () => {
    for (const province of Object.keys(LALAMOVE_RANGE_BY_PROVINCE)) {
      expect(PROVINCE_CENTROIDS[province]).toBeDefined();
    }
  });

  it("centroids are within Philippines bounding box (4–22°N, 116–127°E)", () => {
    for (const [name, [lat, lng]] of Object.entries(PROVINCE_CENTROIDS)) {
      expect(lat, name).toBeGreaterThan(4);
      expect(lat, name).toBeLessThan(22);
      expect(lng, name).toBeGreaterThan(116);
      expect(lng, name).toBeLessThan(127);
    }
  });
});

describe("getShippingFee", () => {
  it("returns null when inputs are missing", () => {
    expect(getShippingFee(undefined, "lbc", "luzon")).toBeNull();
    expect(getShippingFee(DEFAULT_SHIPPING_RATES, "", "luzon")).toBeNull();
    expect(getShippingFee(DEFAULT_SHIPPING_RATES, "lbc", null)).toBeNull();
  });

  it("returns the matching fee from the table (case-insensitive courier id)", () => {
    expect(getShippingFee(DEFAULT_SHIPPING_RATES, "LBC", "metro_manila")).toBe(
      DEFAULT_SHIPPING_RATES.find((r) => r.courierId === "lbc")!.fees
        .metro_manila,
    );
  });

  it("returns null when the courier is missing from the table", () => {
    expect(
      getShippingFee(DEFAULT_SHIPPING_RATES, "nonexistent", "luzon"),
    ).toBeNull();
  });

  it("ignores non-finite / negative fees in the table", () => {
    // The runtime-defensive shape getShippingFee is built to handle:
    // negative or non-finite fees should be treated as missing.
    // Casting through `unknown` because the corrupt shape is
    // intentionally NOT a valid ShippingRate.
    const corrupt = [
      {
        courierId: "ghost",
        courierLabel: "Ghost",
        fees: {
          metro_manila: -1,
          luzon: Number.NaN,
          visayas: 100,
          mindanao: 100,
        },
      },
    ] as unknown as Parameters<typeof getShippingFee>[0];
    expect(getShippingFee(corrupt, "ghost", "metro_manila")).toBeNull();
    expect(getShippingFee(corrupt, "ghost", "luzon")).toBeNull();
    expect(getShippingFee(corrupt, "ghost", "visayas")).toBe(100);
  });
});

describe("hasShippingRates", () => {
  it("returns false for empty / undefined input", () => {
    expect(hasShippingRates(undefined)).toBe(false);
    expect(hasShippingRates([])).toBe(false);
  });

  it("returns true when at least one courier has a non-zero fee", () => {
    expect(hasShippingRates(DEFAULT_SHIPPING_RATES)).toBe(true);
  });

  it("returns false when every fee is zero", () => {
    const allZero: Parameters<typeof hasShippingRates>[0] = [
      {
        courierId: "lbc",
        courierLabel: "LBC",
        fees: { metro_manila: 0, luzon: 0, visayas: 0, mindanao: 0 },
      },
    ];
    expect(hasShippingRates(allZero)).toBe(false);
  });
});
