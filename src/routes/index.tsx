import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import GalleryNav from "@/components/GalleryNav";
import ScrollGalleryExperience from "@/components/ScrollGalleryExperience";
import { useSEO } from "@/hooks/useSEO";

// The homepage is a single motion / scroll-driven experience
// (`ScrollGalleryExperience`): a blur-in intro, a 3D scroll-tilted
// "Wall" of the catalogue, and a pinned full-bleed "Deck" the visitor
// swipes through. Discovery happens entirely by scrolling — there are
// no "Browse Collection" / pagination buttons. Every tile links into
// `/product/$id`, and the dedicated `/collection` grid still exists for
// shoppers who want filters / search.
//
// CartDrawer / CheckoutForm are conditional UI that listen for
// cart-open events, so a piece can be added + checked out without
// leaving the homepage. Lazy-loaded so they don't block first paint.
const CartDrawer = lazy(() => import("@/components/CartDrawer"));
const CheckoutForm = lazy(() => import("@/components/CheckoutForm"));

// `head()` is a TanStack Start (SSR) primitive and is a no-op under the
// plain TanStack Router runtime this app ships. Per-route document head
// management is handled client-side by the `useSEO` hook in `Index()`.
export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  useSEO({
    title: "Canvas Hub — Original Filipino Products, Hand-Crafted to Order",
    description:
      "Discover hand-crafted original products from the Philippines. Scroll the Canvas Hub gallery — each piece made to order by Filipino makers, shipped nationwide.",
    canonicalPath: "/",
  });

  return (
    <div className="smooth-scroll relative">
      <GalleryNav />
      <main id="main-content">
        <ScrollGalleryExperience />
      </main>
      <Suspense fallback={null}>
        <CartDrawer />
        <CheckoutForm />
      </Suspense>
    </div>
  );
}
