import { useMemo } from "react";
import { useStorefrontConfig } from "@/contexts/StorefrontConfigContext";
import { useProducts } from "@/contexts/ProductContext";
import { findArtworkById } from "@/lib/artworks";

/**
 * `<WallScene />` — the dedicated "on the wall today" section that
 * sits further down the homepage. The Painting of the Day eventually
 * lands here as the visitor scrolls past the Daily section.
 *
 * Layout (top → bottom):
 *
 *   ┌─────────────────────────── wall ──────────────────────────┐
 *   │ ─── picture rail ────────────────────────────────────────── │
 *   │                                                             │
 *   │                       ╔═══════════╗                          │
 *   │                  hook │  PAINTING │  spotlight              │
 *   │                       ╚═══════════╝                          │
 *   │                       —— nameplate ——                        │
 *   │                       (cast shadow)                          │
 *   │                                                             │
 *   │ ─── baseboard ─────────────────────────────────────────── │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Visual layers (z-stack, low → high):
 *   1. `wall surface`  : plaster gradient + inline-SVG noise
 *   2. `spotlight`     : radial highlight where the painting hangs
 *   3. `picture rail`  : thin warm-wood line at the top
 *   4. `baseboard`     : darker strip at the floor
 *   5. `frame + matt`  : matte-black wood outer + gold inner trim + cream matt
 *   6. `hanging cord`  : two thin angled lines + a small dot
 *   7. `painting`      : the actual `<img>` (object-cover, rounded corners)
 *   8. `cast shadow`   : soft elliptical shadow under the frame
 *   9. `nameplate`     : museum placard with the title
 *
 * Visibility is coordinated with the `<TravelingDailyPainting />`
 * floating proxy via a CSS custom property on `:root`:
 *
 *   --daily-travel-progress: 0..1
 *
 * The "landed" painting fades in from `0.9 → 1.0` so it cleanly takes
 * over from the proxy at the end of the travel. When no
 * `<TravelingDailyPainting />` is mounted (reduced-motion / mobile /
 * no daily artwork), the variable is unset and the landed painting
 * uses its CSS fallback (1.0) — the painting is shown on the wall
 * from first paint, no scroll required.
 */

const WallScene = () => {
  const { config, loading } = useStorefrontConfig();
  const { products } = useProducts();

  const today = config.dailyFeatureToday;

  const artwork = useMemo(() => {
    if (!today?.productId) return undefined;
    return findArtworkById(today.productId, products);
  }, [today?.productId, products]);

  if (loading) return null;
  if (!today || !artwork) return null;

  const image = artwork.images?.[0]?.url || artwork.image;

  return (
    <section
      data-wall-scene
      aria-label="On the wall today"
      className="relative isolate w-full overflow-hidden py-16 sm:py-20 md:py-28"
      style={{
        // Plaster wall — warm cream gradient that darkens toward the
        // floor so the baseboard reads as a real moulding rather than a
        // floating strip of paint. Layered over an inline-SVG noise
        // pattern for plaster grain (data URL → no extra HTTP hit).
        backgroundImage: [
          "linear-gradient(180deg, #f1ebde 0%, #e6dccb 55%, #d8caaf 100%)",
          "url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.32 0 0 0 0 0.24 0 0 0 0 0.12 0 0 0 0.12 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        ].join(", "),
        backgroundBlendMode: "multiply",
      }}
    >
      {/* Picture-rail moulding at the very top of the wall — thin
          warm-wood-toned line with a 1-pixel highlight above it. Reads
          as the dark stained rail you'd see on a real gallery wall. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 right-0 h-1.5"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.55) 18%, #6f5235 18%, #4a361f 100%)",
          boxShadow: "0 2px 4px -1px rgba(60,40,20,0.18)",
        }}
      />

      {/* Baseboard at the bottom of the wall — slightly cooler / darker
          strip with a 1-pixel highlight on top, reads as floor moulding
          parting from the wall plaster. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-5"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.4) 6%, #3b2e1f 6%, #281e10 100%)",
          boxShadow: "0 -3px 6px -2px rgba(40,30,15,0.22)",
        }}
      />

      {/* Container for the painting + nameplate. Centred, with enough
          internal padding so the frame doesn't crowd the rail / floor. */}
      <div className="relative mx-auto flex max-w-3xl flex-col items-center px-4 sm:px-6">
        {/* Spotlight — soft radial highlight behind where the painting
            hangs. Read as a museum picture light. Positioned so the
            brightest point sits just above the painting and falls off
            smoothly toward the floor. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-[-20%] left-1/2 z-0 h-[140%] w-[120%] -translate-x-1/2"
          style={{
            background:
              "radial-gradient(ellipse 55% 45% at 50% 30%, rgba(255,247,225,0.78) 0%, rgba(255,247,225,0.32) 35%, rgba(255,247,225,0) 72%)",
            mixBlendMode: "screen",
          }}
        />

        {/* Hanging cord — two thin angled lines from a single nail
            point above the frame. Pure CSS, no images. Sits above the
            frame in z-order. */}
        <div
          aria-hidden="true"
          className="relative z-10 mb-[-1px] flex h-10 w-full justify-center"
        >
          <div className="relative h-full w-44">
            {/* Nail dot — small dark circle at the apex */}
            <span
              className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full"
              style={{
                background: "#1c1c1c",
                boxShadow: "0 1px 0 rgba(0,0,0,0.35)",
              }}
            />
            {/* Left cord — thin line angling down-left */}
            <span
              className="absolute left-1/2 top-1 h-px w-[55%] origin-top-left"
              style={{
                background:
                  "linear-gradient(90deg, rgba(28,28,28,0.85), rgba(28,28,28,0.45))",
                transform: "rotate(135deg)",
              }}
            />
            {/* Right cord — thin line angling down-right */}
            <span
              className="absolute right-1/2 top-1 h-px w-[55%] origin-top-right"
              style={{
                background:
                  "linear-gradient(90deg, rgba(28,28,28,0.45), rgba(28,28,28,0.85))",
                transform: "rotate(-135deg)",
              }}
            />
          </div>
        </div>

        {/* Frame + painting block. This is what
            `<TravelingDailyPainting />` targets via `[data-wall-target]`
            to know where to land the proxy. The painting `<img>` lives
            inside this block (the "landed" copy of the painting) and is
            faded in by `--daily-travel-progress`. */}
        <div className="relative z-10 w-full max-w-md">
          {/* Cast shadow under the frame — soft ellipse, gives the
              painting visual weight against the wall. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-6 -bottom-3 z-0 h-6"
            style={{
              background:
                "radial-gradient(ellipse 60% 100% at 50% 50%, rgba(20,12,2,0.32) 0%, rgba(20,12,2,0) 75%)",
              filter: "blur(2px)",
            }}
          />

          <div
            data-wall-target
            className="relative z-10 aspect-square w-full"
            style={{
              // Matte-black outer wood frame. Two thin inset shadows
              // give it micro-bevels (top-left highlight, bottom-right
              // shadow) without us needing a real wood-grain texture.
              backgroundColor: "#0f0f0f",
              padding: "10px",
              boxShadow: [
                "inset 0 1px 0 rgba(255,255,255,0.06)",
                "inset 0 -1px 0 rgba(0,0,0,0.55)",
                "0 18px 30px -14px rgba(20,15,5,0.45)",
              ].join(", "),
              borderRadius: "2px",
            }}
          >
            {/* Gold-leaf inner trim — warm gold ring just inside the
                matte black. This is the "premium" detail. */}
            <div
              className="relative h-full w-full"
              style={{
                padding: "2px",
                background:
                  "linear-gradient(135deg, #d8b56a 0%, #c9a96e 50%, #a78348 100%)",
                borderRadius: "1px",
              }}
            >
              {/* Slim cream mat between gold trim and the painting. */}
              <div
                className="relative h-full w-full"
                style={{
                  padding: "10px",
                  backgroundColor: "#f5f3ee",
                }}
              >
                {/* The "landed" painting. Opacity is driven by the
                    `--daily-travel-progress` CSS variable, so it only
                    appears at the very end of the travel (0.9 → 1.0).
                    On mobile / reduced-motion (no traveling proxy
                    mounted), the variable is unset and the fallback
                    (1) shows the painting from first paint. */}
                <img
                  data-landed-painting
                  src={image}
                  alt={artwork.title}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                  style={{
                    opacity:
                      "max(0, calc((var(--daily-travel-progress, 1) - 0.9) * 10))",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Museum-style nameplate just below the frame. Cream strip
              with the painting title in display serif, dark-on-cream
              keyline. Fades in with the painting. */}
          <div
            className="relative z-10 mx-auto mt-5 max-w-xs px-4 py-2 text-center"
            style={{
              background: "linear-gradient(180deg, #f5f3ee 0%, #ece7da 100%)",
              borderTop: "1px solid rgba(28,28,28,0.18)",
              borderBottom: "1px solid rgba(28,28,28,0.18)",
              opacity:
                "max(0, calc((var(--daily-travel-progress, 1) - 0.9) * 10))",
            }}
          >
            <p className="font-display text-base text-foreground sm:text-lg">
              {artwork.title}
            </p>
            {artwork.medium ? (
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                {artwork.medium}
                {artwork.dimensions ? ` · ${artwork.dimensions}` : ""}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
};

export default WallScene;
