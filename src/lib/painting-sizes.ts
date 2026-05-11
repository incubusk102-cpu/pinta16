// painting-sizes — shared helpers for the made-to-order size selector
// used by the "View on your wall" preview and any future cart-side
// surfaces that need to normalise / display a painting size.
//
// Canvhub products are made to order, so a single listing can be
// painted at any of several discrete sizes. The product `dimensions`
// field is a free-form string ("60×90 cm", "60 x 90", "Custom") that
// the artist writes when listing the piece. We treat it as a *hint*
// for which preset to highlight by default — never as a hard limit
// on what the customer can request.
//
// All units are centimetres internally. Conversion to world units
// (metres) for the 3D preview happens at the call site so this module
// stays free of three.js / R3F dependencies and can be unit-tested
// in isolation.

export interface PaintingSizeCm {
  widthCm: number;
  heightCm: number;
}

export interface SizePreset extends PaintingSizeCm {
  /** Short label shown on the chip, e.g. "S", "M", "L", "XL", "XXL". */
  label: string;
  /** Long-form caption shown under the chip, e.g. "30 × 40 cm". */
  caption: string;
}

// Conservative defaults that cover the common Filipino home-décor
// canvas sizes. Tuned to be useful for portraits, landscapes, and
// square pieces alike. Per-product overrides land in a follow-up
// once the admin form grows a dimensions editor.
export const SIZE_PRESETS: ReadonlyArray<SizePreset> = [
  { widthCm: 30, heightCm: 40, label: "S", caption: "30 × 40 cm" },
  { widthCm: 45, heightCm: 60, label: "M", caption: "45 × 60 cm" },
  { widthCm: 60, heightCm: 90, label: "L", caption: "60 × 90 cm" },
  { widthCm: 90, heightCm: 120, label: "XL", caption: "90 × 120 cm" },
  { widthCm: 120, heightCm: 160, label: "XXL", caption: "120 × 160 cm" },
] as const;

export const DEFAULT_SIZE_PRESET: SizePreset = SIZE_PRESETS[2]; // L (60×90)

// Convert centimetres to a "human" string. Keeps trailing zeros off
// integer values (60 not 60.0) but allows half-cm precision for the
// rare custom slider input ("47.5 × 62.5 cm").
const formatCm = (cm: number): string => {
  const rounded = Math.round(cm * 2) / 2;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

export const formatSize = ({ widthCm, heightCm }: PaintingSizeCm): string =>
  `${formatCm(widthCm)} × ${formatCm(heightCm)} cm`;

export const formatSizeInches = ({
  widthCm,
  heightCm,
}: PaintingSizeCm): string => {
  const inch = (cm: number) => Math.round((cm / 2.54) * 10) / 10;
  return `${inch(widthCm)}″ × ${inch(heightCm)}″`;
};

// Parse a free-form dimensions string. Accepts the unicode "×" as
// well as "x" / "X" / "*", optional whitespace, optional trailing
// unit ("cm" / "in" / "inch" / "inches"). Returns null when the
// string isn't recognisably size-shaped — callers must handle that
// (typically by falling back to `DEFAULT_SIZE_PRESET`).
export const parseDimensions = (raw: unknown): PaintingSizeCm | null => {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const match = trimmed
    .toLowerCase()
    .match(
      /^\s*(\d+(?:\.\d+)?)\s*(?:×|x|\*)\s*(\d+(?:\.\d+)?)\s*(cm|centimetres?|centimeters?|in|inch|inches|")?\s*$/iu,
    );
  if (!match) return null;

  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return null;
  }

  const unit = match[3];
  const isInches =
    unit === "in" || unit === "inch" || unit === "inches" || unit === '"';
  const widthCm = isInches ? w * 2.54 : w;
  const heightCm = isInches ? h * 2.54 : h;

  // Sanity-cap to the realistic canvas-size range so a typo'd
  // "6000 x 9000" doesn't blow up the 3D scene with a fifty-metre
  // canvas. 5–500 cm is the inclusive band we accept.
  if (widthCm < 5 || widthCm > 500 || heightCm < 5 || heightCm > 500) {
    return null;
  }

  return { widthCm, heightCm };
};

// Pick the preset whose area is closest to the supplied target.
// Aspect-ratio match is intentionally NOT considered — the preview
// will scale the painting's natural aspect to fit the chosen frame,
// and at canvhub scale (handful of presets) area-match has been
// empirically the most useful signal for "what size did the artist
// likely have in mind?".
export const closestPreset = (target: PaintingSizeCm | null): SizePreset => {
  if (!target) return DEFAULT_SIZE_PRESET;
  const targetArea = target.widthCm * target.heightCm;
  let bestPreset = DEFAULT_SIZE_PRESET;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const preset of SIZE_PRESETS) {
    const presetArea = preset.widthCm * preset.heightCm;
    const distance = Math.abs(presetArea - targetArea);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestPreset = preset;
    }
  }
  return bestPreset;
};

// Convenience: pick the default preset given a product's free-form
// dimensions string. Falls through to `DEFAULT_SIZE_PRESET` when
// the string is missing or unparseable.
export const defaultPresetFor = (dimensions: unknown): SizePreset =>
  closestPreset(parseDimensions(dimensions));
