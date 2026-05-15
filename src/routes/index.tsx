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
import SilentBoundary from "@/components/SilentBoundary";
import { useUserAuth } from "@/contexts/UserAuthContext";

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

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Canvas Hub — Affordable Art, Authentic Stories" },
      {
        name: "description",
        content:
          "Discover hand-crafted paintings that transform spaces. Each piece tells a story, crafted with passion and precision.",
      },
      { property: "og:title", content: "Canvas Hub — Affordable Art Gallery" },
      {
        property: "og:description",
        content:
          "Original paintings, hand-crafted upon order. Browse our collection of affordable art.",
      },
    ],
  }),
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
    title: "Canvas Hub — Original Filipino Paintings, Hand-Crafted to Order",
    description:
      "Discover hand-crafted original paintings from the Philippines. Browse the Canvas Hub gallery — each piece made to order by Filipino artists, shipped nationwide.",
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
      <ScrollDepth id={HOME_SECTION_IDS.daily}>
        <DailyFeature />
      </ScrollDepth>
      <AnimeDivider />
      {/* Optional studio reel — renders only when admin has set a
          videoUrl in /admin → Storefront → Studio reel; otherwise the
          page collapses straight from DailyFeature into the
          collection scene. */}
      <HomepageVideoMontage />
      <CinematicCollectionCTA />
      <Suspense fallback={null}>
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
      <Suspense fallback={null}>
        <CartDrawer />
        <CheckoutForm />
        <MobileBackToCollection />
      </Suspense>
      <SectionDock items={SECTION_DOCK_ITEMS} />
      <IdleNudgeToast />
    </div>
  );
}
