import {
  Outlet,
  Link,
  createRootRoute,
  useRouterState,
} from "@tanstack/react-router";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import { CartProvider } from "@/contexts/CartContext";
import { ProductProvider } from "@/contexts/ProductContext";
import { StorefrontConfigProvider } from "@/contexts/StorefrontConfigContext";
import { PoliciesProvider } from "@/contexts/PoliciesContext";
import { HeroSlidesProvider } from "@/contexts/HeroSlidesContext";
import AnnouncementBar from "@/components/AnnouncementBar";
import ChatWidget from "@/components/ChatWidget";
import NewUserModal from "@/components/NewUserModal";
import OrderConfirmation from "@/components/OrderConfirmation";
import PwaPrompts from "@/components/PwaPrompts";
import PassportTracker from "@/components/PassportTracker";
import WelcomeBackToast from "@/components/WelcomeBackToast";
import WelcomeBonusCountdown from "@/components/WelcomeBonusCountdown";
import ArtistThankYou from "@/components/ArtistThankYou";
import SiteFooter from "@/components/SiteFooter";
import SmoothScrollProvider from "@/lib/SmoothScrollProvider";
import { UserAuthProvider } from "@/contexts/UserAuthContext";
import { WishlistProvider } from "@/contexts/WishlistContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { useVisitorHeartbeat } from "@/hooks/useVisitorHeartbeat";
import { useUserHeartbeat } from "@/hooks/useUserHeartbeat";
import { useGoogleAuthHash } from "@/hooks/useGoogleAuthHash";
import { useEffect } from "react";
import { captureReferralFromUrl } from "@/lib/referral";
import { Toaster } from "@/components/ui/sonner";

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

function ConditionalVisitorDelight() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  if (pathname.startsWith("/admin")) return null;
  return (
    <>
      <PassportTracker />
      <WelcomeBackToast />
      <WelcomeBonusCountdown />
      <ArtistThankYou />
    </>
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
                        <SmoothScrollProvider>
                          <HeartbeatBridge />
                          <ReferralCaptureBridge />
                          <GoogleAuthHashBridge />
                          <ConditionalAnnouncementBar />
                          <Outlet />
                          <ConditionalSiteFooter />
                          <ConditionalOrderConfirmation />
                          <ChatWidget />
                          <NewUserModal />
                          <PwaPrompts />
                          <ConditionalVisitorDelight />
                          <Toaster richColors position="top-right" />
                        </SmoothScrollProvider>
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
