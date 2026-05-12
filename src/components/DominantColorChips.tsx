import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface DominantColorChipsProps {
  /** Hero image URL the palette is extracted from. */
  imageUrl: string;
  /** Number of swatches to surface. Default 5 — fits the palette
   *  strip cleanly under the buy column. */
  count?: number;
}

interface Swatch {
  hex: string;
  /** 0-255 channel values, kept around for sorting / labels. */
  r: number;
  g: number;
  b: number;
}

const SAMPLE_SIZE = 64;
const STEP = 16; // 16 = 4-bit quantisation; 4096 buckets total.

/**
 * Client-side dominant-colour swatches under the product hero.
 *
 * The painting image is drawn into an off-screen 64×64 canvas, every
 * pixel is bucketed into a 4-bit-per-channel cube, and the most
 * populated buckets become hex chips. Click a chip to copy the hex
 * code — handy for designers / framers matching a wall colour.
 *
 * Quietly renders nothing if:
 * - the image is cross-origin and `crossOrigin="anonymous"` fails the
 *   CORS preflight (we can't read the pixels).
 * - the canvas read throws for any reason.
 * - extraction finishes with fewer than 2 distinct swatches.
 *
 * No new dependency; the entire palette is generated in one pass on
 * the main thread (≈4096 image-data reads, well under 1ms in practice).
 */
export default function DominantColorChips({
  imageUrl,
  count = 5,
}: DominantColorChipsProps) {
  const [swatches, setSwatches] = useState<Swatch[] | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;
    setSwatches(null);
    if (typeof window === "undefined" || !imageUrl) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      if (cancelRef.current) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = SAMPLE_SIZE;
        canvas.height = SAMPLE_SIZE;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        const data = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
        const buckets = new Map<
          number,
          { r: number; g: number; b: number; n: number }
        >();
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a < 200) continue;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          // Drop near-black and near-white pixels so the strip surfaces
          // the actual pigment, not the canvas margin or the gallery
          // shadow.
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          if (max < 24) continue;
          if (min > 232) continue;
          const key =
            Math.floor(r / STEP) * 256 +
            Math.floor(g / STEP) * 16 +
            Math.floor(b / STEP);
          const slot = buckets.get(key);
          if (slot) {
            slot.r += r;
            slot.g += g;
            slot.b += b;
            slot.n += 1;
          } else {
            buckets.set(key, { r, g, b, n: 1 });
          }
        }
        const sorted = Array.from(buckets.values()).sort((a, b) => b.n - a.n);
        const picks: Swatch[] = [];
        for (const slot of sorted) {
          const r = Math.round(slot.r / slot.n);
          const g = Math.round(slot.g / slot.n);
          const b = Math.round(slot.b / slot.n);
          // Skip swatches that are perceptually too close to ones we
          // already picked — keeps the strip diverse.
          const tooClose = picks.some(
            (p) =>
              Math.abs(p.r - r) < 28 &&
              Math.abs(p.g - g) < 28 &&
              Math.abs(p.b - b) < 28,
          );
          if (tooClose) continue;
          picks.push({ hex: rgbToHex(r, g, b), r, g, b });
          if (picks.length >= count) break;
        }
        if (picks.length >= 2 && !cancelRef.current) {
          setSwatches(picks);
        }
      } catch {
        // Cross-origin or other canvas read failure — silently bail.
        // The product page degrades to no palette strip.
      }
    };
    img.onerror = () => {
      // image failed to load — palette simply doesn't render.
    };
    img.src = imageUrl;

    return () => {
      cancelRef.current = true;
    };
  }, [imageUrl, count]);

  if (!swatches || swatches.length < 2) return null;

  const copyHex = async (hex: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(hex);
        toast.success(`Copied ${hex}`);
      } else {
        toast.success(hex);
      }
    } catch {
      toast.error("Couldn't copy");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="font-body text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
        Palette
      </p>
      <div className="flex items-center gap-2">
        {swatches.map((sw) => (
          <button
            key={sw.hex}
            type="button"
            onClick={() => copyHex(sw.hex)}
            aria-label={`Copy color ${sw.hex}`}
            title={sw.hex}
            className="group relative w-7 h-7 rounded-sm border border-border/60 shadow-sm transition-transform duration-200 hover:scale-110 focus-visible:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
            style={{ backgroundColor: sw.hex }}
          >
            <span className="pointer-events-none absolute -bottom-5 left-1/2 -translate-x-1/2 font-body text-[9px] tracking-[0.15em] uppercase text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-200 whitespace-nowrap">
              {sw.hex}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((c) => c.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}
