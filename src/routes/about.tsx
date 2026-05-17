import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import GalleryNav from "@/components/GalleryNav";
import { useSEO } from "@/hooks/useSEO";

const AboutSection = lazy(() => import("@/components/AboutSection"));
const CartDrawer = lazy(() => import("@/components/CartDrawer"));
const CheckoutForm = lazy(() => import("@/components/CheckoutForm"));

export const Route = createFileRoute("/about")({
  component: AboutPage,
  head: () => ({
    meta: [
      { title: "About — Canvas Hub" },
      {
        name: "description",
        content:
          "Meet the artists behind Canvas Hub. Hand-crafted Filipino paintings made to order from our studio in Bagong Silang, Caloocan.",
      },
      { property: "og:title", content: "About — Canvas Hub" },
      {
        property: "og:description",
        content:
          "Meet the artists behind Canvas Hub. Hand-crafted Filipino paintings made to order.",
      },
    ],
  }),
});

function AboutPage() {
  useSEO({
    title: "About — Canvas Hub",
    description:
      "Meet the artists behind Canvas Hub. Hand-crafted Filipino paintings made to order from our studio in Bagong Silang, Caloocan.",
    canonicalPath: "/about",
  });
  return (
    <div className="min-h-screen bg-background">
      <GalleryNav />
      <main id="main-content" className="pt-24 md:pt-28">
        <Suspense fallback={null}>
          <AboutSection />
        </Suspense>
      </main>
      <Suspense fallback={null}>
        <CartDrawer />
        <CheckoutForm />
      </Suspense>
    </div>
  );
}
