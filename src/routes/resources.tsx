import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import GalleryNav from "@/components/GalleryNav";
import { useSEO } from "@/hooks/useSEO";

const ResourcesSection = lazy(() => import("@/components/ResourcesSection"));
const CartDrawer = lazy(() => import("@/components/CartDrawer"));
const CheckoutForm = lazy(() => import("@/components/CheckoutForm"));

export const Route = createFileRoute("/resources")({
  component: ResourcesPage,
  head: () => ({
    meta: [
      { title: "Resources — Canvas Hub" },
      {
        name: "description",
        content:
          "Practical guides for living with hand-crafted pieces: how to hang, light, clean, frame, and store original goods so they last a lifetime.",
      },
      { property: "og:title", content: "Resources — Canvas Hub" },
      {
        property: "og:description",
        content:
          "Care, framing, lighting, and storage guides for collectors of original hand-crafted pieces.",
      },
    ],
  }),
});

function ResourcesPage() {
  useSEO({
    title: "Resources — Canvas Hub",
    description:
      "Practical guides for living with hand-crafted pieces: how to hang, light, clean, frame, and store original goods so they last a lifetime.",
    canonicalPath: "/resources",
  });
  return (
    <div className="min-h-screen bg-background">
      <GalleryNav />
      <main id="main-content" className="pt-24 md:pt-28">
        <Suspense fallback={null}>
          <ResourcesSection />
        </Suspense>
      </main>
      <Suspense fallback={null}>
        <CartDrawer />
        <CheckoutForm />
      </Suspense>
    </div>
  );
}
