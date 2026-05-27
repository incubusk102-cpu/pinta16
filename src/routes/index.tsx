import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import GalleryNav from "@/components/GalleryNav";
import HeroSlider from "@/components/HeroSlider";
import HomeHero from "@/components/HomeHero";
import { useHeroSlides } from "@/contexts/HeroSlidesContext";
import { useSEO } from "@/hooks/useSEO";
import VisitorTicker from "@/components/VisitorTicker";
import PaintingMarquee from "@/components/PaintingMarquee";
import DailyFeature from "@/components/DailyFeature";
import CinematicCollectionCTA from "@/components/CinematicCollectionCTA";
import HomepageVideoMontage from "@/components/HomepageVideoMontage";
import Ornament from "@/components/decor/Ornament";
import AnimeDivider from "@/components/motion/AnimeDivider";
import SectionDock from "@/components/SectionDock";
import IdleNudgeToast from "@/components/IdleNudgeToast";
import ScrollDepth from "@/components/motion/ScrollDepth";
import WallScene from "@/components/motion/WallScene";
import TravelingDailyPainting from "@/components/motion/TravelingDailyPainting";
import SilentBoundary from "@/components/SilentBoundary";
import { useUserAuth } from "@/contexts/UserAuthContext";
import { ProductRailSkeleton } from "@/components/ui/ProductCardSkeleton";

// Cinematic 3D backdrop for the landing page. Renders a fixed,
// behind-content WebGL scene (gold particle halo + slowly rotating
// wireframe icosahedron) that reacts to scroll position — the camera
// dollies forward as the visitor moves down the page, giving the
// homepage the "floating in space" depth Mario asked for. Desktop /
// fine-pointer only; mobile gets the CSS gradient fallback baked
// into the component. Lazy so the three.js chunk is shared with
// `Hero3D` / `PaintingViewer3D` and never blocks first paint.
//
// The `.catch()` on the import means a stale-chunk fetch failure (e.g.
// a visitor whose tab is holding an `index.html` from before a deploy)
// resolves to a no-op component instead of rejecting the Promise, so
// the homepage continues to render normally. The existing
// `installChunkReloadHandler` (src/lib/chunkReload.ts) still picks up
// the `vite:preloadError` event and reloads the page in the
// background to pick up the fresh chunks. The `<SilentBoundary>` at
// the render site is the belt-and-braces guard for the same scenario
// plus any runtime error inside Three.js / WebGL init on quirky
// browsers.
const LandingBackdrop3D = lazy(() =>
  import("@/components/LandingBackdrop3D").catch(() => ({
    // Empty fragment satisfies React.lazy's `() => Element` typing
    // while still rendering nothing visible. Used only as the
    // graceful no-op when the dynamic chunk fetch fails.
    default: () => <></>,
  })),
);

// Anchor ids consumed by the floating SectionDock. Centralised so the
// wrapper <section> ids on this page and the dock's `items` list can't
// drift apart.
const HOME_SECTION_IDS = {
  hero: "home-hero",
  marquee: "home-marquee",
  daily: "home-daily",
  cta: "gallery",
  forYou: "home-for-you",
  about: "about",
  reviews: "reviews",
} as const;

const SECTION_DOCK_ITEMS = [
  { id: HOME_SECTION_IDS.hero, label: "Hero" },
  { id: HOME_SECTION_IDS.marquee, label: "Marquee" },
  { id: HOME_SECTION_IDS.daily, label: "Daily" },
  { id: HOME_SECTION_IDS.cta, label: "CTA" },
  { id: HOME_SECTION_IDS.forYou, label: "For you" },
  { id: HOME_SECTION_IDS.about, label: "About" },
  { id: HOME_SECTION_IDS.reviews, label: "Reviews" },
];

// Below-the-fold sections — split out of the main entry chunk via
// React.lazy so the homepage's first paint downloads less JS. Each
// import becomes its own chunk and starts downloading in parallel
// once the entry mounts; <Suspense fallback={null}> keeps the slot
// empty until the chunk lands rather than showing a placeholder
// flash. The customer can't see these sections at first paint
// anyway (they're below the dynamic carousels), so the small render
// delay is invisible. Above-the-fold components (PaintingMarquee,
// VisitorTicker, DailyFeature) stay eager so the curated landing
// experience is interactive on first paint.
const RecommendedRow = lazy(() => import("@/components/RecommendedRow"));
const RecentlyViewed = lazy(() => import("@/components/RecentlyViewed"));
const InspiredByYouRail = lazy(() => import("@/components/InspiredByYouRail"));
const AboutSection = lazy(() => import("@/components/AboutSection"));
const ThankYouWall = lazy(() => import("@/components/ThankYouWall"));
const ReviewsSection = lazy(() => import("@/components/ReviewsSection"));
const ContactSection = lazy(() => import("@/components/ContactSection"));
// CartDrawer / CheckoutForm / MobileBackToCollection are conditional
// UI (drawers + a sticky mobile back-to-collection button) that only
// reveal themselves on user interaction. Lazy + their own Suspense so
// they don't wait on AboutSection / ReviewsSection / ContactSection's
// chunks before they can mount and listen for cart-open events.
const CartDrawer = lazy(() => import("@/components/CartDrawer"));
const CheckoutForm = lazy(() => import("@/components/CheckoutForm"));
const MobileBackToCollection = lazy(
  () => import("@/components/MobileBackToCollection"),
);

// `head()` is a TanStack Start (SSR) primitive and is a no-op under the
// plain TanStack Router runtime this app ships. Per-route document head
// management is handled client-side by the `useSEO` hook in `Index()`
// below, and server-side OG / JSON-LD enrichment for crawlers is done
// by `functions/_middleware.js`. See IMPROVEMENTS.md item 11.
export const Route = createFileRoute("/")({
  component: Index,
});

interface HeroOrFallbackProps {
  /** When true, the brand-welcome fallback (`<HomeHero />`) is suppressed
   *  but admin-configured slides still render. Used for signed-in
   *  customers, who get the dense GalleryNav instead of the welcome but
   *  should still see promotional slides the admin set up. */
  suppressFallback?: boolean;
}

function HeroOrFallback({ suppressFallback = false }: HeroOrFallbackProps) {
  const { slides, loading } = useHeroSlides();
  // When admin has uploaded hero slides via /admin → Hero slider,
  // those take precedence (the operator's promotional copy / CTAs
  // matter more than ambient brand atmosphere) and render for both
  // signed-out and signed-in visitors — promotional banners are
  // explicitly set up by the admin and meant for every shopper.
  // Otherwise the homepage drops into the cinematic 3D hero — a
  // floating framed painting with bloom on desktop, a static
  // fallback on mobile — but only for signed-out visitors. Signed-in
  // customers already onboarded, so the brand-welcome is suppressed
  // and the page jumps straight into the curated carousels.
  // We keep an `sr-only` <h1> path while data is loading so the
  // smoke suite (`tests/e2e/smoke.spec.ts` asserts
  // `page.locator("h1").first()` visible on `/`), document outline,
  // and SEO crawlers still find a heading on the very first frame.
  if (loading) {
    return <h1 className="sr-only">Canvas Hub</h1>;
  }
  if (slides.length === 0) {
    if (suppressFallback) return null;
    return <HomeHero />;
  }
  return <HeroSlider />;
}

// The previous text-only "Browse the collection" card has been
// replaced by `CinematicCollectionCTA` — a full-bleed scene with a
// parallax artwork collage, scroll-reveal headline, and film-grain
// overlay — so the gap between the dynamic carousels and the
// editorial block reads as a deliberate intermission instead of a
// plain CTA panel. The new component preserves the `id="gallery"`
// anchor so legacy `/#gallery` deep links still scroll correctly.

function Index() {
  useSEO({
    title: "Canvas Hub — Original Filipino Products, Hand-Crafted to Order",
    description:
      "Discover hand-crafted original products from the Philippines. Browse the Canvas Hub gallery — each piece made to order by Filipino makers, shipped nationwide.",
    canonicalPath: "/",
  });
  const { user } = useUserAuth();
  // Hero shows only to signed-out visitors so first-time visitors get the
  // Canvas Hub welcome and a reason to register. Once a customer is signed
  // in there's no need for the welcome — drop straight into the curated
  // carousels so they can focus on picking artwork.
  //
  // The dense 2-column GallerySection grid that used to live here was
  // moved to /collection so the homepage reads like an editorial site
  // rather than a product-catalogue dump. Discovery happens through the
  // dynamic carousels (PaintingMarquee auto-scrolling strip, DailyFeature,
  // RecommendedRow, RecentlyViewed) and a single "Browse the Collection"
  // CTA below the daily feature for shoppers who want the full grid.
  return (
    <div className="smooth-scroll relative">
      {/* Site-wide 3D backdrop — sits behind every section via
          `fixed inset-0 -z-10` and never receives pointer events,
          so it's purely visual chrome. The Canvhub logo / wordmark
          live in GalleryNav / HomeHero / HeroSlider above this layer
          and are not touched by the 3D scene. Wrapped in a silent
          error boundary so any render / chunk-load failure renders
          null instead of taking the whole route down to the global
          "Something went wrong" page — the backdrop is purely
          decorative and the page must keep working without it. */}
      <SilentBoundary label="landing-backdrop-3d">
        <Suspense fallback={null}>
          <LandingBackdrop3D />
        </Suspense>
      </SilentBoundary>
      {user && <GalleryNav />}
      {/* `<main id="main-content">` is the skip-link target wired up by
          `<__root />`'s "Skip to main content" link. The floating chrome
          below (`<SectionDock />`, `<IdleNudgeToast />`, the cart /
          checkout drawers, and the traveling-daily-painting effect)
          lives as a sibling so it doesn't get focused by the skip link. */}
      <main id="main-content">
        {/* Signed-out visitors see the full welcome (`HomeHero` 3D scene
          when no slides are configured, or the admin slider when they
          are). Signed-in customers skip the brand-welcome — they're
          already onboarded — but still see admin-configured promotional
          slides via `suppressFallback`, so a "Sale" / "New collection"
          banner reaches every shopper, not just first-time visitors. */}
        <section id={HOME_SECTION_IDS.hero}>
          <HeroOrFallback suppressFallback={Boolean(user)} />
        </section>
        {/* Scroll-depth wrappers below — each section drifts up + scales
          + brightens through its scroll window, pairing with the
          backdrop's camera dolly to give the homepage a coherent
          z-axis parallax. Honours `prefers-reduced-motion`. */}
        <ScrollDepth id={HOME_SECTION_IDS.marquee}>
          <PaintingMarquee />
        </ScrollDepth>
        <AnimeDivider />
        <VisitorTicker />
        {/* Painting of the Day — the actual card stays where it has
          always been, but it's wrapped in a `[data-daily-card]`
          opacity shell that `<TravelingDailyPainting />` fades out as
          the visitor scrolls the painting itself down to the
          `<WallScene />` below. When the visitor scrolls back up the
          card fades back in and the painting returns to it. Mobile /
          reduced-motion visitors don't get the travel — the wrapper's
          opacity falls back to `1` and the card stays visible. */}
        <ScrollDepth id={HOME_SECTION_IDS.daily}>
          <div
            data-daily-card
            style={{
              opacity: "var(--daily-card-opacity, 1)",
              transition: "opacity 80ms linear",
            }}
          >
            <DailyFeature />
          </div>
        </ScrollDepth>
        <AnimeDivider />
        {/* Optional studio reel — renders only when admin has set a
          videoUrl in /admin → Storefront → Studio reel; otherwise the
          page collapses straight from DailyFeature into the
          collection scene. */}
        <HomepageVideoMontage />
        <CinematicCollectionCTA />
        <Suspense
          fallback={
            <section className="px-4 sm:px-6 md:px-12 max-w-7xl mx-auto space-y-8 py-8">
              <ProductRailSkeleton />
              <ProductRailSkeleton />
            </section>
          }
        >
          <section
            id={HOME_SECTION_IDS.forYou}
            className="px-4 sm:px-6 md:px-12 max-w-7xl mx-auto"
          >
            <RecommendedRow />
            <RecentlyViewed />
            <InspiredByYouRail />
          </section>
          <div className="px-4 sm:px-6 md:px-12 max-w-3xl mx-auto py-8">
            <Ornament label="The studio" />
          </div>
          {/* Sentinel watched by MobileBackToCollection — when this scrolls
            above the viewport the floating "View Collection" pill is
            revealed. Sits just before the editorial block (About /
            ThankYou / Reviews / Contact) so the pill shows up only when
            the customer has drifted away from the dynamic shopping
            carousels into the studio story. Zero visual footprint. */}
          <div
            id="back-to-collection-sentinel"
            aria-hidden="true"
            className="h-px"
          />
        </Suspense>
        {/* On the wall today — the dedicated wall scene where the
          Painting of the Day lands after the visitor has scrolled
          past the Daily card and the carousels. `<TravelingDailyPainting />`
          (mounted at the bottom of the route) interpolates a fixed
          proxy painting from the Daily card into this section's
          `[data-wall-target]` frame on scroll, then fades the
          landed `<img>` inside this section in over the final 10% of
          travel so the handoff between the flying proxy and the
          section-flow painting is invisible. Reduced-motion visitors
          don't render the proxy at all and see the landed painting
          from first paint.

          WallScene is mounted OUTSIDE the lazy-section Suspense so
          its `[data-wall-scene]` / `[data-wall-target]` markers are in
          the DOM before `<TravelingDailyPainting />` creates its
          ScrollTrigger. If WallScene were inside the Suspense and any
          of the lazy sections (About / ThankYou / Reviews / Contact)
          took a while to load, the entire subtree would suspend and
          the ScrollTrigger would silently no-op because its trigger
          selector would resolve to `null`.

          Wrapped in a SilentBoundary so a render-time crash inside the
          3D wall viewer (e.g. WebGL init failure on a quirky browser,
          or a stale-chunk error after a deploy) never takes down the
          whole homepage — the wall is decorative and the page must
          keep working without it. */}
        <SilentBoundary label="wall-scene">
          <WallScene />
        </SilentBoundary>
        <Suspense fallback={null}>
          <AboutSection />
          <div className="px-4 sm:px-6 md:px-12 max-w-3xl mx-auto py-8">
            <Ornament label="Voices" />
          </div>
          <ThankYouWall />
          <ReviewsSection />
          <div className="px-4 sm:px-6 md:px-12 max-w-3xl mx-auto py-8">
            <Ornament label="Stay in touch" />
          </div>
          <ContactSection />
        </Suspense>
      </main>
      <Suspense fallback={null}>
        <CartDrawer />
        <CheckoutForm />
        <MobileBackToCollection />
      </Suspense>
      <SectionDock items={SECTION_DOCK_ITEMS} />
      <IdleNudgeToast />
      {/* Floating proxy painting that physically travels from the
          Daily card down to `<WallScene />` on scroll. Lives at the
          end of the tree so its `position: fixed` element sits above
          the page content but below modals / drawers (z-40 vs the
          drawers' z-50). Reduced-motion visitors get a `return null`
          from inside the component and see the painting in both the
          Daily card and on the wall instead. Mobile / coarse-pointer
          visitors don't see the travel either — `<WallScene />`
          itself is desktop-only (see its module comment), so the
          destination rect doesn't exist and the proxy bails out
          early.

          Wrapped in a SilentBoundary because the inner ScrollTrigger
          setup talks to GSAP through a `useEffect` and runs through a
          handful of synchronous GSAP callbacks. If any of those throw
          (e.g. the GSAP `ScrollTrigger.onRefresh` TDZ crash hit in PR
          #498 / fixed in PR #499, or any future regression in this
          choreography), the boundary catches the render-time error
          and returns null so the rest of the homepage — hero,
          marquee, Daily card, carousels, wall — keeps rendering. The
          travel animation is purely decorative; the painting still
          shows in both the Daily card and the wall via the
          `--daily-card-opacity` / `--daily-travel-progress` CSS
          fallback values, so visitors don't lose access to the
          artwork even when the travel itself is disabled. */}
      <SilentBoundary label="traveling-daily-painting">
        <TravelingDailyPainting />
      </SilentBoundary>
    </div>
  );
}
