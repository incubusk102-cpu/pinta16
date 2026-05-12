import {
  Outlet,
  Link,
  createRootRoute,
  useRouterState,
} from "@tanstack/react-router";
import { Suspense, lazy, useEffect } from "react";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import { CartProvider } from "@/contexts/CartContext";
import { ProductProvider } from "@/contexts/ProductContext";
import { StorefrontConfigProvider } from "@/contexts/StorefrontConfigContext";
import { PoliciesProvider } from "@/contexts/PoliciesContext";
import { HeroSlidesProvider } from "@/contexts/HeroSlidesContext";
import { UserAuthProvider } from "@/contexts/UserAuthContext";
import { WishlistProvider } from "@/contexts/WishlistContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LocaleProvider } from "@/contexts/LocaleContext";
import AnnouncementBar from "@/components/AnnouncementBar";
import SiteFooter from "@/components/SiteFooter";
import AmbientCursorGlow from "@/components/AmbientCursorGlow";
import ScrollProgress from "@/components/ScrollProgress";
import PageTransitions from "@/components/PageTransitions";
import { QuickSpinProvider } from "@/contexts/QuickSpinContext";
import { CompareProvider } from "@/contexts/CompareContext";
import { FlyToCartProvider } from "@/contexts/FlyToCartContext";
import { CommandPaletteProvider } from "@/contexts/CommandPaletteContext";
import CompareDrawer from "@/components/CompareDrawer";
import SmoothScrollProvider from "@/lib/SmoothScrollProvider";
import { useVisitorHeartbeat } from "@/hooks/useVisitorHeartbeat";
import { useUserHeartbeat } from "@/hooks/useUserHeartbeat";
import { useGoogleAuthHash } from "@/hooks/useGoogleAuthHash";
import { usePageEventBeacon } from "@/hooks/usePageEventBeacon";
import { captureReferralFromUrl } from "@/lib/referral";
import { Toaster } from "@/components/ui/sonner";

// Conditional UI — each of these renders nothing until a trigger fires
// (returning-visitor toast, first-visit modal, PWA install prompt,
// passport-stamp threshold, welcome-bonus countdown, post-purchase
// thank-you, chat widget). They were importing synchronously into the
// entry chunk, paying for ~30–40 KB of code that 90% of visitors never
// see on first paint. `React.lazy` shifts each into its own chunk that
// only downloads when the component actually mounts.
const ChatWidget = lazy(() => import("@/components/ChatWidget"));
const NewUserModal = lazy(() => import("@/components/NewUserModal"));
const OrderConfirmation = lazy(() => import("@/components/OrderConfirmation"));
const PwaPrompts = lazy(() => import("@/components/PwaPrompts"));
const PassportTracker = lazy(() => import("@/components/PassportTracker"));
const WelcomeBackToast = lazy(() => import("@/components/WelcomeBackToast"));
const WelcomeBonusCountdown = lazy(
  () => import("@/components/WelcomeBonusCountdown"),
);
const ArtistThankYou = lazy(() => import("@/components/ArtistThankYou"));
const CommandPalette = lazy(() => import("@/components/CommandPalette"));
const KeyboardShortcutsOverlay = lazy(
  () => import("@/components/KeyboardShortcutsOverlay"),
);

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          Page not found
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function HeartbeatBridge() {
  useVisitorHeartbeat();
  useUserHeartbeat();
  usePageEventBeacon();
  return null;
}

function ReferralCaptureBridge() {
  useEffect(() => {
    captureReferralFromUrl();
  }, []);
  return null;
}

// Parses `#auth=...` / `?error=...` that /api/google-callback redirects
// back with. Mounted at root so Google's redirect can land on any
// route (we send visitors to `/` now) instead of bouncing through
// `/login` just to finalize the session.
function GoogleAuthHashBridge() {
  useGoogleAuthHash();
  return null;
}

function ConditionalAnnouncementBar() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  if (pathname.startsWith("/admin")) return null;
  return <AnnouncementBar />;
}

function ConditionalSiteFooter() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  if (pathname.startsWith("/admin")) return null;
  return <SiteFooter />;
}

// Cursor-following ambient spotlight + top-edge scroll-progress
// hairline. Both are storefront-only — admin is a data-dense tool,
// motion chrome there would just distract from the task.
function ConditionalAmbientChrome() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  if (pathname.startsWith("/admin")) return null;
  return (
    <>
      <ScrollProgress />
      <AmbientCursorGlow />
    </>
  );
}

// Mounted globally so the order-journey modal can be opened from anywhere
// (My Orders panel in the hamburger sheet, account page, post-checkout, etc.)
// rather than only on the homepage / product pages where it used to live.
function ConditionalOrderConfirmation() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  if (pathname.startsWith("/admin")) return null;
  return <OrderConfirmation />;
}

// Storefront-only `?` keyboard cheat-sheet — admin already has its
// own command palette and shortcuts, and we don't want the dialog
// blocking admin keystrokes.
function ConditionalKeyboardShortcuts() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  if (pathname.startsWith("/admin")) return null;
  return (
    <Suspense fallback={null}>
      <KeyboardShortcutsOverlay />
    </Suspense>
  );
}

function ConditionalVisitorDelight() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  if (pathname.startsWith("/admin")) return null;
  return (
    <Suspense fallback={null}>
      <PassportTracker />
      <WelcomeBackToast />
      <WelcomeBonusCountdown />
      <ArtistThankYou />
    </Suspense>
  );
}

function RootComponent() {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <AdminAuthProvider>
          <UserAuthProvider>
            <WishlistProvider>
              <StorefrontConfigProvider>
                <PoliciesProvider>
                  <HeroSlidesProvider>
                    <ProductProvider>
                      <CartProvider>
                        <CompareProvider>
                          <FlyToCartProvider>
                            <CommandPaletteProvider>
                              <QuickSpinProvider>
                                <SmoothScrollProvider>
                                  <HeartbeatBridge />
                                  <ReferralCaptureBridge />
                                  <GoogleAuthHashBridge />
                                  <ConditionalAmbientChrome />
                                  <ConditionalAnnouncementBar />
                                  <PageTransitions>
                                    <Outlet />
                                  </PageTransitions>
                                  <ConditionalSiteFooter />
                                  <Suspense fallback={null}>
                                    <ConditionalOrderConfirmation />
                                    <ChatWidget />
                                    <NewUserModal />
                                    <PwaPrompts />
                                    <CommandPalette />
                                  </Suspense>
                                  <ConditionalVisitorDelight />
                                  <ConditionalKeyboardShortcuts />
                                  <CompareDrawer />
                                  <Toaster richColors position="top-right" />
                                </SmoothScrollProvider>
                              </QuickSpinProvider>
                            </CommandPaletteProvider>
                          </FlyToCartProvider>
                        </CompareProvider>
                      </CartProvider>
                    </ProductProvider>
                  </HeroSlidesProvider>
                </PoliciesProvider>
              </StorefrontConfigProvider>
            </WishlistProvider>
          </UserAuthProvider>
        </AdminAuthProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
