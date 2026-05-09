import { lazy, Suspense } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import GalleryNav from "@/components/GalleryNav";
import HeroSlider from "@/components/HeroSlider";
import { useHeroSlides } from "@/contexts/HeroSlidesContext";
import VisitorTicker from "@/components/VisitorTicker";
import PaintingMarquee from "@/components/PaintingMarquee";
import DailyFeature from "@/components/DailyFeature";
import Ornament from "@/components/decor/Ornament";
import { useUserAuth } from "@/contexts/UserAuthContext";

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
  // The static hero (eyebrow + brush divider + body + "View Collection"
  // button) was removed per the May 7 design call. When admin has no
  // slides configured (or is still loading), the homepage now drops
  // straight into the marquee + gallery and we keep only an `sr-only`
  // <h1> so the smoke suite (`tests/e2e/smoke.spec.ts` asserts
  // `page.locator("h1").first()` visible on `/`), document outline,
  // and SEO crawlers all still find a heading. Once admin uploads
  // slides via /admin → Hero slider, those render in place of the
  // sr-only h1.
  if (loading || slides.length === 0) {
    return <h1 className="sr-only">Canvas Hub</h1>;
  }
  return <HeroSlider />;
}

// Replaces the dense 2-column GallerySection grid that used to sit
// inline on the homepage. Single editorial-feel card that points
// curious shoppers to /collection where the full filterable grid
// now lives. Kept terse on purpose — the homepage is meant to feel
// curated, not catalogue-heavy.
function CollectionCTA() {
  return (
    <section
      id="gallery"
      className="px-4 sm:px-6 md:px-12 max-w-3xl mx-auto py-12 sm:py-16 text-center"
      aria-label="Browse the collection"
    >
      <p className="font-body text-[10px] sm:text-xs tracking-[0.4em] uppercase text-muted-foreground mb-4">
        The collection
      </p>
      <h2 className="font-display text-2xl sm:text-3xl md:text-4xl text-foreground mb-4 leading-tight">
        Every painting, in one place
      </h2>
      <p className="font-body text-sm text-muted-foreground mb-8 max-w-xl mx-auto leading-relaxed">
        Browse the full catalogue — search by mood, filter by category or price,
        and find the piece that fits your wall.
      </p>
      <Link
        to="/collection"
        className="inline-flex items-center justify-center px-8 py-4 bg-foreground text-background font-body text-xs tracking-[0.25em] uppercase hover:bg-foreground/90 transition-colors rounded-sm"
      >
        Browse the collection
      </Link>
    </section>
  );
}

function Index() {
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
      {!user && <HeroOrFallback />}
      <PaintingMarquee />
      <VisitorTicker />
      <DailyFeature />
      <CollectionCTA />
      <Suspense fallback={null}>
        <section className="px-4 sm:px-6 md:px-12 max-w-7xl mx-auto">
          <RecommendedRow />
          <RecentlyViewed />
        </section>
        <div className="px-4 sm:px-6 md:px-12 max-w-3xl mx-auto py-8">
          <Ornament label="The studio" />
        </div>
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
    </div>
  );
}
