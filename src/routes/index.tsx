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
import SectionDivider from "@/components/SectionDivider";
import SectionDock from "@/components/SectionDock";
import IdleNudgeToast from "@/components/IdleNudgeToast";
import { useUserAuth } from "@/contexts/UserAuthContext";

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

function HeroOrFallback() {
  const { slides, loading } = useHeroSlides();
  // When admin has uploaded hero slides via /admin → Hero slider,
  // those take precedence (the operator's promotional copy / CTAs
  // matter more than ambient brand atmosphere). Otherwise the
  // homepage drops into the cinematic 3D hero — a floating framed
  // painting with bloom on desktop, a static fallback on mobile.
  // We keep an `sr-only` <h1> path while data is loading so the
  // smoke suite (`tests/e2e/smoke.spec.ts` asserts
  // `page.locator("h1").first()` visible on `/`), document outline,
  // and SEO crawlers still find a heading on the very first frame.
  if (loading) {
    return <h1 className="sr-only">Canvas Hub</h1>;
  }
  if (slides.length === 0) {
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
    <div className="smooth-scroll">
      {user && <GalleryNav />}
      {!user && (
        <section id={HOME_SECTION_IDS.hero}>
          <HeroOrFallback />
        </section>
      )}
      <section id={HOME_SECTION_IDS.marquee}>
        <PaintingMarquee />
      </section>
      <SectionDivider />
      <VisitorTicker />
      <section id={HOME_SECTION_IDS.daily}>
        <DailyFeature />
      </section>
      <SectionDivider />
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
