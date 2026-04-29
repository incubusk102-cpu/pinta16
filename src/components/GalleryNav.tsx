import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  LogOut,
  LogIn,
  ChevronRight,
  FileText,
  ShieldCheck,
  Truck,
  RotateCcw,
} from "lucide-react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useCart } from "@/contexts/CartContext";
import { useUserAuth } from "@/contexts/UserAuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { useWishlist } from "@/contexts/WishlistContext";
import {
  POLICY_SLUGS,
  type PolicySlug,
  usePolicies,
} from "@/contexts/PoliciesContext";
import ThemeLocaleToggle from "@/components/ThemeLocaleToggle";

const SLUG_ICON: Record<
  PolicySlug,
  React.ComponentType<{ className?: string }>
> = {
  terms: FileText,
  refund: RotateCcw,
  shipping: Truck,
  privacy: ShieldCheck,
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
  const { itemCount, openCart, orders } = useCart();
  const { user, logout } = useUserAuth();
  const { items: wishlistItems } = useWishlist();
  const { policies } = usePolicies();
  const { t } = useLocale();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });
  const onIndex = pathname === "/";
  const onAccount = pathname === "/account";

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close drawer on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Lock body scroll while drawer is open + ESC to close
  useEffect(() => {
    if (!menuOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const scrollTo = useCallback(
    (id: string) => {
      closeMenu();
      if (onIndex) {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
      } else {
        void navigate({ to: "/", hash: id });
      }
    },
    [closeMenu, onIndex, navigate],
  );

  const goToAccountSection = useCallback(
    (id: string) => {
      closeMenu();
      if (onAccount) {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
      } else {
        void navigate({ to: "/account", hash: id });
      }
    },
    [closeMenu, onAccount, navigate],
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
  }[] = [
    { id: "gallery", label: t("nav.gallery"), icon: ImageIcon },
    { id: "about", label: t("nav.about"), icon: Info },
    { id: "reviews", label: t("nav.reviews"), icon: Star },
    { id: "contact", label: t("nav.contact"), icon: MessageSquare },
  ];

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
            className="relative inline-flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 transition-opacity duration-500 group-hover:opacity-90"
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
                fontFamily="Georgia, 'Playfair Display', serif"
                fontSize="34"
                fontStyle="italic"
                fill="#c4a86a"
              >
                C
              </text>
            </svg>
          </span>
        </button>

        {/* Desktop quick links */}
        <div className="hidden md:flex items-center gap-10">
          {[
            { id: "gallery", label: t("nav.gallery") },
            { id: "contact", label: t("nav.contact") },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => scrollTo(item.id)}
              className="font-body text-xs tracking-[0.25em] uppercase text-muted-foreground hover:text-foreground transition-colors duration-500"
            >
              {item.label}
            </button>
          ))}
          {user && (
            <Link
              to="/account"
              className="font-body text-xs tracking-[0.25em] uppercase text-muted-foreground hover:text-foreground transition-colors duration-500 inline-flex items-center gap-2"
            >
              <UserCircle className="w-4 h-4" />
              {user.name?.split(" ")[0] || t("nav.account")}
            </Link>
          )}
          <ThemeLocaleToggle />
        </div>

        {/* Right cluster: cart + hamburger (always visible) */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
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
          <button
            onClick={() => setMenuOpen(true)}
            className="p-2 inline-flex items-center justify-center rounded-md hover:bg-foreground/5 transition-colors"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav-drawer"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <>
            {/* Backdrop */}
            <motion.button
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={closeMenu}
              aria-label="Close menu"
              className="fixed inset-0 z-[60] bg-background/70 backdrop-blur-sm"
            />

            {/* Drawer */}
            <motion.aside
              key="drawer"
              id="mobile-nav-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Site menu"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{
                type: "tween",
                duration: 0.3,
                ease: [0.4, 0, 0.2, 1],
              }}
              className="fixed top-0 right-0 bottom-0 z-[70] w-[88%] max-w-[360px] bg-card border-l border-border/40 shadow-2xl flex flex-col"
            >
              {/* Drawer header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
                <p className="font-display text-base tracking-[0.25em] uppercase text-gradient-elegant">
                  Canvas Hub
                </p>
                <button
                  onClick={closeMenu}
                  className="p-2 -mr-2 text-foreground/80 hover:text-foreground"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Account/Greeting card */}
              <div className="px-5 pt-4 pb-3 border-b border-border/30">
                {user ? (
                  <Link
                    to="/account"
                    onClick={closeMenu}
                    className="flex items-center gap-3 group"
                  >
                    {user.picture ? (
                      <img
                        src={user.picture}
                        alt=""
                        className="w-11 h-11 rounded-full object-cover border border-border/40"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center text-foreground/70">
                        <UserCircle className="w-6 h-6" />
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
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
                  </Link>
                ) : (
                  <Link
                    to="/login"
                    onClick={closeMenu}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-md bg-foreground text-background hover:bg-foreground/90 transition-colors"
                  >
                    <LogIn className="w-4 h-4" />
                    <span className="font-body text-xs tracking-[0.25em] uppercase">
                      {t("nav.login")}
                    </span>
                  </Link>
                )}
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto py-2">
                {/* Browse */}
                <DrawerSection label="Browse">
                  {browseItems.map((item) => (
                    <DrawerButton
                      key={item.id}
                      icon={item.icon}
                      label={item.label}
                      onClick={() => scrollTo(item.id)}
                    />
                  ))}
                  <DrawerLink
                    icon={ShoppingCart}
                    label={t("nav.cart")}
                    badge={itemCount || undefined}
                    onClick={() => {
                      closeMenu();
                      openCart();
                    }}
                  />
                </DrawerSection>

                {/* Account section */}
                {user && (
                  <DrawerSection label="My account">
                    <DrawerButton
                      icon={UserCircle}
                      label="Profile"
                      onClick={() => goToAccountSection("account-profile")}
                    />
                    <DrawerButton
                      icon={Package}
                      label="My orders"
                      badge={ordersCount || undefined}
                      onClick={() => goToAccountSection("account-orders")}
                    />
                    <DrawerButton
                      icon={Heart}
                      label="Wishlist"
                      badge={wishlistCount || undefined}
                      onClick={() => goToAccountSection("account-wishlist")}
                    />
                    <DrawerButton
                      icon={MapPin}
                      label="Saved addresses"
                      onClick={() => goToAccountSection("account-addresses")}
                    />
                  </DrawerSection>
                )}

                {/* Policies */}
                <DrawerSection label={t("footer.policies")}>
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

                {/* Preferences */}
                <DrawerSection label="Preferences">
                  <div className="px-5 py-3">
                    <ThemeLocaleToggle />
                  </div>
                </DrawerSection>

                {user && (
                  <div className="px-5 py-4 border-t border-border/30 mt-2">
                    <button
                      onClick={handleLogout}
                      className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-md border border-border/60 text-sm text-foreground/85 hover:bg-accent/60 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      {t("nav.signOut")}
                    </button>
                  </div>
                )}
              </div>

              {/* Footer note */}
              <div className="px-5 py-3 border-t border-border/30 text-[10px] tracking-[0.25em] uppercase text-muted-foreground/80 text-center">
                Canvas Hub · {new Date().getFullYear()}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </motion.nav>
  );
};

interface SectionProps {
  label: string;
  children: React.ReactNode;
}
const DrawerSection = ({ label, children }: SectionProps) => (
  <div className="py-2">
    <p className="px-5 pt-2 pb-1 font-body text-[10px] tracking-[0.3em] uppercase text-muted-foreground/80">
      {label}
    </p>
    <div>{children}</div>
  </div>
);

interface ItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: number;
  onClick: () => void;
}
const DrawerButton = ({ icon: Icon, label, badge, onClick }: ItemProps) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full flex items-center gap-3 px-5 py-3 text-sm text-foreground/85 hover:bg-accent/50 active:bg-accent transition-colors text-left"
  >
    <Icon className="w-4 h-4 text-muted-foreground" />
    <span className="flex-1">{label}</span>
    {badge ? (
      <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-foreground text-background text-[10px] font-semibold">
        {badge}
      </span>
    ) : null}
    <ChevronRight className="w-4 h-4 text-muted-foreground" />
  </button>
);

const DrawerLink = DrawerButton;

export default GalleryNav;
