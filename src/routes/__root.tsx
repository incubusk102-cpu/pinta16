import {
  Outlet,
  Link,
  createRootRoute,
  useRouterState,
} from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import { CartProvider, useCart } from "@/contexts/CartContext";
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
import RouteWipeOverlay from "@/components/RouteWipeOverlay";
import { useSEO } from "@/hooks/useSEO";
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
import RootErrorBoundary from "@/components/RootErrorBoundary";

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
  // 404 pages must not be indexed — they're transient by definition
  // (broken links, stale shares, mistyped URLs) and indexing them
  // pollutes the SERP with content-less doorway pages.
  useSEO({
    title: "Page Not Found — Canvas Hub",
    description:
      "The page you're looking for doesn't exist or has been moved. Head back to the Canvas Hub gallery to keep browsing.",
    noindex: true,
  });
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

// Breadcrumb into `/public/boot-diagnostics.js`. Lets the static
// stall-watchdog tell us whether the SPA ever reached its root
// commit — if `root:mounted` shows up in the overlay we know
// `createRoot.render()` ran *and* React committed at least one
// frame, narrowing a blank-screen failure to something below the
// providers chain. See main.tsx for the full breadcrumb sequence.
function BootMountMark() {
  useEffect(() => {
    try {
      window.__cvBoot?.mark("root:mounted");
    } catch {
      /* never let diagnostics crash a mount */
    }
  }, []);
  return null;
}

function ReferralCaptureBridge() {
  useEffect(() => {
    captureReferralFromUrl();
  }, []);
  return null;
}

// Bundle of "storefront-only" providers that don't carry any
// admin-relevant state — Compare drawer, fly-to-cart animation
// channel, keyboard command palette, QuickSpin 3D preview. Combining
// them into one helper unstacks the 15-level provider pyramid in
// `RootComponent` below by four levels, without changing the
// rendered React tree. See IMPROVEMENTS.md item 6.
//
// Audit (improvement.md A1): every consumer of `useCompare`,
// `useFlyToCart`, `useQuickSpin`, and `useCommandPalette` lives in
// the storefront tree — `ArtworkCard`, `GalleryNav`, `CompareDrawer`,
// `CommandPalette`, and the product page — none of which mount under
// the `/admin` route. `ConditionalStorefrontProviders` below skips
// these four layers (plus their setup effects — a localStorage read
// in Compare, a window keydown listener in CommandPalette) on admin
// routes so the admin tree stays four providers thinner.
function StorefrontProviders({ children }: { children: ReactNode }) {
  return (
    <CompareProvider>
      <FlyToCartProvider>
        <CommandPaletteProvider>
          <QuickSpinProvider>{children}</QuickSpinProvider>
        </CommandPaletteProvider>
      </FlyToCartProvider>
    </CompareProvider>
  );
}

// Route-aware gate around `StorefrontProviders`. Returns the bare
// children on `/admin/*` so the admin tree doesn't pay for four
// storefront-only context layers (and their setup effects —
// CompareProvider reads from localStorage on mount, CommandPalette
// attaches a global keydown listener). Storefront routes get the
// original behaviour. See improvement.md A1.
function ConditionalStorefrontProviders({ children }: { children: ReactNode }) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  if (pathname.startsWith("/admin")) return <>{children}</>;
  return <StorefrontProviders>{children}</StorefrontProviders>;
}

// Bundle of provider layers that don't render anything but need to
// exist for `useCart` / `useWishlist` / etc. to find their context.
// Same readability rationale as `StorefrontProviders`.
function GlobalAuthProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <AdminAuthProvider>
          <UserAuthProvider>
            <WishlistProvider>{children}</WishlistProvider>
          </UserAuthProvider>
        </AdminAuthProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}

// Bundle of KV-backed data providers (storefront config / policies /
// hero slides / products). All four read from the same `/api/*`
// endpoints and depend on the auth providers above, so grouping them
// matches their lifecycle.
function DataProviders({ children }: { children: ReactNode }) {
  return (
    <StorefrontConfigProvider>
      <PoliciesProvider>
        <HeroSlidesProvider>
          <ProductProvider>{children}</ProductProvider>
        </HeroSlidesProvider>
      </PoliciesProvider>
    </StorefrontConfigProvider>
  );
}

// PWA manifest shortcuts point at `/?open=cart` (see
// `public/manifest.webmanifest`) so launching the installed app's
// "Cart" shortcut deep-links into the cart drawer — the cart is a
// drawer rather than a route, so we can't just point the shortcut at
// `/cart`. Lives inside <CartProvider /> below; reads the query
// param on mount and triggers `openCart()` once. The query param is
// scrubbed from the URL afterwards so re-mounts (e.g. soft
// navigation back to "/") don't re-open the drawer.
function PwaShortcutBridge() {
  const { openCart } = useCart();
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("open") !== "cart") return;
    openCart();
    params.delete("open");
    const next = params.toString();
    const url =
      window.location.pathname +
      (next ? `?${next}` : "") +
      window.location.hash;
    try {
      window.history.replaceState(null, "", url);
    } catch {
      /* history API unavailable — leave the URL as-is */
    }
  }, [openCart]);
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

// Storefront command palette (Cmd+K / Ctrl+K / `/`). Gated to
// storefront routes because the provider is now only mounted there
// (see `ConditionalStorefrontProviders` above) — rendering the
// component on admin would throw inside `useCommandPalette()`.
function ConditionalCommandPalette() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  if (pathname.startsWith("/admin")) return null;
  return (
    <Suspense fallback={null}>
      <CommandPalette />
    </Suspense>
  );
}

// Storefront compare drawer. Gated for the same reason as
// `ConditionalCommandPalette` — the underlying CompareProvider is no
// longer mounted on `/admin`, so the drawer can only safely render
// on storefront routes.
function ConditionalCompareDrawer() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  if (pathname.startsWith("/admin")) return null;
  return <CompareDrawer />;
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
  // Lazily instantiate the QueryClient inside the component so React
  // gives us a stable instance per mount without the SSR-unsafe
  // top-level `new QueryClient()` pattern. The 60s `staleTime` keeps
  // the gallery grid from refetching every time the modal closes /
  // the user navigates back, while still letting visibility / online
  // listeners in the providers below pull fresh data when warranted.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <RootErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GlobalAuthProviders>
          <DataProviders>
            <CartProvider>
              <ConditionalStorefrontProviders>
                <SmoothScrollProvider>
                  <a
                    href="#main-content"
                    className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-foreground focus:text-background focus:rounded-sm focus:text-sm focus:font-medium"
                  >
                    Skip to content
                  </a>
                  <BootMountMark />
                  <HeartbeatBridge />
                  <ReferralCaptureBridge />
                  <PwaShortcutBridge />
                  <GoogleAuthHashBridge />
                  <ConditionalAmbientChrome />
                  <ConditionalAnnouncementBar />
                  <PageTransitions>
                    <Outlet />
                  </PageTransitions>
                  <RouteWipeOverlay />
                  <ConditionalSiteFooter />
                  <Suspense fallback={null}>
                    <ConditionalOrderConfirmation />
                    <ChatWidget />
                    <NewUserModal />
                    <PwaPrompts />
                  </Suspense>
                  <ConditionalCommandPalette />
                  <ConditionalVisitorDelight />
                  <ConditionalKeyboardShortcuts />
                  <ConditionalCompareDrawer />
                  <Toaster richColors position="top-right" />
                </SmoothScrollProvider>
              </ConditionalStorefrontProviders>
            </CartProvider>
          </DataProviders>
        </GlobalAuthProviders>
      </QueryClientProvider>
    </RootErrorBoundary>
  );
}
