import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import {
  ShoppingCart,
  Menu,
  X,
  UserCircle,
  Image as ImageIcon,
  Info,
  Star,
  MessageSquare,
  Package,
  Heart,
  MapPin,
  ChevronRight,
  ChevronDown,
  Truck,
  GitCompare,
} from "lucide-react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { animate } from "animejs";
import gsap from "gsap";
import { useCart, type CompletedOrder } from "@/contexts/CartContext";
import { useUserAuth } from "@/contexts/UserAuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { useCompare } from "@/contexts/CompareContext";
import { useFlyToCart } from "@/contexts/FlyToCartContext";
import MiniCartHover from "@/components/MiniCartHover";
import ThemeLocaleToggle from "@/components/ThemeLocaleToggle";
import GoogleNavSignIn from "@/components/GoogleNavSignIn";
import ProfileEditor from "@/components/account/ProfileEditor";
import OrderTracker from "@/components/account/OrderTracker";
import WishlistSection from "@/components/account/WishlistSection";
import AddressBook from "@/components/account/AddressBook";

type AccountDropdown = "profile" | "tracker" | "wishlist" | "addresses";

const ORDER_STATUS_LABEL: Record<CompletedOrder["status"], string> = {
  confirmed: "Confirmed",
  in_progress: "In progress",
  out_for_delivery: "Out for delivery",
  received: "Received",
};

const reduceMotionGlobal = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const GalleryNav = () => {
  const [scrolled, setScrolled] = useState(false);
  // Refs for the GSAP-driven scroll-condense effect. We tween the
  // inner row's vertical padding + the logo wrapper's size to a
  // slightly tighter set of values once the visitor leaves the very
  // top of the page, on top of the existing background / blur swap.
  // Refs (rather than CSS class swaps) so the morph is interpolated
  // smoothly instead of jumping in one frame.
  const navInnerRef = useRef<HTMLDivElement | null>(null);
  const navLogoRef = useRef<HTMLSpanElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [myOrdersOpen, setMyOrdersOpen] = useState(false);
  const [accountDropdowns, setAccountDropdowns] = useState<
    Record<AccountDropdown, boolean>
  >({
    profile: false,
    tracker: false,
    wishlist: false,
    addresses: false,
  });
  const toggleAccountDropdown = useCallback(
    (key: AccountDropdown) =>
      setAccountDropdowns((prev) => ({ ...prev, [key]: !prev[key] })),
    [],
  );
  const { itemCount, openCart, orders, viewOrder } = useCart();
  const { user, logout } = useUserAuth();
  const { items: wishlistItems } = useWishlist();
  const compare = useCompare();
  const flyToCart = useFlyToCart();
  const { t } = useLocale();
  // Pulse the cart badge briefly when an item lands in the cart so the
  // visitor gets a small visual confirmation in the corner of the nav.
  const [cartPulse, setCartPulse] = useState(false);
  const lastItemCountRef = useRef(itemCount);
  const cartButtonRef = useRef<HTMLButtonElement | null>(null);
  // Register the cart icon as the destination for the fly-to-cart
  // animation as soon as the nav mounts. The provider holds the ref
  // and reads `.getBoundingClientRect()` on each flight, so we don't
  // need to re-register on scroll / route changes.
  useEffect(() => {
    flyToCart.registerCartTarget(cartButtonRef);
  }, [flyToCart]);
  useEffect(() => {
    if (itemCount > lastItemCountRef.current) {
      setCartPulse(true);
      const t = setTimeout(() => setCartPulse(false), 600);
      lastItemCountRef.current = itemCount;
      // Anime.js sparkle burst orbiting the cart icon. Layered on
      // top of the existing framer-motion badge pulse so the
      // confirmation reads as "something just landed" rather than
      // just "count changed". Silent under prefers-reduced-motion.
      const button = cartButtonRef.current;
      const reduceMotion =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (button && !reduceMotion) {
        const rect = button.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const colors = [
          "rgba(253,224,71,0.95)", // yellow-300
          "rgba(251,191,36,0.95)", // amber-400
          "rgba(244,114,182,0.9)", // pink-400
          "rgba(165,243,252,0.9)", // cyan-200
        ];
        for (let i = 0; i < 6; i += 1) {
          const sparkle = document.createElement("span");
          const angle = (Math.PI * 2 * i) / 6 + (Math.random() - 0.5) * 0.4;
          const distance = 22 + Math.random() * 12;
          const size = 4 + Math.random() * 3;
          sparkle.setAttribute("aria-hidden", "true");
          sparkle.style.cssText = `position:fixed;top:${cy - size / 2}px;left:${cx - size / 2}px;width:${size}px;height:${size}px;border-radius:9999px;background:${colors[i % colors.length]};box-shadow:0 0 10px ${colors[i % colors.length]};pointer-events:none;z-index:9999;will-change:transform,opacity;`;
          document.body.appendChild(sparkle);
          animate(sparkle, {
            translateX: Math.cos(angle) * distance,
            translateY: Math.sin(angle) * distance,
            scale: [0.5, 1.1, 0.4],
            opacity: [1, 1, 0],
            duration: 620 + Math.random() * 160,
            ease: "outQuad",
            onComplete: () => {
              sparkle.remove();
            },
          });
        }
      }
      return () => clearTimeout(t);
    }
    lastItemCountRef.current = itemCount;
  }, [itemCount]);
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });
  const onIndex = pathname === "/";

  useEffect(() => {
    // Engage backdrop-blur as soon as the visitor leaves the top of
    // the page (8 px = the apple.com threshold) instead of waiting
    // for 50 px of scroll. Combined with the longer transition below,
    // the nav fades cleanly into a frosted-glass bar as the hero
    // disappears under it.
    const handleScroll = () => setScrolled(window.scrollY > 8);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Scroll-condense: tween the inner-row padding + logo tile size
  // toward a tighter set of values once `scrolled` flips true. The
  // existing background / blur class swap on the outer <nav> still
  // happens in parallel; this layer adds a physical "shrink" so the
  // bar feels like it hugged closer to the content rather than just
  // changing colour. Reduced-motion clients skip the tween and just
  // see the static values.
  useEffect(() => {
    const inner = navInnerRef.current;
    const logo = navLogoRef.current;
    if (!inner || !logo) return;
    if (reduceMotionGlobal()) {
      if (scrolled) {
        inner.style.paddingTop = "0.65rem";
        inner.style.paddingBottom = "0.65rem";
        logo.style.width = "2.25rem";
        logo.style.height = "2.25rem";
      } else {
        inner.style.paddingTop = "";
        inner.style.paddingBottom = "";
        logo.style.width = "";
        logo.style.height = "";
      }
      return;
    }
    const ctx = gsap.context(() => {
      const targetPadY = scrolled ? "0.65rem" : "1.25rem";
      const targetLogo = scrolled ? "2.25rem" : "2.75rem";
      gsap.to(inner, {
        paddingTop: targetPadY,
        paddingBottom: targetPadY,
        duration: 0.45,
        ease: "power3.out",
      });
      gsap.to(logo, {
        width: targetLogo,
        height: targetLogo,
        duration: 0.45,
        ease: "power3.out",
      });
    });
    return () => ctx.revert();
  }, [scrolled]);

  // Close drawer and reset every transient drawer dropdown on route
  // change. Components rendered inside the dropdowns can trigger
  // navigation — WishlistSection has product links and ProfileEditor
  // redirects to "/" on sign-out / Google disconnect — so without
  // resetting these, the dropdowns would stay expanded the next time
  // the visitor opened the drawer on a new page.
  useEffect(() => {
    setMenuOpen(false);
    setMyOrdersOpen(false);
    setAccountDropdowns({
      profile: false,
      tracker: false,
      wishlist: false,
      addresses: false,
    });
  }, [pathname]);

  // ESC to close while drawer is open. Body scroll is intentionally NOT
  // locked — the drawer is transparent so visitors can keep scrolling the
  // page underneath while the menu options stay visible on the right.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // Hover-to-open support. We pre-mount the drawer (see below) so opening
  // is instant on every page — no first-mount cost, no "blank" frame.
  // The drawer intentionally does NOT auto-close on mouse leave: once the
  // visitor has summoned it (hover OR click), every option (including
  // Logout) stays visible while they scroll past paintings, change focus,
  // or move the cursor away. Closing is explicit only — click the
  // hamburger again, the X button, press ESC, or navigate to a new route.
  const openMenu = useCallback(() => {
    setMenuOpen(true);
  }, []);

  const scrollTo = useCallback(
    (id: string) => {
      closeMenu();
      if (onIndex) {
        const target = document.getElementById(id);
        if (target) {
          target.scrollIntoView({ behavior: "smooth" });
        } else {
          // Target may be conditionally rendered (e.g. the hero is hidden
          // for signed-in users). Fall back to scrolling to the top so the
          // logo / home button always feels responsive.
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      } else {
        void navigate({ to: "/", hash: id });
      }
    },
    [closeMenu, onIndex, navigate],
  );

  const handleLogout = useCallback(() => {
    closeMenu();
    logout();
    void navigate({ to: "/" });
  }, [closeMenu, logout, navigate]);

  const ordersCount = orders.length;
  const wishlistCount = wishlistItems.length;

  const browseItems: {
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [{ id: "reviews", label: t("nav.reviews"), icon: Star }];

  // The full filterable gallery now lives at /collection (it was lifted
  // off the homepage so the landing experience reads like an editorial
  // site rather than a catalogue dump). Surface a dedicated drawer row
  // so customers can always reach it in one tap, regardless of the
  // page they're currently on.
  const handleCollection = useCallback(() => {
    closeMenu();
    void navigate({ to: "/collection" });
  }, [closeMenu, navigate]);

  return (
    <motion.nav
      className={`fixed top-0 left-0 right-0 z-50 transition-[background-color,backdrop-filter,border-color,box-shadow] duration-500 ease-out ${
        scrolled
          ? "bg-background/70 supports-[backdrop-filter]:bg-background/55 backdrop-blur-xl backdrop-saturate-150 border-b border-border/15 shadow-[0_1px_0_0_rgba(0,0,0,0.03)]"
          : "bg-transparent border-b border-transparent"
      }`}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <div
        ref={navInnerRef}
        className="max-w-7xl mx-auto px-4 sm:px-6 md:px-12 py-4 md:py-5 flex items-center justify-between gap-3"
      >
        {/* Logo (mark + wordmark) — always on the left */}
        <button
          onClick={() => scrollTo("hero")}
          className="flex items-center gap-2 sm:gap-3 group shrink-0"
          aria-label="Canvas Hub — home"
        >
          <span
            ref={navLogoRef}
            aria-hidden
            className="font-logo relative inline-flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 transition-opacity duration-500 group-hover:opacity-90"
          >
            <svg
              viewBox="0 0 40 40"
              className="w-9 h-9 sm:w-10 sm:h-10"
              xmlns="http://www.w3.org/2000/svg"
            >
              <text
                x="20"
                y="30"
                textAnchor="middle"
                fontFamily="'EB Garamond', Georgia, 'Playfair Display', serif"
                fontSize="34"
                fontStyle="italic"
                fontWeight={500}
                fill="currentColor"
              >
                C
              </text>
            </svg>
          </span>
        </button>

        {/* Right cluster: cart + hamburger. The hamburger opens the
            full drawer — transparent, non-modal, page underneath stays
            scrollable. The button only opens; closing is explicit via
            the drawer's X, ESC, or a route change so the menu doesn't
            flash shut after a tap on touch devices (where mouseenter +
            click would otherwise toggle it back closed). The drawer
            itself surfaces every primary destination (Gallery, Contact,
            About, Reviews, Cart) at the top, so no separate hover
            popover is needed on desktop.
            On the homepage we intentionally collapse the right cluster
            down to just the hamburger (no theme toggle, no cart icon)
            so the landing view stays minimal. Full cluster is restored
            on every other route.

            Icon chip styling: when the nav is transparent (top-of-page)
            the parent <nav> has no background of its own, so a dark
            icon over a dark hero image (homepage) silently disappears.
            We give every icon button in this cluster a frosted chip
            backdrop while `scrolled` is false so the buttons always
            read against arbitrary underlying content. Once scrolled
            the parent <nav> already provides a frosted bg, so the chip
            is dropped and the hover state takes over. */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {!onIndex && (
            <>
              <ThemeLocaleToggle />
              {compare.count > 0 && (
                <button
                  type="button"
                  onClick={() => compare.open()}
                  className={`relative p-2 inline-flex items-center justify-center rounded-md transition-colors ${
                    scrolled
                      ? "hover:bg-foreground/10"
                      : "bg-background/40 supports-[backdrop-filter]:bg-background/30 backdrop-blur-md ring-1 ring-border/30 shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:bg-background/60"
                  }`}
                  aria-label={`Open compare (${compare.count})`}
                >
                  <GitCompare className="w-5 h-5 text-foreground" />
                  <span
                    className="absolute -top-1 -right-1 w-5 h-5 bg-foreground text-background text-[10px] font-body font-semibold rounded-full flex items-center justify-center"
                    aria-live="polite"
                  >
                    {compare.count}
                  </span>
                </button>
              )}
              <MiniCartHover>
                <button
                  ref={cartButtonRef}
                  onClick={openCart}
                  className={`relative p-2 inline-flex items-center justify-center rounded-md transition-colors ${
                    scrolled
                      ? "hover:bg-foreground/10"
                      : "bg-background/40 supports-[backdrop-filter]:bg-background/30 backdrop-blur-md ring-1 ring-border/30 shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:bg-background/60"
                  }`}
                  aria-label={t("nav.cart")}
                >
                  <ShoppingCart className="w-5 h-5 text-foreground" />
                  {itemCount > 0 && (
                    <motion.span
                      key={itemCount}
                      initial={false}
                      animate={
                        cartPulse ? { scale: [1, 1.35, 1] } : { scale: 1 }
                      }
                      transition={{ duration: 0.45, ease: "easeOut" }}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-foreground text-background text-[10px] font-body font-semibold rounded-full flex items-center justify-center motion-reduce:animate-none"
                      aria-live="polite"
                    >
                      {itemCount}
                    </motion.span>
                  )}
                </button>
              </MiniCartHover>
            </>
          )}
          <button
            // The hamburger button only opens the drawer; it never
            // closes it. This avoids a touch-device bug where tapping
            // the button would fire `mouseenter` (opening the drawer)
            // and then `click` (toggling it shut again), making the
            // menu flash open and disappear. Closing is intentionally
            // explicit: the X button in the drawer header, ESC, or a
            // route change. Calling `openMenu` again while already
            // open is a no-op.
            onClick={openMenu}
            // Hover-to-open is disabled on the homepage so the drawer
            // doesn't pop open accidentally while customers are scrolling
            // the hero / collection. Other routes still get hover-open.
            onMouseEnter={onIndex ? undefined : openMenu}
            onFocus={onIndex ? undefined : openMenu}
            // Always render with explicit `text-foreground` so the icon
            // never inherits a faded colour from the parent. When the
            // nav is transparent (top of homepage), wrap it in a frosted
            // chip with a soft ring so it stays legible against the
            // hero image; once the nav itself frosts, drop the chip
            // and rely on the bumped hover background for affordance.
            className={`p-2 inline-flex items-center justify-center rounded-md text-foreground transition-colors ${
              scrolled
                ? "hover:bg-foreground/10"
                : "bg-background/40 supports-[backdrop-filter]:bg-background/30 backdrop-blur-md ring-1 ring-border/30 shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:bg-background/60"
            }`}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav-drawer"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Holographic hairline pinned to the bottom of the nav once
          the visitor scrolls past the top. Drops the existing 1px
          slate border for an animated brand-gold → teal → violet
          gradient. Pure CSS keyframes (see `.nav-holo-edge` in
          `src/styles.css`), so this layer never re-renders. */}
      {scrolled && <span aria-hidden="true" className="nav-holo-edge" />}

      {/* Drawer is always mounted so the first hamburger tap on any page
          (including the homepage with its heavy hero) shows every option
          instantly — no AnimatePresence enter cost, no blank frame.
          Open/close is a pure CSS transform toggle. The page underneath
          stays fully visible and scrollable; the drawer is non-modal. */}
      <aside
        id="mobile-nav-drawer"
        role="dialog"
        aria-modal="false"
        aria-label="Site menu"
        aria-hidden={!menuOpen}
        className={`fixed top-0 right-0 bottom-0 z-[70] w-[88%] max-w-[360px] bg-card border-l border-border/40 shadow-2xl flex flex-col transform transition-transform duration-200 ease-out ${
          menuOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
        }`}
      >
        {/* Drawer header — pt respects iPhone notch / dynamic island. */}
        <div className="flex items-center justify-end px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-4 border-b border-border/30">
          <button
            onClick={closeMenu}
            className="p-2 -mr-2 text-foreground/80 hover:text-foreground"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body — pb respects iPhone home indicator. */}
        <div className="flex-1 overflow-y-auto py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {onIndex && !user ? (
            /* Homepage, signed-out: just the Google sign-in tile. */
            <div className="px-5 pt-3 pb-4 flex flex-col gap-2">
              <div className="flex justify-center">
                <GoogleNavSignIn active={menuOpen} />
              </div>
            </div>
          ) : (
            <>
              {/* Profile card — pinned to the top of the drawer so the
                    visitor's identity is the first thing they see.
                    Signed-in users get a display-only card (tapping it
                    doesn't navigate; the My account rows below open
                    inline slide-over sheets). Signed-out non-homepage
                    visitors get the Google sign-in button instead. */}
              <div className="px-5 pt-3 pb-3 border-b border-border/30">
                {user ? (
                  <div className="flex items-center gap-3">
                    {user.picture ? (
                      <img
                        src={user.picture}
                        alt=""
                        className="w-9 h-9 rounded-full object-cover border border-border/40"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-foreground/70">
                        <UserCircle className="w-5 h-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {user.name || t("nav.account")}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {user.email}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-center">
                    <GoogleNavSignIn active={menuOpen} />
                  </div>
                )}
              </div>

              {/* Primary nav — Collection, Reviews, My orders (signed-in),
                    and Cart. Row-style (icon · label · chevron) to match
                    the Policies section below, instead of boxed tiles. */}
              <div className="border-b border-border/30">
                <button
                  onClick={handleCollection}
                  className="w-full flex items-center gap-3 px-5 py-3 text-sm text-foreground/85 hover:bg-accent/50 active:bg-accent transition-colors"
                >
                  <ImageIcon className="w-4 h-4 text-muted-foreground" />
                  <span className="flex-1 text-left">The collection</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
                {browseItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => scrollTo(item.id)}
                      className="w-full flex items-center gap-3 px-5 py-3 text-sm text-foreground/85 hover:bg-accent/50 active:bg-accent transition-colors"
                    >
                      <Icon className="w-4 h-4 text-muted-foreground" />
                      <span className="flex-1 text-left">{item.label}</span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </button>
                  );
                })}
                {user && (
                  <>
                    {/* My orders — inline dropdown inside the drawer.
                          Tapping the row toggles a compact list of recent
                          orders (ID + status + total). Tapping a row opens
                          the existing order-confirmation modal with the
                          full journey + items. The drawer closes when the
                          modal opens so the visitor can see it clearly. */}
                    <button
                      onClick={() => setMyOrdersOpen((v) => !v)}
                      aria-expanded={myOrdersOpen}
                      className="w-full flex items-center gap-3 px-5 py-3 text-sm text-foreground/85 hover:bg-accent/50 active:bg-accent transition-colors"
                    >
                      <Package className="w-4 h-4 text-muted-foreground" />
                      <span className="flex-1 text-left">My orders</span>
                      {ordersCount ? (
                        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-foreground text-background text-[10px] font-semibold">
                          {ordersCount}
                        </span>
                      ) : null}
                      <ChevronDown
                        className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
                          myOrdersOpen ? "rotate-0" : "-rotate-90"
                        }`}
                      />
                    </button>
                    {myOrdersOpen ? (
                      ordersCount === 0 ? (
                        <p className="px-5 pb-3 text-xs text-muted-foreground">
                          No orders yet.
                        </p>
                      ) : (
                        <ul className="pb-2">
                          {orders.map((o) => (
                            <li key={o.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  closeMenu();
                                  viewOrder(o.id);
                                }}
                                className="w-full flex items-center gap-3 pl-12 pr-5 py-2 text-left hover:bg-accent/40 active:bg-accent/60 transition-colors"
                                aria-label={`Open order ${o.id}`}
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-medium text-foreground truncate">
                                    {o.id}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground truncate">
                                    {ORDER_STATUS_LABEL[o.status]}
                                  </p>
                                </div>
                                <span className="text-xs font-semibold whitespace-nowrap text-foreground/90">
                                  ₱{o.total.toLocaleString()}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )
                    ) : null}
                  </>
                )}
                <button
                  onClick={() => {
                    closeMenu();
                    openCart();
                  }}
                  className="w-full flex items-center gap-3 px-5 py-3 text-sm text-foreground/85 hover:bg-accent/50 active:bg-accent transition-colors"
                >
                  <ShoppingCart className="w-4 h-4 text-muted-foreground" />
                  <span className="flex-1 text-left">{t("nav.cart")}</span>
                  {itemCount ? (
                    <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-foreground text-background text-[10px] font-semibold">
                      {itemCount}
                    </span>
                  ) : null}
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              {/* My account — Profile, Track order, Wishlist, Saved
                    addresses. Each row is now an inline dropdown that
                    expands the matching account view directly inside
                    the drawer (no slide-over, no separate page). My
                    orders sits in the primary nav above with its own
                    inline dropdown, so it isn't repeated here. */}
              {user && (
                <DrawerSection
                  label="My account"
                  storageKey="account"
                  defaultOpen={true}
                >
                  <DrawerCollapsible
                    icon={UserCircle}
                    label="Profile"
                    open={accountDropdowns.profile}
                    onToggle={() => toggleAccountDropdown("profile")}
                  >
                    <ProfileEditor />
                  </DrawerCollapsible>
                  <DrawerCollapsible
                    icon={Truck}
                    label="Track order"
                    open={accountDropdowns.tracker}
                    onToggle={() => toggleAccountDropdown("tracker")}
                  >
                    <OrderTracker />
                  </DrawerCollapsible>
                  <DrawerCollapsible
                    icon={Heart}
                    label="Wishlist"
                    badge={wishlistCount || undefined}
                    open={accountDropdowns.wishlist}
                    onToggle={() => toggleAccountDropdown("wishlist")}
                  >
                    <WishlistSection />
                  </DrawerCollapsible>
                  <DrawerCollapsible
                    icon={MapPin}
                    label="Saved addresses"
                    open={accountDropdowns.addresses}
                    onToggle={() => toggleAccountDropdown("addresses")}
                  >
                    <AddressBook />
                  </DrawerCollapsible>
                </DrawerSection>
              )}

              {/* Sign out — compact button between My account and
                    Policies so signed-in users always have an exit. */}
              {user && (
                <div className="px-5 pt-3 pb-3 border-b border-border/30">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md border border-border/60 bg-card/85 hover:bg-foreground hover:text-background transition-colors text-xs tracking-[0.25em] uppercase"
                  >
                    Sign out
                  </button>
                </div>
              )}

              {/* Policy links (Shipping / Refund / Privacy / Terms) and
                    locale/theme toggles all live in the site footer and
                    top navbar respectively, so the drawer focuses on
                    account navigation only. */}
            </>
          )}
        </div>

        {/* Footer note — brand name lives only on the homepage hero now;
              the drawer caption is kept short. */}
        <div className="px-5 py-3 border-t border-border/30 text-[10px] tracking-[0.25em] uppercase text-muted-foreground/80 text-center">
          © {new Date().getFullYear()}
        </div>
      </aside>
    </motion.nav>
  );
};

interface SectionProps {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  storageKey?: string;
}
const DrawerSection = ({
  label,
  children,
  defaultOpen = true,
  storageKey,
}: SectionProps) => {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined" || !storageKey) return defaultOpen;
    try {
      const v = window.sessionStorage.getItem(
        `canvhub_drawer_section_${storageKey}`,
      );
      if (v === "1") return true;
      if (v === "0") return false;
      return defaultOpen;
    } catch {
      return defaultOpen;
    }
  });

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (typeof window !== "undefined" && storageKey) {
        try {
          window.sessionStorage.setItem(
            `canvhub_drawer_section_${storageKey}`,
            next ? "1" : "0",
          );
        } catch {
          // ignore storage failures (Safari private mode, etc.)
        }
      }
      return next;
    });
  };

  return (
    <div className="py-1">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-5 pt-3 pb-2 text-left hover:bg-accent/30 active:bg-accent/50 transition-colors"
      >
        <span className="font-body text-[10px] tracking-[0.3em] uppercase text-muted-foreground/80">
          {label}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground/70 transition-transform duration-200 ${
            open ? "rotate-0" : "-rotate-90"
          }`}
        />
      </button>
      {open ? <div>{children}</div> : null}
    </div>
  );
};

interface CollapsibleProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}
// Drawer row that expands inline to render its account view directly
// inside the drawer (no slide-over, no separate page). The chevron
// flips down when open.
const DrawerCollapsible = ({
  icon: Icon,
  label,
  badge,
  open,
  onToggle,
  children,
}: CollapsibleProps) => (
  <>
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="w-full flex items-center gap-3 px-5 py-3 text-sm text-foreground/85 hover:bg-accent/50 active:bg-accent transition-colors text-left"
    >
      <Icon className="w-4 h-4 text-muted-foreground" />
      <span className="flex-1">{label}</span>
      {badge ? (
        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-foreground text-background text-[10px] font-semibold">
          {badge}
        </span>
      ) : null}
      <ChevronDown
        className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
          open ? "rotate-0" : "-rotate-90"
        }`}
      />
    </button>
    {open ? <div className="px-3 pb-3">{children}</div> : null}
  </>
);

export default GalleryNav;
