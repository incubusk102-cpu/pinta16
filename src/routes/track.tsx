import { createFileRoute, Link } from "@tanstack/react-router";
import { Package } from "lucide-react";
import GalleryNav from "@/components/GalleryNav";
import OrderTracker from "@/components/account/OrderTracker";
import SiteFooter from "@/components/SiteFooter";

// Read `?id=` from the live URL once at module level / render time
// (we're not using validateSearch — the param is optional and we want
// to be permissive about casing / trim). Returning the value as the
// initial state keeps React from cascading a re-render through
// useEffect → setState the way an effect-based read would.
const readInitialOrderIdFromUrl = (): string | undefined => {
  if (typeof window === "undefined") return undefined;
  const value = new URLSearchParams(window.location.search).get("id");
  return value ?? undefined;
};

// Public order tracker. Customers who checked out as guests (or who
// signed in once and then signed out / cleared cookies) reach this
// page to look up an order by its ORD-XXXX number — no account
// required. The lookup hits `/api/orders?id=...`, which is
// rate-limited and strips PII (only fullName, city, masked email are
// returned to the public).
//
// We deep-link in two ways:
//   /track            → empty form, customer types the ID
//   /track?id=ORD-... → form pre-fills + auto-fires the lookup
// The post-checkout confirmation modal links to the second form so
// guests can bookmark a working URL even after closing the browser.
export const Route = createFileRoute("/track")({
  component: TrackPage,
  head: () => ({
    meta: [
      { title: "Track your order — Canvas Hub" },
      {
        name: "description",
        content:
          "Look up the status of any Canvas Hub order using your order number. No account required.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function TrackPage() {
  // Mirrors the pattern in /account's `?track=` deep link: read once,
  // pass into the tracker as initial state. No effect / setState pair
  // needed — the lookup runs from inside <OrderTracker /> when an
  // initial ID is present.
  const initialOrderId = readInitialOrderIdFromUrl();

  return (
    <div className="min-h-screen bg-background">
      <GalleryNav />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 pt-28 pb-16">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full border border-border/60 mb-4">
            <Package className="w-5 h-5 text-foreground/80" />
          </div>
          <h1 className="font-display text-3xl sm:text-4xl text-foreground mb-3">
            Track your order
          </h1>
          <p className="font-body text-sm text-muted-foreground max-w-md mx-auto">
            Enter the <span className="font-medium">ORD-XXXX</span> number from
            your confirmation email or text. No sign-in needed — your order
            number is enough.
          </p>
        </div>

        <OrderTracker initialOrderId={initialOrderId} />

        <p className="text-xs text-muted-foreground text-center mt-6">
          Lost your order number?{" "}
          <a
            href="mailto:support@canvhub.com"
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            Email support
          </a>{" "}
          with the email or phone you checked out with and we'll resend it.
          Already have an account?{" "}
          <Link
            to="/account"
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            Sign in for full history
          </Link>
          .
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
