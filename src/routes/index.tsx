import { createFileRoute } from "@tanstack/react-router";
import GalleryNav from "@/components/GalleryNav";
import HeroSection from "@/components/HeroSection";
import HeroSlider from "@/components/HeroSlider";
import { useHeroSlides } from "@/contexts/HeroSlidesContext";
import GallerySection from "@/components/GallerySection";
import AboutSection from "@/components/AboutSection";
import ReviewsSection from "@/components/ReviewsSection";
import ContactSection from "@/components/ContactSection";
import CartDrawer from "@/components/CartDrawer";
import CheckoutForm from "@/components/CheckoutForm";
import RecentlyViewed from "@/components/RecentlyViewed";
import Ornament from "@/components/decor/Ornament";
import { useUserAuth } from "@/contexts/UserAuthContext";

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
  // While loading, show static hero so the first paint isn't blank.
  if (loading || slides.length === 0) return <HeroSection />;
  return <HeroSlider />;
}

function Index() {
  const { user } = useUserAuth();
  return (
    <div className="smooth-scroll">
      {user && <GalleryNav />}
      <HeroOrFallback />
      <GallerySection />
      <section className="px-4 sm:px-6 md:px-12 max-w-7xl mx-auto">
        <RecentlyViewed />
      </section>
      <div className="px-4 sm:px-6 md:px-12 max-w-3xl mx-auto py-8">
        <Ornament label="The studio" />
      </div>
      <AboutSection />
      <div className="px-4 sm:px-6 md:px-12 max-w-3xl mx-auto py-8">
        <Ornament label="Voices" />
      </div>
      <ReviewsSection />
      <div className="px-4 sm:px-6 md:px-12 max-w-3xl mx-auto py-8">
        <Ornament label="Stay in touch" />
      </div>
      <ContactSection />
      <CartDrawer />
      <CheckoutForm />
    </div>
  );
}
