import { describe, it, expect } from "vitest";
import {
  parseDimensions,
  closestPreset,
  defaultPresetFor,
  formatSize,
  formatSizeInches,
  SIZE_PRESETS,
  DEFAULT_SIZE_PRESET,
} from "@/lib/painting-sizes";

describe("SIZE_PRESETS", () => {
  it("is ordered smallest to largest by area", () => {
    const areas = SIZE_PRESETS.map((p) => p.widthCm * p.heightCm);
    const sorted = [...areas].sort((a, b) => a - b);
    expect(areas).toEqual(sorted);
  });

  it("DEFAULT_SIZE_PRESET is one of the presets", () => {
    expect(SIZE_PRESETS).toContain(DEFAULT_SIZE_PRESET);
  });
});

describe("parseDimensions", () => {
  it("returns null for non-string input", () => {
    expect(parseDimensions(null)).toBeNull();
    expect(parseDimensions(undefined)).toBeNull();
    expect(parseDimensions(42)).toBeNull();
    expect(parseDimensions({})).toBeNull();
  });

  it("returns null for empty / unparseable strings", () => {
    expect(parseDimensions("")).toBeNull();
    expect(parseDimensions("   ")).toBeNull();
    expect(parseDimensions("Custom")).toBeNull();
    expect(parseDimensions("approx 60cm")).toBeNull();
  });

  it("parses unicode × separator", () => {
    expect(parseDimensions("60×90 cm")).toEqual({
      widthCm: 60,
      heightCm: 90,
    });
  });

  it("parses ascii x / X / * separators", () => {
    expect(parseDimensions("60 x 90 cm")).toEqual({
      widthCm: 60,
      heightCm: 90,
    });
    expect(parseDimensions("60X90")).toEqual({
      widthCm: 60,
      heightCm: 90,
    });
    expect(parseDimensions("60*90 cm")).toEqual({
      widthCm: 60,
      heightCm: 90,
    });
  });

  it("parses decimal values", () => {
    expect(parseDimensions("47.5 × 62.5 cm")).toEqual({
      widthCm: 47.5,
      heightCm: 62.5,
    });
  });

  it("converts inches to centimetres", () => {
    const result = parseDimensions("24 x 36 inches");
    expect(result?.widthCm).toBeCloseTo(60.96, 2);
    expect(result?.heightCm).toBeCloseTo(91.44, 2);
  });

  it("accepts the inch double-quote unit", () => {
    expect(parseDimensions('12 × 16"')).not.toBeNull();
  });

  it("rejects unrealistic dimensions (under 5cm or over 500cm)", () => {
    expect(parseDimensions("2 × 3 cm")).toBeNull();
    expect(parseDimensions("600 × 900 cm")).toBeNull();
  });

  it("rejects zero / negative dimensions", () => {
    expect(parseDimensions("0 × 0 cm")).toBeNull();
  });
});

describe("closestPreset", () => {
  it("returns the default preset for null input", () => {
    expect(closestPreset(null)).toBe(DEFAULT_SIZE_PRESET);
  });

  it("returns the exact-match preset when one exists", () => {
    expect(closestPreset({ widthCm: 60, heightCm: 90 })).toEqual(
      expect.objectContaining({ widthCm: 60, heightCm: 90 }),
    );
  });

  it("picks the area-nearest preset for non-standard sizes", () => {
    // 50×70 = 3500cm² → closer to 45×60 (2700) than to 60×90 (5400)
    // Actually 3500 - 2700 = 800, 5400 - 3500 = 1900 → 45×60 wins.
    expect(closestPreset({ widthCm: 50, heightCm: 70 })).toEqual(
      expect.objectContaining({ widthCm: 45, heightCm: 60 }),
    );
  });

  it("clamps very large sizes to the largest preset", () => {
    expect(closestPreset({ widthCm: 200, heightCm: 300 })).toEqual(
      expect.objectContaining({ widthCm: 120, heightCm: 160 }),
    );
  });
});

describe("defaultPresetFor", () => {
  it("derives a preset from a free-form dimensions string", () => {
    expect(defaultPresetFor("60×90 cm")).toEqual(
      expect.objectContaining({ widthCm: 60, heightCm: 90 }),
    );
  });

  it("falls through to the default preset when unparseable", () => {
    expect(defaultPresetFor("Custom")).toBe(DEFAULT_SIZE_PRESET);
    expect(defaultPresetFor(undefined)).toBe(DEFAULT_SIZE_PRESET);
  });
});

describe("formatSize", () => {
  it("uses the unicode × and 'cm' suffix", () => {
    expect(formatSize({ widthCm: 60, heightCm: 90 })).toBe("60 × 90 cm");
  });

  it("strips trailing .0 on integer values", () => {
    expect(formatSize({ widthCm: 60, heightCm: 90 })).not.toContain(".0");
  });

  it("keeps half-cm precision when present", () => {
    expect(formatSize({ widthCm: 47.5, heightCm: 62.5 })).toBe(
      "47.5 × 62.5 cm",
    );
  });
});

describe("formatSizeInches", () => {
  it("converts cm to inches with one decimal place", () => {
    expect(formatSizeInches({ widthCm: 60.96, heightCm: 91.44 })).toBe(
      "24″ × 36″",
    );
  });
});
