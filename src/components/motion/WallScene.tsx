import { lazy, Suspense, useMemo } from "react";
import { useStorefrontConfig } from "@/contexts/StorefrontConfigContext";
import { useProducts } from "@/contexts/ProductContext";
import { findArtworkById } from "@/lib/artworks";

/**
 * `<WallScene />` — the "Painting of the Day" landing slot further
 * down the homepage. The Daily card's painting physically travels into
 * this section as the visitor scrolls past the Daily card (see
 * `<TravelingDailyPainting />`), then takes over as the inline
 * pinch-zoomable Three.js viewer once the travel completes.
 *
 * Per user request the bespoke "wall" design (plaster gradient,
 * picture rail, baseboard, spotlight, hanging cord, matte-black wood
 * frame, gold trim, cream matt, cast shadow, museum nameplate) was
 * stripped — the section sits on the site's default page background
 * and contains nothing but the painting itself.
 *
 * Visibility is coordinated with `<TravelingDailyPainting />` via two
 * CSS custom properties on `:root`:
 *
 *   --daily-travel-progress      : 0..1  (fade-in as the wall enters view)
 *   --daily-wall-leave-opacity   : 0..1  (fade-out as the wall leaves view)
 *
 * The wall content's opacity is the product of the two: the painting
 * fades in linearly with travel progress so the section reads as
 * empty until the painting has actually arrived, and fades back out
 * symmetrically as the section scrolls off the top so the painting
 * doesn't linger over the page below.
 *
 * When no `<TravelingDailyPainting />` is mounted (reduced-motion /
 * no daily artwork), both variables are unset and the fallback (1)
 * shows the painting from first paint — no scroll required.
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
      {/* Opacity shell driven by two scroll-linked variables.
          `--daily-travel-progress` (0..1) ramps from 0 → 1 as the
          flying proxy painting flies down from the Daily card into
          the section, so the painting reads as empty page space
          until the proxy has actually landed.
          `--daily-wall-leave-opacity` (0..1) does the opposite on
          the way out: 1 while the section is in view, 0 once the
          section has fully scrolled off the top.
          Multiplying the two means the painting is shown only while
          the section is actually on screen — it fades back into the
          Daily card on the way up, and fades out into empty page
          space on the way down. With no proxy mounted (reduced-motion
          / no artwork) both variables are unset and the fallback `1`
          on each side keeps the painting visible from first paint. */}
      <div
        className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 sm:px-6"
        style={{
          opacity:
            "calc(var(--daily-travel-progress, 1) * var(--daily-wall-leave-opacity, 1))",
        }}
      >
        {/* `[data-wall-target]` is the rect that
            `<TravelingDailyPainting />` interpolates its flying proxy
            into. The square aspect ratio gives the 3D scene the same
            framing as the source image inside the Daily card so the
            proxy → 3D handoff is positionally seamless. The container
            is widened to `max-w-3xl` (was `max-w-md`) so the inline
            wall viewer renders the painting at a similar visual scale
            to the product-page `<PaintingViewer3D />` modal — visitors
            land on a piece that fills the section, not a small card. */}
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
