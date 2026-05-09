import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import GalleryNav from "@/components/GalleryNav";
import GallerySection from "@/components/GallerySection";

// /collection is the dedicated browse page. The homepage was trimmed to
// hero + dynamic carousels (marquee, daily feature, recommended,
// recently viewed) so the landing experience reads like a curated
// website rather than a product-catalogue dump. Customers who want to
// see every painting + filter / search / sort it land here instead.
//
// The CartDrawer / CheckoutForm are lazy-loaded the same way the
// homepage does it: they're conditional UI that listens for cart-open
// events, so the customer can add a piece directly from the gallery
// here and check out without bouncing back to /.
const CartDrawer = lazy(() => import("@/components/CartDrawer"));
const CheckoutForm = lazy(() => import("@/components/CheckoutForm"));

export const Route = createFileRoute("/collection")({
  component: CollectionPage,
  head: () => ({
    meta: [
      { title: "The Collection — Canvas Hub" },
      {
        name: "description",
        content:
          "Every Canvas Hub painting in one place. Search, filter by category, price, or availability — each piece hand-crafted to order.",
      },
      {
        property: "og:title",
        content: "The Collection — Canvas Hub",
      },
      {
        property: "og:description",
        content:
          "Browse every Canvas Hub painting. Original Filipino works on canvas, hand-crafted upon order.",
      },
    ],
  }),
});

function CollectionPage() {
  return (
    <div className="min-h-screen bg-background">
      <GalleryNav />
      <main className="pt-24 md:pt-28">
        <GallerySection />
      </main>
      <Suspense fallback={null}>
        <CartDrawer />
        <CheckoutForm />
      </Suspense>
    </div>
  );
}
