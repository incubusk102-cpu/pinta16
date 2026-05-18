import { lazy, Suspense } from "react";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import GalleryNav from "@/components/GalleryNav";
import GallerySection from "@/components/GallerySection";
import StorefrontErrorBoundary from "@/components/StorefrontErrorBoundary";
import { ContentSkeleton } from "@/components/ui/ContentSkeleton";
import { useSEO } from "@/hooks/useSEO";

interface CollectionSearch {
  q?: string;
  sort?: string;
  categories?: string;
  availability?: string;
  price?: string;
}

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
const InspiredByYouRail = lazy(() => import("@/components/InspiredByYouRail"));

export const Route = createFileRoute("/collection")({
  component: CollectionPage,
  validateSearch: (raw: Record<string, unknown>): CollectionSearch => ({
    q: typeof raw.q === "string" ? raw.q : undefined,
    sort: typeof raw.sort === "string" ? raw.sort : undefined,
    categories: typeof raw.categories === "string" ? raw.categories : undefined,
    availability:
      typeof raw.availability === "string" ? raw.availability : undefined,
    price: typeof raw.price === "string" ? raw.price : undefined,
  }),
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
  const search = useSearch({ from: "/collection" });
  useSEO({
    title: "The Collection — Canvas Hub",
    description:
      "Every Canvas Hub painting in one place. Filter by category, price, and availability — each piece hand-crafted to order by Filipino artists.",
    canonicalPath: "/collection",
  });
  return (
    <div className="min-h-screen bg-background">
      <GalleryNav />
      <main id="main-content" className="pt-24 md:pt-28">
        <StorefrontErrorBoundary surface="collection">
          {/* Gallery render path is the main customer experience on
              /collection and hydrates a fairly heavy grid (filters,
              live search, masonry layout). Show a grid skeleton during
              hydration / chunk-fetch so the slot doesn't collapse to
              0px height while the section's lazy children resolve. */}
          <Suspense fallback={<ContentSkeleton variant="grid" rows={2} />}>
            <GallerySection initialSearch={search} />
          </Suspense>
          {/* `InspiredByYouRail` renders a horizontal card row. The
              "grid" variant is the closest match for the card-shaped
              placeholder so the slot doesn't collapse during the rail's
              lazy-chunk fetch. */}
          <Suspense fallback={<ContentSkeleton variant="grid" rows={2} />}>
            <section className="px-4 sm:px-6 md:px-12 max-w-7xl mx-auto">
              <InspiredByYouRail />
            </section>
          </Suspense>
        </StorefrontErrorBoundary>
      </main>
      <Suspense fallback={null}>
        <CartDrawer />
        <CheckoutForm />
      </Suspense>
    </div>
  );
}
