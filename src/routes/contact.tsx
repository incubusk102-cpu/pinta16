import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import GalleryNav from "@/components/GalleryNav";
import { useSEO } from "@/hooks/useSEO";

const ContactSection = lazy(() => import("@/components/ContactSection"));
const CartDrawer = lazy(() => import("@/components/CartDrawer"));
const CheckoutForm = lazy(() => import("@/components/CheckoutForm"));

export const Route = createFileRoute("/contact")({
  component: ContactPage,
  head: () => ({
    meta: [
      { title: "Contact — Canvas Hub" },
      {
        name: "description",
        content:
          "Get in touch with Canvas Hub. Email support@canvhub.com, call +63 956 468 5351, or visit our studio in Bagong Silang, Caloocan.",
      },
      { property: "og:title", content: "Contact — Canvas Hub" },
      {
        property: "og:description",
        content:
          "Reach out to Canvas Hub for inquiries, custom orders, or support.",
      },
    ],
  }),
});

function ContactPage() {
  useSEO({
    title: "Contact — Canvas Hub",
    description:
      "Get in touch with Canvas Hub. Email support@canvhub.com, call +63 956 468 5351, or visit our studio in Bagong Silang, Caloocan.",
    canonicalPath: "/contact",
  });
  return (
    <div className="min-h-screen bg-background">
      <GalleryNav />
      <main id="main-content" className="pt-24 md:pt-28">
        <Suspense fallback={null}>
          <ContactSection />
        </Suspense>
      </main>
      <Suspense fallback={null}>
        <CartDrawer />
        <CheckoutForm />
      </Suspense>
    </div>
  );
}
