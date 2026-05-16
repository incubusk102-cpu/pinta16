import { lazy, Suspense, useMemo } from "react";
import { useStorefrontConfig } from "@/contexts/StorefrontConfigContext";
import { useProducts } from "@/contexts/ProductContext";
import { findArtworkById } from "@/lib/artworks";

/**
 * `<WallScene />` — the "Painting of the Day" landing slot further
 * down the homepage. The Daily card's painting physically travels into
 * this section as the visitor scrolls past the Daily card (see
 * `<TravelingDailyPainting />`), then takes over as the inline auto-
 * rotating Three.js viewer once the travel completes.
 *
 * Per user request the bespoke "wall" design (plaster gradient,
 * picture rail, baseboard, spotlight, hanging cord, matte-black wood
 * frame, gold trim, cream matt, cast shadow, museum nameplate) was
 * stripped — the section sits on the site's default page background
 * and contains nothing but the painting itself. The `<WallPainting3D />`
 * viewer is the same Three.js scene the customer sees when they open
 * a painting at `/product/:id`; auto-rotation runs as a decorative
 * idle, pointer events are disabled so vertical scrolling / taps
 * pass through to the page.
 *
 * Visibility is coordinated with `<TravelingDailyPainting />` via a
 * CSS custom property on `:root`:
 *
 *   --daily-travel-progress: 0..1
 *
 * The wall content fades in linearly with travel progress so the
 * section reads as empty until the painting has actually arrived.
 * When no `<TravelingDailyPainting />` is mounted (reduced-motion /
 * no daily artwork), the variable is unset and the fallback (1) shows
 * the painting from first paint — no scroll required.
 *
 * The Three.js viewer is heavy (~120 KB gzipped) so it's lazy-imported
 * — only the small WallScene shell ships in the initial homepage
 * bundle, then the 3D module loads in parallel with the rest of the
 * page.
 */

const WallPainting3D = lazy(() => import("./WallPainting3D"));

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
      aria-label={`${artwork.title} — on the wall`}
      className="relative isolate w-full py-16 sm:py-20 md:py-28"
    >
      {/* Opacity shell driven by `--daily-travel-progress`. On first
          paint with the travel animation enabled the variable is `0`
          and the painting is invisible — the section reads as empty
          page space. As the proxy painting flies down from the Daily
          card the shell fades in linearly so the 3D viewer takes over
          where the proxy lands. With no proxy mounted (reduced-motion
          / no artwork) the variable is unset and the fallback `1`
          shows the painting from first paint. */}
      <div
        className="mx-auto flex w-full max-w-md flex-col items-center px-4 sm:px-6"
        style={{
          opacity: "var(--daily-travel-progress, 1)",
        }}
      >
        {/* `[data-wall-target]` is the rect that
            `<TravelingDailyPainting />` interpolates its flying proxy
            into. The square aspect ratio gives the 3D scene the same
            framing as the source image inside the Daily card so the
            proxy → 3D handoff is positionally seamless. */}
        <div data-wall-target className="relative aspect-square w-full">
          <Suspense fallback={null}>
            <WallPainting3D imageUrl={image} />
          </Suspense>
        </div>
      </div>
    </section>
  );
};

export default WallScene;
