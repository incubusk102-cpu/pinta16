import { useState, useEffect, useCallback } from "react";
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
  FileText,
  ShieldCheck,
  Truck,
  RotateCcw,
} from "lucide-react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useCart, type CompletedOrder } from "@/contexts/CartContext";
import { useUserAuth } from "@/contexts/UserAuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { useWishlist } from "@/contexts/WishlistContext";
import {
  POLICY_SLUGS,
  type PolicySlug,
  usePolicies,
} from "@/contexts/PoliciesContext";
import ThemeLocaleToggle from "@/components/ThemeLocaleToggle";
import GoogleNavSignIn from "@/components/GoogleNavSignIn";
import ProfileEditor from "@/components/account/ProfileEditor";
import OrderTracker from "@/components/account/OrderTracker";
import WishlistSection from "@/components/account/WishlistSection";
import AddressBook from "@/components/account/AddressBook";

type AccountDropdown = "profile" | "tracker" | "wishlist" | "addresses";

const SLUG_ICON: Record<
  PolicySlug,
  React.ComponentType<{ className?: string }>
> = {
  terms: FileText,
  refund: RotateCcw,
  shipping: Truck,
  privacy: ShieldCheck,
};

const ORDER_STATUS_LABEL: Record<CompletedOrder["status"], string> = {
  confirmed: "Confirmed",
  in_progress: "In progress",
  out_for_delivery: "Out for delivery",
  received: "Received",
};

const SLUG_LABEL_KEYS: Record<
  PolicySlug,
  "footer.terms" | "footer.refund" | "footer.shipping" | "footer.privacy"
> = {
  terms: "footer.terms",
  refund: "footer.refund",
  shipping: "footer.shipping",
  privacy: "footer.privacy",
};

const GalleryNav = () => {
  const [scrolled, setScrolled] = useState(false);
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
  const { policies } = usePolicies();
  const { t } = useLocale();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });
  const onIndex = pathname === "/";

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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

  return (
    <motion.nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-700 ${
        scrolled
          ? "bg-background/80 backdrop-blur-xl border-b border-border/10"
          : ""
      }`}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-12 py-4 md:py-5 flex items-center justify-between gap-3">
        {/* Logo (mark + wordmark) — always on the left */}
        <button
          onClick={() => scrollTo("hero")}
          className="flex items-center gap-2 sm:gap-3 group shrink-0"
          aria-label="Canvas Hub — home"
        >
          <span
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

        {/* Right cluster: cart + hamburger. The hamburger toggles open
            the full drawer — transparent, non-modal, page underneath
            stays scrollable. The drawer itself surfaces every primary
            destination (Gallery, Contact, About, Reviews, Cart) at the
            top, so no separate hover popover is needed on desktop.
            On the homepage we intentionally collapse the right cluster
            down to just the hamburger (no theme toggle, no cart icon)
            so the landing view stays minimal. Full cluster is restored
            on every other route. */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {!onIndex && (
            <>
              <ThemeLocaleToggle />
              <button
                onClick={openCart}
                className="relative p-2"
                aria-label={t("nav.cart")}
              >
                <ShoppingCart className="w-5 h-5 text-foreground" />
                {itemCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-foreground text-background text-[10px] font-body font-semibold rounded-full flex items-center justify-center">
                    {itemCount}
                  </span>
                )}
              </button>
            </>
          )}
          <button
            onClick={() => (menuOpen ? closeMenu() : openMenu())}
            // Hover-to-open is disabled on the homepage so the drawer
            // doesn't pop open accidentally while customers are scrolling
            // the hero / collection. Other routes still get hover-open.
            onMouseEnter={onIndex ? undefined : openMenu}
            onFocus={onIndex ? undefined : openMenu}
            className="p-2 inline-flex items-center justify-center rounded-md hover:bg-foreground/5 transition-colors"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav-drawer"
          >
            {menuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>
      </div>

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
        className={`fixed top-0 right-0 bottom-0 z-[70] w-[88%] max-w-[360px] bg-card/40 supports-[backdrop-filter]:bg-card/25 backdrop-blur-xl border-l border-border/40 shadow-2xl flex flex-col transform transition-transform duration-200 ease-out ${
          menuOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
        }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-end px-5 py-4 border-b border-border/30">
          <button
            onClick={closeMenu}
            className="p-2 -mr-2 text-foreground/80 hover:text-foreground"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto py-2">
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

              {/* Primary nav — Reviews, My orders (signed-in), and Cart.
                    Row-style (icon · label · chevron) to match the
                    Policies section below, instead of boxed tiles. */}
              <div className="border-b border-border/30">
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
                    onClick={() => {
                      closeMenu();
                      void logout();
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-md border border-border/60 bg-card/85 hover:bg-foreground hover:text-background transition-colors text-xs tracking-[0.25em] uppercase"
                  >
                    Sign out
                  </button>
                </div>
              )}

              {/* Policies — open by default so visitors see every link
                    (Shipping / Refund / Privacy / Terms) immediately on
                    the first hamburger tap, no extra click required. */}
              <DrawerSection
                label={t("footer.policies")}
                storageKey="policies"
                defaultOpen={true}
              >
                {POLICY_SLUGS.map((slug) => {
                  const Icon = SLUG_ICON[slug];
                  return (
                    <Link
                      key={slug}
                      to="/policy/$slug"
                      params={{ slug }}
                      onClick={closeMenu}
                      className="flex items-center gap-3 px-5 py-3 text-sm text-foreground/85 hover:bg-accent/50 active:bg-accent transition-colors"
                    >
                      <Icon className="w-4 h-4 text-muted-foreground" />
                      <span className="flex-1">
                        {policies[slug]?.title || t(SLUG_LABEL_KEYS[slug])}
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </Link>
                  );
                })}
              </DrawerSection>

              {/* Preferences (theme + locale) live in the top navbar now,
                    not in the drawer. The signed-in user's Sign out lives
                    above Policies (compact button) — no duplicate after
                    Privacy Policy. */}
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
