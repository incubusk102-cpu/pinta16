import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import Turnstile, { isTurnstileEnabled } from "@/components/Turnstile";
import { useStorefrontConfig } from "@/contexts/StorefrontConfigContext";
import {
  useProducts,
  getDiscountPercent,
  getProductImages,
  buildImageFields,
  PRODUCT_CATEGORIES,
  PRODUCT_MAX_IMAGES,
  type Product,
  type ProductAvailability,
  type ProductImage,
  type ProductVideo,
} from "@/contexts/ProductContext";
import {
  AVAILABILITY_LABEL,
  AVAILABILITY_OPTIONS,
  defaultArtworks,
  getAvailability,
} from "@/lib/artworks";
import { findUploadDuplicate } from "@/lib/imageHash";
import { formatSize } from "@/lib/painting-sizes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { EditProductDialog } from "@/components/admin/EditProductDialog";
import { AdminCreateOrderDialog } from "@/components/admin/AdminCreateOrderDialog";
import { D1AnalyticsPanel } from "@/components/admin/D1AnalyticsPanel";
import { TursoVectorPanel } from "@/components/admin/TursoVectorPanel";
import { ProductImageGallery } from "@/components/admin/ProductImageGallery";
import { ProductVideoUpload } from "@/components/admin/ProductVideoUpload";
import { StockListingsSection } from "@/components/admin/StockListingsSection";
import { VisitorsSection } from "@/components/admin/VisitorsSection";
import { SearchInsightsSection } from "@/components/admin/SearchInsightsSection";
import { FunnelInsightsSection } from "@/components/admin/FunnelInsightsSection";
import { NotificationLogSection } from "@/components/admin/NotificationLogSection";
import { StockEventsSection } from "@/components/admin/StockEventsSection";
import { ReviewsSection } from "@/components/admin/ReviewsSection";
import { UsersSection } from "@/components/admin/UsersSection";
import { CustomersSection } from "@/components/admin/CustomersSection";
import ReturnsSection from "@/components/admin/ReturnsSection";
import { AbandonedCartSection } from "@/components/admin/AbandonedCartSection";
import { MarketingSection } from "@/components/admin/MarketingSection";
import { MarketingTriggersSection } from "@/components/admin/MarketingTriggersSection";
import { StorefrontSection } from "@/components/admin/StorefrontSection";
import { PoliciesSection } from "@/components/admin/PoliciesSection";
import { HeroSlidesSection } from "@/components/admin/HeroSlidesSection";
import { SiteCopySection } from "@/components/admin/SiteCopySection";
import { WelcomeEmailSection } from "@/components/admin/WelcomeEmailSection";
import { OrderEmailSection } from "@/components/admin/OrderEmailSection";
import { OrderPushSection } from "@/components/admin/OrderPushSection";
import { NewUserModalSection } from "@/components/admin/NewUserModalSection";
import { AppreciationSection } from "@/components/admin/AppreciationSection";
import { SecuritySection } from "@/components/admin/SecuritySection";
import { MigrateR2Card } from "@/components/admin/MigrateR2Card";
import { MigrateVariantsCard } from "@/components/admin/MigrateVariantsCard";
import ExportPanel from "@/admin/ExportPanel";
import AdminMobileUploadFAB from "@/components/admin/AdminMobileUploadFAB";
import {
  ArrowLeft,
  Activity,
  Bell,
  Boxes,
  Brush,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  KeyRound,
  LayoutDashboard,
  Loader2,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  MessageSquarePlus,
  Package,
  PackageX,
  Palmtree,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Settings,
  Shield,
  Eye,
  EyeOff,
  Image as ImageIcon,
  ImagePlus,
  Images,
  Star,
  Trash2,
  X,
  TrendingUp,
  Truck,
  Type,
  Search,
  ShoppingCart,
  Clock,
  StickyNote,
  CheckSquare,
  Square,
  Undo2,
  Upload,
  Users,
  MapPin,
  Wallet,
  Zap,
} from "lucide-react";
import {
  ORDER_STEPS,
  PRODUCTION_STAGES,
  type CompletedOrder,
  type OrderReview,
  type OrderShipment,
  type ProductionStage,
} from "@/contexts/CartContext";
import { getAdminToken } from "@/contexts/AdminAuthContext";
import {
  COURIERS,
  buildTrackingUrl,
  LALAMOVE_PAID_TO_RIDER,
  getLalamoveRange,
  formatLalamoveRange,
} from "@/lib/shipment";
import { linkifyMessage } from "@/lib/chat-format";
import { GoldenCMark } from "@/components/GoldenCMark";
import { compressImage } from "@/lib/imageCompress";
import { uploadImageToR2 } from "@/lib/uploadImage";
type AdminSection =
  | "dashboard"
  | "products"
  | "orders"
  | "returns"
  | "messages"
  | "reviews"
  | "visitors"
  | "searchInsights"
  | "funnel"
  | "notificationLog"
  | "stockEvents"
  | "users"
  | "customers"
  | "marketing"
  | "abandonedCart"
  | "marketingTriggers"
  | "storefront"
  | "hero"
  | "siteCopy"
  | "welcomeEmail"
  | "orderEmail"
  | "orderPush"
  | "newUserModal"
  | "appreciation"
  | "policies"
  | "exports"
  | "security"
  | "settings";

const SECTION_LABELS: Record<AdminSection, string> = {
  dashboard: "Dashboard",
  products: "Products",
  orders: "Orders",
  returns: "Returns",
  messages: "Messages",
  reviews: "Reviews",
  visitors: "Visitors",
  searchInsights: "Search insights",
  funnel: "Funnel & traffic",
  notificationLog: "Notification log",
  stockEvents: "Stock events",
  users: "Users",
  customers: "Customers",
  marketing: "Marketing",
  abandonedCart: "Cart recovery",
  marketingTriggers: "Triggers",
  storefront: "Storefront",
  hero: "Hero slider",
  siteCopy: "Site copy",
  welcomeEmail: "Welcome email",
  orderEmail: "Order email",
  orderPush: "Order push",
  newUserModal: "New-user modal",
  appreciation: "Appreciation",
  policies: "Policies",
  exports: "Exports",
  security: "Security",
  settings: "Settings",
};

const ADMIN_SECTION_KEYS = Object.keys(SECTION_LABELS) as AdminSection[];
const isAdminSection = (s: string | null | undefined): s is AdminSection =>
  typeof s === "string" &&
  (ADMIN_SECTION_KEYS as readonly string[]).includes(s);

const SECTION_STORAGE_KEY = "canvhub_admin_last_section_v1";
const SIDEBAR_COLLAPSED_KEY = "canvhub_admin_sidebar_collapsed_v1";
const BADGE_REFRESH_INTERVAL_MS = 60_000;

const MIN_PASSWORD_LENGTH = 8;

function AdminPage() {
  const { token, initialized, loading } = useAdminAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!token) {
    return <AdminAuthGate initialized={initialized} />;
  }

  return <AdminDashboard />;
}

function AdminAuthGate({ initialized }: { initialized: boolean | null }) {
  const { initPassword, login, loginWith2fa, loginWithPasskey, gate } =
    useAdminAuth();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  // 2FA stage: when the password POST returns `requires2fa: true`, we
  // swap the form into a TOTP-code prompt and remember the challenge
  // token issued by the server.
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [recoveryAvailable, setRecoveryAvailable] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  const isInitMode = initialized === false;
  const isTwoFactorStage = Boolean(challengeToken);
  const passkeyOffered = Boolean(gate?.passkeyCount && !isInitMode);
  const passkeyOnly = Boolean(gate?.requirePasskey);

  const handlePasskeyLogin = useCallback(async () => {
    if (passkeyBusy) return;
    setPasskeyBusy(true);
    try {
      await loginWithPasskey();
      toast.success("Welcome back");
    } catch (error) {
      // The browser throws when the user cancels the WebAuthn prompt.
      // Skip the toast in that one case so it doesn't feel noisy.
      const msg = error instanceof Error ? error.message : "Passkey rejected";
      if (!/cancell?ed|aborted|not allowed/i.test(msg)) {
        toast.error(msg);
      }
    } finally {
      setPasskeyBusy(false);
    }
  }, [loginWithPasskey, passkeyBusy]);

  const resetToPasswordStage = useCallback(() => {
    setChallengeToken(null);
    setRecoveryAvailable(false);
    setTwoFactorCode("");
    setRecoveryMode(false);
  }, []);

  const handleToken = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);
  const handleExpire = useCallback(() => setTurnstileToken(null), []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (isTwoFactorStage) {
      const trimmed = twoFactorCode.trim();
      if (!trimmed) {
        return toast.error(
          recoveryMode ? "Enter a recovery code" : "Enter the 6-digit code",
        );
      }
      setSubmitting(true);
      try {
        await loginWith2fa(challengeToken!, trimmed);
        toast.success("Welcome back");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Authentication failed",
        );
        if (
          error instanceof Error &&
          /session expired|please log in again/i.test(error.message)
        ) {
          // Challenge token expired → bounce back to the password form.
          resetToPasswordStage();
          setPassword("");
          setTurnstileToken(null);
        }
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (isInitMode) {
      if (password.length < MIN_PASSWORD_LENGTH) {
        return toast.error(
          `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        );
      }
    }

    setSubmitting(true);
    try {
      if (isInitMode) {
        await initPassword(password, turnstileToken || undefined);
        toast.success("Admin password set");
      } else {
        const result = await login(password, turnstileToken || undefined);
        if (result.requires2fa && result.challengeToken) {
          setChallengeToken(result.challengeToken);
          setRecoveryAvailable(result.recoveryAvailable);
          setPassword("");
          setTurnstileToken(null);
        } else {
          toast.success("Welcome back");
        }
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Authentication failed",
      );
      // Reset the token after a failed attempt — Turnstile tokens are
      // single-use and the widget auto-issues a fresh one.
      setTurnstileToken(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-card/40 border border-border/60 rounded-xl p-8 space-y-6">
        <div className="space-y-3 text-center">
          <div
            className="flex items-center justify-center"
            aria-label="Canvas Hub"
          >
            <GoldenCMark size={64} />
            {/* Wordmark intentionally hidden visually — the gold C mark
                stands in for the brand on the auth screen. Keep an
                accessible label above + the hidden h1 below for SR /
                tab-title semantics. */}
            <h1 className="sr-only">Canvas Hub</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {isTwoFactorStage
              ? recoveryMode
                ? "Enter one of your recovery codes to continue."
                : "Enter the 6-digit code from your authenticator app."
              : isInitMode
                ? "First time setup — choose a password to protect this admin."
                : initialized === null
                  ? "Could not reach the auth service. Check your connection."
                  : passkeyOnly
                    ? "Sign in with your passkey to continue."
                    : passkeyOffered
                      ? "Sign in with your passkey, or use your password."
                      : "Enter the admin password to manage your collection."}
          </p>
        </div>
        {passkeyOffered && !isTwoFactorStage && (
          <div className="space-y-3">
            <Button
              type="button"
              variant="default"
              className="w-full"
              onClick={handlePasskeyLogin}
              disabled={passkeyBusy || initialized === null}
            >
              {passkeyBusy ? "Waiting for passkey…" : "Sign in with passkey"}
            </Button>
            {!passkeyOnly && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border/60" />
                <span>or use your password</span>
                <span className="h-px flex-1 bg-border/60" />
              </div>
            )}
          </div>
        )}
        <form
          onSubmit={handleSubmit}
          className={`space-y-4 ${passkeyOnly && !isTwoFactorStage ? "hidden" : ""}`}
        >
          {isTwoFactorStage ? (
            <div>
              <Label htmlFor="totp-code">
                {recoveryMode ? "Recovery code" : "Authenticator code"}
              </Label>
              <Input
                id="totp-code"
                type="text"
                inputMode={recoveryMode ? "text" : "numeric"}
                autoComplete="one-time-code"
                pattern={recoveryMode ? undefined : "[0-9]*"}
                maxLength={recoveryMode ? 16 : 6}
                value={twoFactorCode}
                onChange={(e) =>
                  setTwoFactorCode(
                    recoveryMode
                      ? e.target.value.toUpperCase().slice(0, 16)
                      : e.target.value.replace(/\D/g, "").slice(0, 6),
                  )
                }
                autoFocus
                placeholder={recoveryMode ? "XXXXX-XXXXX" : "123 456"}
              />
              {recoveryAvailable && (
                <button
                  type="button"
                  className="mt-2 text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  onClick={() => {
                    setRecoveryMode((v) => !v);
                    setTwoFactorCode("");
                  }}
                >
                  {recoveryMode
                    ? "Use authenticator app instead"
                    : "Lost your authenticator? Use a recovery code"}
                </button>
              )}
            </div>
          ) : (
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={isInitMode ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                disabled={initialized === null}
              />
            </div>
          )}
          {!isTwoFactorStage && isTurnstileEnabled() && (
            <div className="flex justify-center">
              <Turnstile
                action={isInitMode ? "admin-init" : "admin-login"}
                appearance="interaction-only"
                onToken={handleToken}
                onExpire={handleExpire}
              />
            </div>
          )}
          <Button
            type="submit"
            className="w-full"
            disabled={submitting || initialized === null}
          >
            {submitting
              ? "Working..."
              : isTwoFactorStage
                ? "Verify"
                : isInitMode
                  ? "Set password"
                  : "Sign in"}
          </Button>
          {isTwoFactorStage && (
            <button
              type="button"
              className="w-full text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                resetToPasswordStage();
                setPassword("");
              }}
            >
              ← Use a different password
            </button>
          )}
        </form>
        <div className="text-center">
          <Link
            to="/"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" /> Back to site
          </Link>
        </div>
      </div>
    </div>
  );
}

// Grouped nav structure for the sidebar
const NAV_GROUPS: {
  label: string;
  items: {
    key: AdminSection;
    icon: React.ReactNode;
    hint?: string;
  }[];
}[] = [
  {
    label: "Overview",
    items: [
      {
        key: "dashboard",
        icon: <LayoutDashboard className="w-4 h-4" />,
        hint: "Revenue & metrics",
      },
      { key: "products", icon: <Upload className="w-4 h-4" /> },
      {
        key: "stockEvents",
        icon: <Boxes className="w-4 h-4" />,
        hint: "Inventory & low-stock alerts",
      },
      {
        key: "orders",
        icon: <Package className="w-4 h-4" />,
        hint: "Track & update",
      },
      {
        key: "returns",
        icon: <PackageX className="w-4 h-4" />,
        hint: "RMA queue",
      },
    ],
  },
  {
    label: "Customers",
    items: [
      {
        key: "messages",
        icon: <MessageSquare className="w-4 h-4" />,
        hint: "Chat threads",
      },
      { key: "reviews", icon: <Star className="w-4 h-4" /> },
      {
        key: "visitors",
        icon: <Activity className="w-4 h-4" />,
        hint: "Live + 24h",
      },
      {
        key: "searchInsights",
        icon: <Search className="w-4 h-4" />,
        hint: "Top queries & zero-results",
      },
      {
        key: "funnel",
        icon: <TrendingUp className="w-4 h-4" />,
        hint: "Conversion funnel & top pages",
      },
      {
        key: "notificationLog",
        icon: <Bell className="w-4 h-4" />,
        hint: "Email & push delivery log",
      },
      { key: "users", icon: <Users className="w-4 h-4" /> },
      {
        key: "customers",
        icon: <Wallet className="w-4 h-4" />,
        hint: "LTV & segments",
      },
    ],
  },
  {
    label: "Customize",
    items: [
      { key: "marketing", icon: <TrendingUp className="w-4 h-4" /> },
      {
        key: "abandonedCart",
        icon: <ShoppingCart className="w-4 h-4" />,
        hint: "Cart recovery emails",
      },
      {
        key: "marketingTriggers",
        icon: <Zap className="w-4 h-4" />,
        hint: "Review, winback, restock, price-drop",
      },
      {
        key: "storefront",
        icon: <Activity className="w-4 h-4" />,
        hint: "Promos & shipping",
      },
      {
        key: "hero",
        icon: <Images className="w-4 h-4" />,
        hint: "Homepage slides",
      },
      { key: "siteCopy", icon: <Type className="w-4 h-4" /> },
      { key: "welcomeEmail", icon: <Mail className="w-4 h-4" /> },
      { key: "orderEmail", icon: <Package className="w-4 h-4" /> },
      {
        key: "orderPush",
        icon: <Bell className="w-4 h-4" />,
        hint: "Free Web Push for status changes",
      },
      {
        key: "newUserModal",
        icon: <Users className="w-4 h-4" />,
        hint: "First-visit popup",
      },
      {
        key: "appreciation",
        icon: <Star className="w-4 h-4" />,
        hint: "Daily piece + thank-you",
      },
      { key: "policies", icon: <FileText className="w-4 h-4" /> },
    ],
  },
  {
    label: "System",
    items: [
      { key: "exports", icon: <Download className="w-4 h-4" /> },
      {
        key: "security",
        icon: <Shield className="w-4 h-4" />,
        hint: "Audit log",
      },
      { key: "settings", icon: <Settings className="w-4 h-4" /> },
    ],
  },
];

interface SidebarBadgeCounts {
  pendingShipOut: number;
  unreadChats: number;
  reviewsWaitingReply: number;
}

const badgeForSection = (
  key: AdminSection,
  counts: SidebarBadgeCounts | null | undefined,
): number | undefined => {
  if (!counts) return undefined;
  if (key === "orders" && counts.pendingShipOut > 0)
    return counts.pendingShipOut;
  if (key === "messages" && counts.unreadChats > 0) return counts.unreadChats;
  if (key === "reviews" && counts.reviewsWaitingReply > 0)
    return counts.reviewsWaitingReply;
  return undefined;
};

function SidebarNav({
  section,
  navigate,
  collapsed,
  badgeCounts,
}: {
  section: AdminSection;
  navigate: (s: AdminSection) => void;
  collapsed?: boolean;
  badgeCounts?: SidebarBadgeCounts | null;
}) {
  return (
    <nav className="flex flex-col gap-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          {!collapsed && (
            <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              {group.label}
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <NavLink
                key={item.key}
                icon={item.icon}
                label={collapsed ? "" : SECTION_LABELS[item.key]}
                active={section === item.key}
                onClick={() => navigate(item.key)}
                hint={collapsed ? "" : item.hint}
                collapsed={collapsed}
                badge={badgeForSection(item.key, badgeCounts)}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function CommandPalette({
  open,
  onClose,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (s: AdminSection) => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const allItems: { key: AdminSection; label: string; group: string }[] =
    NAV_GROUPS.flatMap((g) =>
      g.items.map((item) => ({
        key: item.key,
        label: SECTION_LABELS[item.key],
        group: g.label,
      })),
    );

  const filtered = query.trim()
    ? allItems.filter(
        (i) =>
          i.label.toLowerCase().includes(query.toLowerCase()) ||
          i.group.toLowerCase().includes(query.toLowerCase()),
      )
    : allItems;

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      onClick={onClose}
    >
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-card border border-border/60 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sections… (Ctrl+K)"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter" && filtered.length > 0) {
                onNavigate(filtered[0].key);
                onClose();
              }
            }}
          />
          <kbd className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            ESC
          </kbd>
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">
              No results
            </p>
          )}
          {filtered.map((item) => (
            <button
              key={item.key}
              type="button"
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent/50 transition-colors text-left"
              onClick={() => {
                onNavigate(item.key);
                onClose();
              }}
            >
              <span className="flex-1">{item.label}</span>
              <span className="text-[10px] text-muted-foreground">
                {item.group}
              </span>
            </button>
          ))}
        </div>
        <div className="border-t border-border/40 px-4 py-2 flex gap-3 text-[10px] text-muted-foreground">
          <span>
            <kbd className="bg-muted px-1 rounded">G</kbd> then{" "}
            <kbd className="bg-muted px-1 rounded">D</kbd> Dashboard
          </span>
          <span>
            <kbd className="bg-muted px-1 rounded">G</kbd>{" "}
            <kbd className="bg-muted px-1 rounded">O</kbd> Orders
          </span>
          <span>
            <kbd className="bg-muted px-1 rounded">G</kbd>{" "}
            <kbd className="bg-muted px-1 rounded">P</kbd> Products
          </span>
        </div>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const { logout } = useAdminAuth();
  const { products } = useProducts();
  // Initial section is taken from `?section=` first (so refresh / shared
  // links land where the operator expects), falling back to the last
  // section saved in localStorage, then Dashboard.
  const [section, setSection] = useState<AdminSection>(() => {
    if (typeof window === "undefined") return "dashboard";
    const fromUrl = new URLSearchParams(window.location.search).get("section");
    if (isAdminSection(fromUrl)) return fromUrl;
    try {
      const fromStorage = window.localStorage.getItem(SECTION_STORAGE_KEY);
      if (isAdminSection(fromStorage)) return fromStorage;
    } catch {
      // localStorage may be disabled — fall through to default.
    }
    return "dashboard";
  });
  const [navOpen, setNavOpen] = useState(false);
  // Sidebar collapsed state is sticky: respect a saved preference if the
  // operator has manually toggled it before. Otherwise fall back to the
  // tablet heuristic (collapsed below 1024 px so the content can breathe).
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const saved = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (saved === "true") return true;
      if (saved === "false") return false;
    } catch {
      // ignore
    }
    return window.innerWidth < 1024;
  });

  const navigate = useCallback((next: AdminSection) => {
    setSection(next);
    setNavOpen(false);
  }, []);

  // Keep the URL and localStorage in sync with the active section so a
  // refresh or shared `/admin?section=orders` link returns the operator
  // to where they were.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(SECTION_STORAGE_KEY, section);
    } catch {
      // ignore
    }
    const params = new URLSearchParams(window.location.search);
    if (section === "dashboard") {
      params.delete("section");
    } else {
      params.set("section", section);
    }
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) {
      window.history.replaceState(null, "", next);
    }
  }, [section]);

  // Browser back / forward should swap sections too.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      const fromUrl = new URLSearchParams(window.location.search).get(
        "section",
      );
      setSection(isAdminSection(fromUrl) ? fromUrl : "dashboard");
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  // Persist sidebar preference.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        SIDEBAR_COLLAPSED_KEY,
        String(sidebarCollapsed),
      );
    } catch {
      // ignore
    }
  }, [sidebarCollapsed]);

  // Pending-work counts for the sidebar nav badges. Reuses the same
  // endpoints the dashboard widget already calls so there's no new
  // backend surface. Failures are silent — the badges are progressive
  // enhancement and the nav stays usable without them.
  const [badgeCounts, setBadgeCounts] = useState<{
    pendingShipOut: number;
    unreadChats: number;
    reviewsWaitingReply: number;
  } | null>(null);

  const refreshBadgeCounts = useCallback(async () => {
    const token = getAdminToken();
    if (!token) return;
    try {
      const [summaryRes, chatRes] = await Promise.all([
        fetch("/api/orders?metrics=summary", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/chat?action=list", {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null),
      ]);
      if (!summaryRes.ok) return;
      const summaryData = (await summaryRes.json()) as {
        summary?: OrdersSummary;
      };
      let unread = 0;
      if (chatRes && chatRes.ok) {
        const chatData = (await chatRes.json()) as {
          threads?: ChatThreadIndexEntry[];
        };
        const threads = Array.isArray(chatData.threads) ? chatData.threads : [];
        unread = threads.filter(isThreadUnread).length;
      }
      setBadgeCounts({
        pendingShipOut: summaryData.summary?.pendingShipOutCount ?? 0,
        unreadChats: unread,
        reviewsWaitingReply: summaryData.summary?.reviewsWaitingReplyCount ?? 0,
      });
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    void refreshBadgeCounts();
    const interval = setInterval(
      () => void refreshBadgeCounts(),
      BADGE_REFRESH_INTERVAL_MS,
    );
    return () => clearInterval(interval);
  }, [refreshBadgeCounts]);

  // Refresh once whenever the operator switches sections — covers the
  // common case of marking an order shipped then jumping somewhere
  // else: the badge updates immediately instead of waiting up to 60s.
  useEffect(() => {
    void refreshBadgeCounts();
  }, [section, refreshBadgeCounts]);

  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);

  // Keyboard shortcuts
  useEffect(() => {
    let gPressed = false;
    let gTimer: ReturnType<typeof setTimeout> | null = null;
    const NAV_KEYS: Record<string, AdminSection> = {
      d: "dashboard",
      o: "orders",
      p: "products",
      m: "messages",
      r: "reviews",
      s: "settings",
      u: "users",
    };
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (e.ctrlKey && e.key === "b") {
        e.preventDefault();
        setSidebarCollapsed((c) => !c);
        return;
      }
      if (e.ctrlKey && e.key === "k") {
        e.preventDefault();
        setCmdPaletteOpen((o) => !o);
        return;
      }
      if (isInput) return;
      if (e.key === "g" && !gPressed) {
        gPressed = true;
        gTimer = setTimeout(() => {
          gPressed = false;
        }, 500);
        return;
      }
      if (gPressed && NAV_KEYS[e.key]) {
        e.preventDefault();
        navigate(NAV_KEYS[e.key]);
        gPressed = false;
        if (gTimer) clearTimeout(gTimer);
        return;
      }
      gPressed = false;
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      if (gTimer) clearTimeout(gTimer);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Persistent sidebar from tablet up; mobile uses the drawer. */}
      <aside
        className={`hidden md:flex flex-col border-r border-border/40 bg-card/30 backdrop-blur-sm sticky top-0 h-screen transition-all duration-300 ${
          sidebarCollapsed ? "w-16" : "w-60"
        }`}
      >
        <div
          className={`flex items-center gap-2 border-b border-border/40 ${
            sidebarCollapsed ? "px-2 py-4 justify-center" : "px-4 py-4"
          }`}
        >
          <GoldenCMark size={sidebarCollapsed ? 28 : 32} />
          {!sidebarCollapsed && (
            <h1 className="font-logo text-lg flex-1 truncate">Canvas Hub</h1>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7 shrink-0"
            onClick={() => setSidebarCollapsed((c) => !c)}
            title={
              sidebarCollapsed
                ? "Expand sidebar (Ctrl+B)"
                : "Collapse sidebar (Ctrl+B)"
            }
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto py-3 px-2">
          <SidebarNav
            section={section}
            navigate={navigate}
            collapsed={sidebarCollapsed}
            badgeCounts={badgeCounts}
          />
        </div>
        <div
          className={`border-t border-border/40 p-2 ${
            sidebarCollapsed ? "flex justify-center" : ""
          }`}
        >
          {sidebarCollapsed ? (
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7"
              onClick={logout}
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <div className="flex items-center gap-2 px-2">
              <Link
                to="/"
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 flex-1"
              >
                <ArrowLeft className="w-3 h-3" /> Public site
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="text-xs h-7 px-2"
              >
                <LogOut className="w-3 h-3 mr-1" />
                Sign out
              </Button>
            </div>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="border-b border-border/50 bg-card/30 backdrop-blur-sm sticky top-0 z-10">
          <div className="px-4 sm:px-6 py-3 flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setNavOpen(true)}
              aria-label="Open menu"
              className="md:hidden"
            >
              <Menu className="w-5 h-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-lg truncate">
                {SECTION_LABELS[section]}
              </h1>
            </div>
            {section === "products" && (
              <span className="hidden sm:inline text-xs text-muted-foreground">
                {products.length} uploaded
              </span>
            )}
            <button
              type="button"
              onClick={() => setCmdPaletteOpen(true)}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground bg-muted/40 border border-border/40 rounded-md hover:bg-muted/60 transition-colors"
            >
              <Search className="w-3 h-3" />
              Search…
              <kbd className="text-[10px] bg-background/60 px-1 rounded">
                ⌘K
              </kbd>
            </button>
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="text-xs md:hidden"
            >
              <LogOut className="w-3 h-3 mr-1" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </header>

        {/* Mobile drawer nav */}
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent side="left" className="w-72">
            <SheetHeader>
              <SheetTitle className="font-logo text-xl flex items-center gap-2">
                <GoldenCMark size={32} />
                Canvas Hub
              </SheetTitle>
            </SheetHeader>
            <div className="mt-6 overflow-y-auto">
              <SidebarNav
                section={section}
                navigate={navigate}
                badgeCounts={badgeCounts}
              />
            </div>
            <div className="mt-8 pt-6 border-t border-border/60 text-xs text-muted-foreground space-y-2">
              <Link
                to="/"
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <ArrowLeft className="w-3 h-3" /> Back to public site
              </Link>
            </div>
          </SheetContent>
        </Sheet>

        {/* Main content with fade-in animation */}
        <main
          key={section}
          className="flex-1 px-4 sm:px-6 py-8 max-w-6xl w-full mx-auto animate-in fade-in duration-200"
        >
          {section === "dashboard" && (
            <DashboardSection
              onOpenOrders={() => navigate("orders")}
              onOpenStorefront={() => navigate("storefront")}
              onOpenMessages={() => navigate("messages")}
              onOpenReviews={() => navigate("reviews")}
            />
          )}
          {section === "products" && <ProductsSection />}
          {section === "orders" && <OrdersSection />}
          {section === "returns" && <ReturnsSection />}
          {section === "messages" && <MessagesSection />}
          {section === "reviews" && <ReviewsSection />}
          {section === "visitors" && <VisitorsSection />}
          {section === "searchInsights" && <SearchInsightsSection />}
          {section === "funnel" && <FunnelInsightsSection />}
          {section === "notificationLog" && <NotificationLogSection />}
          {section === "stockEvents" && <StockEventsSection />}
          {section === "users" && <UsersSection />}
          {section === "customers" && <CustomersSection />}
          {section === "marketing" && <MarketingSection />}
          {section === "abandonedCart" && <AbandonedCartSection />}
          {section === "marketingTriggers" && <MarketingTriggersSection />}
          {section === "storefront" && <StorefrontSection />}
          {section === "hero" && <HeroSlidesSection />}
          {section === "siteCopy" && <SiteCopySection />}
          {section === "welcomeEmail" && <WelcomeEmailSection />}
          {section === "orderEmail" && <OrderEmailSection />}
          {section === "orderPush" && <OrderPushSection />}
          {section === "newUserModal" && <NewUserModalSection />}
          {section === "appreciation" && <AppreciationSection />}
          {section === "policies" && <PoliciesSection />}
          {section === "exports" && <ExportsSection />}
          {section === "security" && <SecuritySection />}
          {section === "settings" && <SettingsSection />}
        </main>
      </div>

      <CommandPalette
        open={cmdPaletteOpen}
        onClose={() => setCmdPaletteOpen(false)}
        onNavigate={navigate}
      />

      {section === "products" && <AdminMobileUploadFAB />}
    </div>
  );
}

function NavLink({
  icon,
  label,
  active,
  onClick,
  hint,
  collapsed,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  hint?: string;
  collapsed?: boolean;
  badge?: number;
}) {
  const showBadge = typeof badge === "number" && badge > 0;
  const badgeLabel = showBadge && badge > 99 ? "99+" : String(badge ?? "");
  const tooltip = collapsed
    ? `${label}${hint ? ` — ${hint}` : ""}${
        showBadge ? ` (${badgeLabel} pending)` : ""
      }`
    : showBadge
      ? `${badgeLabel} pending`
      : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      className={`relative flex items-center gap-3 rounded-lg text-left transition-all duration-150 ${
        collapsed ? "px-0 py-2 justify-center" : "px-3 py-2"
      } ${
        active
          ? "bg-primary/10 text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-card/60"
      }`}
    >
      <span
        className={`relative flex-shrink-0 transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}
      >
        {icon}
        {collapsed && showBadge && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-primary-foreground font-body text-[9px] leading-none tracking-normal"
          >
            {badgeLabel}
          </span>
        )}
      </span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      {!collapsed && showBadge && (
        <span
          aria-label={`${badgeLabel} pending`}
          className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full bg-primary text-primary-foreground font-body text-[10px] leading-none tracking-normal"
        >
          {badgeLabel}
        </span>
      )}
      {!collapsed && !showBadge && hint && (
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      )}
    </button>
  );
}

function ProductsSection() {
  const {
    products,
    addProduct,
    updateProduct,
    deleteProduct,
    bulkUpdateProducts,
  } = useProducts();
  const [images, setImages] = useState<ProductImage[]>([]);
  const [title, setTitle] = useState("");
  const [medium, setMedium] = useState("Acrylic on Canvas");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [category, setCategory] = useState<string>(PRODUCT_CATEGORIES[0]);
  const [dimensions, setDimensions] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterAvailability, setFilterAvailability] = useState<string>("all");
  const [price, setPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [description, setDescription] = useState("");
  const [availability, setAvailability] =
    useState<ProductAvailability>("available");
  const [video, setVideo] = useState<ProductVideo | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<string>("");
  const [bulkValue, setBulkValue] = useState<string>("");
  const [bulkApplying, setBulkApplying] = useState(false);

  const reset = () => {
    setImages([]);
    setTitle("");
    setMedium("Acrylic on Canvas");
    setYear(String(new Date().getFullYear()));
    setCategory(PRODUCT_CATEGORIES[0]);
    setDimensions("");
    setPrice("");
    setSalePrice("");
    setDiscountPercent("");
    setDescription("");
    setAvailability("available");
    setVideo(undefined);
  };

  const handlePriceChange = (value: string) => {
    setPrice(value);
    const p = Number(value);
    const d = Number(discountPercent);
    if (p > 0 && d > 0 && d < 100) {
      setSalePrice(String(Math.round(p * (1 - d / 100))));
    }
  };

  const handleSalePriceChange = (value: string) => {
    setSalePrice(value);
    const p = Number(price);
    const s = Number(value);
    if (p > 0 && s > 0 && s < p) {
      setDiscountPercent(String(Math.round(((p - s) / p) * 100)));
    } else {
      setDiscountPercent("");
    }
  };

  const handleDiscountPercentChange = (value: string) => {
    setDiscountPercent(value);
    const p = Number(price);
    const d = Number(value);
    if (p > 0 && d > 0 && d < 100) {
      setSalePrice(String(Math.round(p * (1 - d / 100))));
    } else {
      setSalePrice("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (images.length === 0)
      return toast.error("Please upload at least one painting image");
    if (!title.trim()) return toast.error("Title is required");
    const priceNum = Number(price);
    if (!priceNum || priceNum <= 0) return toast.error("Enter a valid price");

    // Block uploads that would duplicate something already in the
    // gallery (custom uploads or stock catalog) — by exact image hash
    // or by case-insensitive title. Stock defaults don't have hashes,
    // so they only contribute to the title check.
    const trimmedTitle = title.trim();
    const candidateHash = images[0]?.hash;
    const duplicate = findUploadDuplicate(
      { title: trimmedTitle, imageHash: candidateHash },
      [
        ...products.map((p) => ({
          id: p.id,
          title: p.title,
          imageHash: p.imageHash,
        })),
        ...defaultArtworks.map((a) => ({ id: a.id, title: a.title })),
      ],
    );
    if (duplicate) {
      return toast.error(
        duplicate.kind === "title"
          ? `"${duplicate.matchedTitle}" is already in the gallery — pick a different title.`
          : `That image is already in the gallery as "${duplicate.matchedTitle}".`,
      );
    }

    setSubmitting(true);

    const salePriceNum = Number(salePrice);
    const effectiveSalePrice =
      salePriceNum > 0 && salePriceNum < priceNum ? salePriceNum : undefined;

    try {
      await addProduct({
        ...buildImageFields(images),
        title: trimmedTitle,
        medium: medium.trim() || "Mixed Media",
        year: year.trim() || String(new Date().getFullYear()),
        price: priceNum,
        salePrice: effectiveSalePrice,
        description: description.trim(),
        category: category.trim() || undefined,
        dimensions: dimensions.trim() || undefined,
        availability,
        video: video?.url ? video : undefined,
      });
      toast.success(`"${trimmedTitle}" added to the collection`);
      reset();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save product",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // "Your uploads" only shows products that are brand-new additions, not
  // customizations of stock artworks (those are managed in the Stock catalog
  // panel below to avoid a confusing duplicate listing).
  const pureCustomProducts = products.filter((p) => !p.replacesDefaultId);

  const filteredProducts = pureCustomProducts.filter((p) => {
    if (filterCategory === "__uncategorized__") {
      if (p.category && p.category.trim()) return false;
    } else if (filterCategory !== "all") {
      if ((p.category || "") !== filterCategory) return false;
    }
    if (filterAvailability !== "all") {
      if (getAvailability(p) !== filterAvailability) return false;
    }
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const haystack = [
      p.title,
      p.medium,
      p.year,
      p.category,
      p.dimensions,
      p.description,
      p.imageFileName,
      p.mockupFileName,
      p.id,
      AVAILABILITY_LABEL[getAvailability(p)],
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });

  const handleDelete = async (productId: string, productTitle: string) => {
    setDeletingId(productId);

    try {
      await deleteProduct(productId);
      toast.success(`Removed "${productTitle}"`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not remove product",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === filteredProducts.length
        ? new Set()
        : new Set(filteredProducts.map((p) => p.id)),
    );
  }, [filteredProducts]);

  const handleBulkApply = async () => {
    if (!bulkAction || !selectedIds.size) return;
    setBulkApplying(true);
    try {
      const ids = [...selectedIds];
      if (bulkAction === "availability") {
        const val = bulkValue as ProductAvailability;
        if (!["available", "reserved", "sold", "draft"].includes(val)) {
          toast.error("Pick a valid availability");
          return;
        }
        await bulkUpdateProducts(ids, { availability: val });
        toast.success(
          `${ids.length} product(s) set to ${AVAILABILITY_LABEL[val]}`,
        );
      } else if (bulkAction === "price") {
        const p = Number(bulkValue);
        if (!p || p <= 0) {
          toast.error("Enter a valid price");
          return;
        }
        await bulkUpdateProducts(ids, { price: p });
        toast.success(
          `Price set to ₱${p.toLocaleString()} for ${ids.length} product(s)`,
        );
      } else if (bulkAction === "salePrice") {
        const s = Number(bulkValue);
        if (bulkValue.trim() === "" || bulkValue.trim() === "0") {
          await bulkUpdateProducts(ids, { salePrice: undefined });
          toast.success(`Sale price cleared for ${ids.length} product(s)`);
        } else if (s > 0) {
          await bulkUpdateProducts(ids, { salePrice: s });
          toast.success(
            `Sale price set to ₱${s.toLocaleString()} for ${ids.length} product(s)`,
          );
        } else {
          toast.error("Enter a valid sale price (or 0 to clear)");
          return;
        }
      } else if (bulkAction === "category") {
        await bulkUpdateProducts(ids, { category: bulkValue });
        toast.success(
          `Category set to "${bulkValue}" for ${ids.length} product(s)`,
        );
      }
      setSelectedIds(new Set());
      setBulkAction("");
      setBulkValue("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk update failed");
    } finally {
      setBulkApplying(false);
    }
  };

  return (
    <>
      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-8">
        <section
          id="upload-product-form"
          className="bg-card/40 border border-border/60 rounded-xl p-6 h-fit lg:sticky lg:top-24 scroll-mt-24"
        >
          <div className="flex items-center gap-2 mb-6">
            <Plus className="w-5 h-5 text-primary" />
            <h2 className="font-display text-lg">Upload product</h2>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="mb-2 block">
                Photos{" "}
                <span className="text-muted-foreground font-normal">
                  (up to {PRODUCT_MAX_IMAGES})
                </span>
              </Label>
              <ProductImageGallery images={images} onChange={setImages} />
            </div>

            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                placeholder="e.g. Mayon at Sunrise"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="medium">Medium</Label>
                <Input
                  id="medium"
                  value={medium}
                  onChange={(e) => setMedium(e.target.value)}
                  maxLength={60}
                />
              </div>
              <div>
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  maxLength={10}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="category">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="dimensions">
                  Dimensions{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </Label>
                <Input
                  id="dimensions"
                  value={dimensions}
                  onChange={(e) => setDimensions(e.target.value)}
                  maxLength={60}
                  placeholder="24 × 30 in"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="price">Price (₱)</Label>
              <Input
                id="price"
                type="number"
                min="0"
                step="1"
                value={price}
                onChange={(e) => handlePriceChange(e.target.value)}
                placeholder="3499"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="salePrice">
                  Sale price (₱){" "}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </Label>
                <Input
                  id="salePrice"
                  type="number"
                  min="0"
                  step="1"
                  value={salePrice}
                  onChange={(e) => handleSalePriceChange(e.target.value)}
                  placeholder="2799"
                />
              </div>
              <div>
                <Label htmlFor="discountPercent">
                  Discount %{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </Label>
                <Input
                  id="discountPercent"
                  type="number"
                  min="0"
                  max="99"
                  step="1"
                  value={discountPercent}
                  onChange={(e) => handleDiscountPercentChange(e.target.value)}
                  placeholder="20"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="availability">Availability</Label>
              <Select
                value={availability}
                onValueChange={(value) =>
                  setAvailability(value as ProductAvailability)
                }
              >
                <SelectTrigger id="availability">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABILITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Draft hides the painting from the public storefront.
              </p>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={4}
                placeholder="A short story about the piece..."
              />
            </div>

            <div>
              <Label className="mb-2 block">
                Studio video{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <ProductVideoUpload value={video} onChange={setVideo} />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Adds a "play" tile to the photo gallery on this product&rsquo;s
                page. Visitors click it to watch the video inline.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={submitting} className="flex-1">
                {submitting ? "Adding..." : "Add to gallery"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={reset}
                disabled={submitting}
              >
                Reset
              </Button>
            </div>
          </form>
        </section>

        <section>
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              {filteredProducts.length > 0 && (
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={
                    selectedIds.size === filteredProducts.length
                      ? "Deselect all"
                      : "Select all"
                  }
                >
                  {selectedIds.size === filteredProducts.length &&
                  filteredProducts.length > 0 ? (
                    <CheckSquare className="w-4 h-4" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>
              )}
              <h2 className="font-display text-lg">
                Your uploads ({filteredProducts.length})
              </h2>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search title, category, dimensions…"
                className="h-9 w-56"
              />
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="h-9 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  <SelectItem value="__uncategorized__">
                    Uncategorized
                  </SelectItem>
                  {PRODUCT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filterAvailability}
                onValueChange={setFilterAvailability}
              >
                <SelectTrigger className="h-9 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any availability</SelectItem>
                  {AVAILABILITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {selectedIds.size > 0 && (
            <div className="mb-4 flex items-center gap-2 flex-wrap bg-primary/5 border border-primary/20 rounded-lg p-3">
              <span className="text-sm font-medium">
                {selectedIds.size} selected
              </span>
              <Select
                value={bulkAction}
                onValueChange={(v) => {
                  setBulkAction(v);
                  setBulkValue("");
                }}
              >
                <SelectTrigger className="h-8 w-40">
                  <SelectValue placeholder="Bulk action…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="availability">Set availability</SelectItem>
                  <SelectItem value="price">Set price</SelectItem>
                  <SelectItem value="salePrice">Set sale price</SelectItem>
                  <SelectItem value="category">Set category</SelectItem>
                </SelectContent>
              </Select>
              {bulkAction === "availability" && (
                <Select value={bulkValue} onValueChange={setBulkValue}>
                  <SelectTrigger className="h-8 w-36">
                    <SelectValue placeholder="Pick…" />
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABILITY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {bulkAction === "price" && (
                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="₱ new price"
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                  className="h-8 w-32"
                />
              )}
              {bulkAction === "salePrice" && (
                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="₱ sale price (0 = clear)"
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                  className="h-8 w-44"
                />
              )}
              {bulkAction === "category" && (
                <Select value={bulkValue} onValueChange={setBulkValue}>
                  <SelectTrigger className="h-8 w-36">
                    <SelectValue placeholder="Pick…" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                size="sm"
                disabled={!bulkAction || !bulkValue || bulkApplying}
                onClick={() => void handleBulkApply()}
              >
                {bulkApplying ? "Applying…" : "Apply"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelectedIds(new Set());
                  setBulkAction("");
                  setBulkValue("");
                }}
              >
                Clear
              </Button>
            </div>
          )}
          {pureCustomProducts.length === 0 ? (
            <div className="border border-dashed border-border rounded-xl p-10 text-center text-muted-foreground">
              No uploaded products yet. Add your first painting on the left, or
              customize a stock listing below.
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="border border-dashed border-border rounded-xl p-10 text-center text-muted-foreground">
              No products match your search.
            </div>
          ) : (
            <ul className="space-y-3">
              {filteredProducts.map((product) => {
                const isDeleting = deletingId === product.id;
                const photos = getProductImages(product);
                const main = photos[0];
                const extras = photos.slice(1);
                const isSelected = selectedIds.has(product.id);

                return (
                  <li
                    key={product.id}
                    className={`flex gap-4 bg-card/40 border rounded-lg p-3 ${isSelected ? "border-primary/60 bg-primary/5" : "border-border/50"}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSelected(product.id)}
                      className="flex-shrink-0 self-center p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={
                        isSelected
                          ? `Deselect ${product.title}`
                          : `Select ${product.title}`
                      }
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-primary" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                    <div className="flex-shrink-0 space-y-1.5">
                      {main && (
                        <div className="relative">
                          <img
                            src={main.url}
                            alt={product.title}
                            className="w-24 h-24 object-cover rounded-md"
                            loading="lazy"
                            decoding="async"
                          />
                          {photos.length > 1 && (
                            <span className="absolute bottom-1 right-1 px-1.5 py-0.5 text-[10px] font-medium bg-background/90 backdrop-blur rounded">
                              {photos.length} photos
                            </span>
                          )}
                          {product.category && (
                            <span className="absolute top-1 left-1 px-1.5 py-0.5 text-[10px] font-medium bg-primary/90 text-primary-foreground rounded">
                              {product.category}
                            </span>
                          )}
                        </div>
                      )}
                      {extras.length > 0 && (
                        <div className="flex gap-1">
                          {extras.slice(0, 4).map((img, i) => (
                            <img
                              key={i}
                              src={img.url}
                              alt={`${product.title} photo ${i + 2}`}
                              className="w-[22px] h-[22px] object-cover rounded-sm border border-border/40"
                              loading="lazy"
                              decoding="async"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium truncate">
                          {product.title}
                        </h3>
                        <span
                          className={`px-1.5 py-0.5 text-[10px] uppercase tracking-wider rounded ${
                            getAvailability(product) === "available"
                              ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                              : getAvailability(product) === "reserved"
                                ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                                : getAvailability(product) === "sold"
                                  ? "bg-slate-700 text-white"
                                  : "bg-muted text-foreground"
                          }`}
                        >
                          {AVAILABILITY_LABEL[getAvailability(product)]}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {product.medium} · {product.year}
                        {product.dimensions ? ` · ${product.dimensions}` : ""}
                      </p>
                      <p className="text-sm font-semibold mt-1">
                        {getDiscountPercent(product) > 0 ? (
                          <>
                            <span className="line-through text-muted-foreground font-normal mr-1">
                              ₱{product.price.toLocaleString()}
                            </span>
                            <span>₱{product.salePrice!.toLocaleString()}</span>
                            <span className="ml-1 text-xs text-red-500 font-semibold">
                              {getDiscountPercent(product)}% OFF
                            </span>
                          </>
                        ) : (
                          <>₱{product.price.toLocaleString()}</>
                        )}
                      </p>
                      {product.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          {product.description}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditTarget(product)}
                        aria-label={`Edit ${product.title}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={isDeleting}
                        onClick={() =>
                          void handleDelete(product.id, product.title)
                        }
                        aria-label={`Delete ${product.title}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-10 pt-8 border-t border-border/50">
        <StockListingsSection />
      </div>

      <EditProductDialog
        product={editTarget}
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        onSave={updateProduct}
      />
    </>
  );
}

interface OrdersSummary {
  totalOrders: number;
  grossRevenue: number;
  refundedAmount: number;
  netRevenue: number;
  confirmedCount: number;
  inProgressCount: number;
  outForDeliveryCount: number;
  completedCount: number;
  pendingShipOutCount: number;
  refundPendingCount: number;
  refundSucceededCount: number;
  refundFailedCount: number;
  reviewsWaitingReplyCount: number;
}

const formatPHP = (n: number) =>
  `₱${n.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;

interface AnalyticsPoint {
  date: string;
  orders: number;
  revenue: number;
  refunded: number;
}

interface AnalyticsData {
  days: number;
  series: AnalyticsPoint[];
  topProducts: {
    id: string;
    title: string;
    image: string;
    units: number;
    revenue: number;
  }[];
  statusCounts: Record<string, number>;
}

const ANALYTICS_RANGES: { days: number; label: string }[] = [
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
];

function getTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
  });
}

interface ActivityEntry {
  orderId: string;
  customerName: string;
  at: string;
  type: string;
  actor?: string;
}

function DashboardSection({
  onOpenOrders,
  onOpenStorefront,
  onOpenMessages,
  onOpenReviews,
}: {
  onOpenOrders: () => void;
  onOpenStorefront: () => void;
  onOpenMessages: () => void;
  onOpenReviews: () => void;
}) {
  const {
    config: { vacationMode },
  } = useStorefrontConfig();
  const [summary, setSummary] = useState<OrdersSummary | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsDays, setAnalyticsDays] = useState<number>(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityEntry[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  const refresh = async (days: number = analyticsDays) => {
    setLoading(true);
    setError(null);
    try {
      const token = getAdminToken();
      const [summaryRes, analyticsRes, chatRes] = await Promise.all([
        fetch("/api/orders?metrics=summary", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/orders?metrics=analytics&days=${days}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        // Threads list is small (last 100 entries) and the dashboard's
        // "Today's tasks" widget needs an unread-chats count. Failing
        // softly: if chat is down, dashboard still renders without that
        // count.
        fetch("/api/chat?action=list", {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null),
      ]);
      if (!summaryRes.ok) throw new Error(`HTTP ${summaryRes.status}`);
      const summaryData = await summaryRes.json();
      setSummary(summaryData.summary as OrdersSummary);
      setRecentActivity((summaryData.recentActivity as ActivityEntry[]) || []);
      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json();
        setAnalytics(analyticsData.analytics as AnalyticsData);
      }
      if (chatRes && chatRes.ok) {
        const chatData = await chatRes.json();
        const threads = Array.isArray(chatData.threads) ? chatData.threads : [];
        const unread = threads.filter((t: ChatThreadIndexEntry) =>
          isThreadUnread(t),
        ).length;
        setUnreadChatCount(unread);
      } else {
        setUnreadChatCount(0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load metrics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh(analyticsDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyticsDays]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-xl">Dashboard</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <RefreshCw
            className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {vacationMode.enabled && (
        <button
          type="button"
          onClick={onOpenStorefront}
          className="w-full flex items-start gap-3 text-left p-4 bg-amber-500/10 border border-amber-500/40 rounded-lg hover:bg-amber-500/15 transition-colors"
        >
          <Palmtree className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-display text-sm text-foreground">
              Vacation mode is on — checkout is paused
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {vacationMode.returnDate
                ? `Return date: ${new Date(
                    `${vacationMode.returnDate}T00:00:00`,
                  ).toLocaleDateString(undefined, {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}.`
                : "No return date set."}{" "}
              Click to open Storefront → Vacation panel and turn it off.
            </p>
          </div>
        </button>
      )}

      {summary && (
        <TodayTasksWidget
          pendingShipOut={summary.pendingShipOutCount}
          refundsPending={summary.refundPendingCount}
          unreadChats={unreadChatCount}
          reviewsWaitingReply={summary.reviewsWaitingReplyCount}
          onOpenOrders={onOpenOrders}
          onOpenMessages={onOpenMessages}
          onOpenReviews={onOpenReviews}
        />
      )}

      {error && (
        <div className="text-sm text-destructive border border-destructive/30 bg-destructive/10 rounded-md p-3">
          {error}
        </div>
      )}

      {loading && !summary && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {summary && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <DashCard
              icon={<TrendingUp className="w-4 h-4" />}
              label="Order purchase total"
              value={formatPHP(summary.grossRevenue)}
              hint={`${summary.totalOrders} order${summary.totalOrders === 1 ? "" : "s"} · net ${formatPHP(summary.netRevenue)} after refunds`}
            />
            <DashCard
              icon={<Truck className="w-4 h-4" />}
              label="Pending ship-out"
              value={String(summary.pendingShipOutCount)}
              hint={`${summary.confirmedCount} confirmed · ${summary.inProgressCount} in progress · ${summary.outForDeliveryCount} out for delivery`}
              onClick={onOpenOrders}
            />
            <DashCard
              icon={<CheckCircle2 className="w-4 h-4" />}
              label="Order complete"
              value={String(summary.completedCount)}
              hint="Marked received by admin"
              onClick={onOpenOrders}
            />
            <DashCard
              icon={<Wallet className="w-4 h-4" />}
              label="Refunds in progress"
              value={String(summary.refundPendingCount)}
              hint={`${summary.refundSucceededCount} completed · ${summary.refundFailedCount} failed`}
              onClick={onOpenOrders}
            />
            <DashCard
              icon={<Undo2 className="w-4 h-4" />}
              label="Total refunded"
              value={formatPHP(summary.refundedAmount)}
              hint="Successfully credited back to customers"
            />
            <DashCard
              icon={<Activity className="w-4 h-4" />}
              label="Avg order value"
              value={formatPHP(
                summary.totalOrders > 0
                  ? summary.grossRevenue / summary.totalOrders
                  : 0,
              )}
              hint={`Across ${summary.totalOrders} order${summary.totalOrders === 1 ? "" : "s"}`}
            />
          </div>

          {/* Status breakdown bar */}
          {summary.totalOrders > 0 && (
            <div className="border border-border/40 rounded-lg p-4 bg-card/40 space-y-3">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Order status breakdown
              </div>
              <div className="flex rounded-full overflow-hidden h-3">
                {[
                  {
                    count: summary.confirmedCount,
                    color: "bg-amber-400",
                    label: "Confirmed",
                  },
                  {
                    count: summary.inProgressCount,
                    color: "bg-blue-400",
                    label: "In progress",
                  },
                  {
                    count: summary.outForDeliveryCount,
                    color: "bg-purple-400",
                    label: "Out for delivery",
                  },
                  {
                    count: summary.completedCount,
                    color: "bg-emerald-500",
                    label: "Received",
                  },
                ].map(
                  (seg) =>
                    seg.count > 0 && (
                      <div
                        key={seg.label}
                        className={`${seg.color} transition-all`}
                        style={{
                          width: `${(seg.count / summary.totalOrders) * 100}%`,
                        }}
                        title={`${seg.label}: ${seg.count}`}
                      />
                    ),
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />
                  Confirmed {summary.confirmedCount}
                </span>
                <span>
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-400 mr-1" />
                  In progress {summary.inProgressCount}
                </span>
                <span>
                  <span className="inline-block w-2 h-2 rounded-full bg-purple-400 mr-1" />
                  Shipping {summary.outForDeliveryCount}
                </span>
                <span>
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />
                  Received {summary.completedCount}
                </span>
              </div>
            </div>
          )}
        </>
      )}

      <AnalyticsPanel
        analytics={analytics}
        days={analyticsDays}
        onChangeDays={setAnalyticsDays}
        loading={loading}
      />

      <D1AnalyticsPanel />
      <TursoVectorPanel />

      {/* Recent activity feed */}
      {recentActivity.length > 0 && (
        <div className="border border-border/40 rounded-lg p-4 bg-card/40 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Bell className="w-3 h-3" />
              Recent activity
            </div>
            <button
              type="button"
              onClick={onOpenOrders}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              View all orders
            </button>
          </div>
          <div className="space-y-0">
            {recentActivity.map((entry, idx) => {
              const typeLabels: Record<string, string> = {
                placed: "Order placed",
                "status:confirmed": "Confirmed",
                "status:in_progress": "Processing",
                "status:out_for_delivery": "Shipped",
                "status:received": "Delivered",
                "shipment:cleared": "Shipment cleared",
                "email:resent": "Email resent",
                "refund:initiated": "Refund initiated",
                "refund:succeeded": "Refund completed",
              };
              const typeIcons: Record<string, string> = {
                placed: "bg-emerald-500",
                "status:confirmed": "bg-amber-400",
                "status:in_progress": "bg-blue-400",
                "status:out_for_delivery": "bg-purple-400",
                "status:received": "bg-emerald-500",
                "refund:initiated": "bg-red-400",
                "refund:succeeded": "bg-red-500",
              };
              const ago = getTimeAgo(entry.at);
              return (
                <div
                  key={`${entry.orderId}-${idx}`}
                  className="flex items-start gap-3 py-2 border-b border-border/20 last:border-0"
                >
                  <div
                    className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                      typeIcons[entry.type] || "bg-muted-foreground"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs">
                      <span className="font-medium">
                        {typeLabels[entry.type] || entry.type}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}
                        — {entry.customerName}
                      </span>
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {entry.orderId} · {ago}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TopProductThumb({ src }: { src: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div className="w-9 h-9 rounded-sm bg-muted flex items-center justify-center shrink-0">
        <ImageIcon className="w-4 h-4 text-muted-foreground" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="w-9 h-9 object-cover rounded-sm border border-border/40 shrink-0"
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
    />
  );
}

function AnalyticsPanel({
  analytics,
  days,
  onChangeDays,
  loading,
}: {
  analytics: AnalyticsData | null;
  days: number;
  onChangeDays: (d: number) => void;
  loading: boolean;
}) {
  const series = analytics?.series ?? [];
  const maxRevenue = series.reduce((m, p) => Math.max(m, p.revenue), 0);
  const maxOrders = series.reduce((m, p) => Math.max(m, p.orders), 0);
  const totalRevenue = series.reduce((s, p) => s + p.revenue, 0);
  const totalOrders = series.reduce((s, p) => s + p.orders, 0);
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  return (
    <div className="border border-border/40 rounded-lg p-4 space-y-4 bg-card/40">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Analytics
          </div>
          <p className="font-display text-lg">
            {formatPHP(totalRevenue)}{" "}
            <span className="text-sm text-muted-foreground font-body">
              · {totalOrders} order{totalOrders === 1 ? "" : "s"} · avg{" "}
              {formatPHP(avgOrderValue)}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-1 bg-muted/40 rounded-md p-0.5">
          {ANALYTICS_RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => onChangeDays(r.days)}
              className={`px-2 py-1 text-[11px] rounded ${
                days === r.days
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !analytics ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <div className="flex items-end gap-[2px] h-32">
              {series.map((p) => {
                const h = maxRevenue > 0 ? (p.revenue / maxRevenue) * 100 : 0;
                return (
                  <div
                    key={p.date}
                    className="flex-1 flex flex-col justify-end"
                    title={`${p.date}: ${formatPHP(p.revenue)} (${p.orders} orders)`}
                  >
                    <div
                      className="bg-foreground/70 hover:bg-foreground rounded-sm transition-all"
                      style={{
                        height: `${Math.max(h, p.revenue > 0 ? 2 : 0)}%`,
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{series[0]?.date ?? ""}</span>
              <span>Daily revenue · max {formatPHP(maxRevenue)}</span>
              <span>{series[series.length - 1]?.date ?? ""}</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-end gap-[2px] h-16">
              {series.map((p) => {
                const h = maxOrders > 0 ? (p.orders / maxOrders) * 100 : 0;
                return (
                  <div
                    key={`o-${p.date}`}
                    className="flex-1 flex flex-col justify-end"
                    title={`${p.date}: ${p.orders} orders`}
                  >
                    <div
                      className="bg-emerald-500/70 rounded-sm"
                      style={{
                        height: `${Math.max(h, p.orders > 0 ? 2 : 0)}%`,
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="text-[10px] text-muted-foreground">
              Daily orders · max {maxOrders}
            </div>
          </div>

          {analytics?.topProducts && analytics.topProducts.length > 0 && (
            <div className="pt-2 border-t border-border/40">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Top paintings (all-time)
              </div>
              <ul className="space-y-2">
                {analytics.topProducts.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-3 text-sm">
                    <span className="w-5 text-xs text-muted-foreground">
                      #{i + 1}
                    </span>
                    <TopProductThumb src={p.image} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-foreground">{p.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {p.units} sold · {formatPHP(p.revenue)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DashCard({
  icon,
  label,
  value,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  onClick?: () => void;
}) {
  const interactive = !!onClick;
  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={onClick}
      className={`text-left border border-border/40 rounded-lg p-4 bg-card/40 transition-colors ${
        interactive ? "hover:bg-card/70 cursor-pointer" : "cursor-default"
      }`}
    >
      <div className="flex items-center gap-2 text-muted-foreground text-[11px] uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <p className="font-display text-2xl mt-2">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </button>
  );
}

// Today's tasks — drives the "what do I need to do right now" widget at
// the top of the dashboard. Each row is one click straight to the
// matching admin section. When all four are zero we render a friendly
// "all caught up" state so the widget never disappears (admins build
// muscle memory around its position on the page).
function TodayTasksWidget({
  pendingShipOut,
  refundsPending,
  unreadChats,
  reviewsWaitingReply,
  onOpenOrders,
  onOpenMessages,
  onOpenReviews,
}: {
  pendingShipOut: number;
  refundsPending: number;
  unreadChats: number;
  reviewsWaitingReply: number;
  onOpenOrders: () => void;
  onOpenMessages: () => void;
  onOpenReviews: () => void;
}) {
  const tasks: Array<{
    icon: React.ReactNode;
    count: number;
    label: string;
    onClick: () => void;
  }> = [
    {
      icon: <Truck className="w-4 h-4" />,
      count: pendingShipOut,
      label: pendingShipOut === 1 ? "order to ship" : "orders to ship out",
      onClick: onOpenOrders,
    },
    {
      icon: <Wallet className="w-4 h-4" />,
      count: refundsPending,
      label: refundsPending === 1 ? "refund waiting" : "refunds waiting",
      onClick: onOpenOrders,
    },
    {
      icon: <MessageSquare className="w-4 h-4" />,
      count: unreadChats,
      label:
        unreadChats === 1 ? "unread buyer message" : "unread buyer messages",
      onClick: onOpenMessages,
    },
    {
      icon: <Star className="w-4 h-4" />,
      count: reviewsWaitingReply,
      label:
        reviewsWaitingReply === 1
          ? "review waiting for your reply"
          : "reviews waiting for your reply",
      onClick: onOpenReviews,
    },
  ];
  const totalTasks = tasks.reduce((sum, t) => sum + t.count, 0);

  return (
    <section className="border border-border/60 rounded-lg bg-card/40 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border/40 bg-muted/20 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CheckSquare className="w-3.5 h-3.5 text-primary" />
          <h3 className="font-display text-sm">Today's tasks</h3>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {totalTasks === 0
            ? "All caught up"
            : `${totalTasks} item${totalTasks === 1 ? "" : "s"}`}
        </span>
      </div>
      {totalTasks === 0 ? (
        <div className="p-6 text-center">
          <p className="font-display text-sm">Nothing to do right now ✨</p>
          <p className="text-xs text-muted-foreground mt-1">
            All orders are shipped, refunds are processed, messages are read,
            and reviews are answered.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border/40">
          {tasks
            .filter((t) => t.count > 0)
            .map((t, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={t.onClick}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                >
                  <span className="flex-none w-7 h-7 grid place-items-center rounded-md bg-primary/10 text-primary">
                    {t.icon}
                  </span>
                  <span className="flex-1 text-sm">
                    <strong className="font-display tabular-nums">
                      {t.count}
                    </strong>{" "}
                    {t.label}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}

type OrderSortKey = "newest" | "oldest" | "highest" | "lowest";
type OrderStatusFilter = "all" | CompletedOrder["status"] | "refunded";

function OrdersSection() {
  const [orders, setOrders] = useState<CompletedOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>("all");
  const [sortKey, setSortKey] = useState<OrderSortKey>("newest");
  const [createOpen, setCreateOpen] = useState(false);
  const [resendingKey, setResendingKey] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<{
    configured: boolean;
    provider: string | null;
    from: string | null;
    replyTo: string | null;
  } | null>(null);
  const [confirmRefundFor, setConfirmRefundFor] =
    useState<CompletedOrder | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState("");
  const [expandedTimeline, setExpandedTimeline] = useState<string | null>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => {
    if (selectedIds.size === paginatedOrders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedOrders.map((o) => o.id)));
    }
  };
  const handleBulkStatus = async (status: CompletedOrder["status"]) => {
    if (selectedIds.size === 0) return;
    setBulkUpdating(true);
    const token = getAdminToken();
    let successCount = 0;
    for (const orderId of selectedIds) {
      try {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action: "update-status", orderId, status }),
        });
        if (res.ok) {
          const data = await res.json();
          const updated = data.order as CompletedOrder | undefined;
          setOrders((prev) =>
            prev.map((o) =>
              o.id === orderId ? (updated ?? { ...o, status }) : o,
            ),
          );
          successCount++;
        }
      } catch {
        // continue with next
      }
    }
    toast.success(`Updated ${successCount} of ${selectedIds.size} orders`);
    setSelectedIds(new Set());
    setBulkUpdating(false);
  };

  const saveAdminNote = async (orderId: string, note: string) => {
    try {
      const token = getAdminToken();
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "admin-note", orderId, note }),
      });
      if (res.ok) {
        setAdminNotes((prev) => ({ ...prev, [orderId]: note }));
        toast.success("Note saved");
      } else {
        toast.error("Could not save note");
      }
    } catch {
      toast.error("Could not save note");
    }
    setEditingNoteId(null);
  };

  // Tracks the order IDs we've already shown the admin so the auto-poll
  // below can detect new orders by set-difference instead of comparing
  // full snapshots. Seeded on first load with whatever the initial fetch
  // returns so pre-existing orders don't trigger a "new!" alert.
  const seenOrderIdsRef = useRef<Set<string> | null>(null);
  // Holds the WebAudio context across re-renders so we can play a quick
  // chime on new-order arrivals without stacking up audio nodes.
  const newOrderAudioRef = useRef<AudioContext | null>(null);

  const playNewOrderChime = () => {
    if (typeof window === "undefined") return;
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctx) return;
      let ctx = newOrderAudioRef.current;
      if (!ctx || ctx.state === "closed") {
        ctx = new Ctx();
        newOrderAudioRef.current = ctx;
      }
      // Two short blips an octave apart — calm enough to not startle in
      // an open office, distinctive enough to cut through the rest of
      // the dashboard's audio noise (toasts have no sound by default).
      const now = ctx.currentTime;
      [880, 1175].forEach((freq, i) => {
        const osc = ctx!.createOscillator();
        const gain = ctx!.createGain();
        osc.frequency.value = freq;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.0001, now + i * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.18, now + i * 0.18 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.16);
        osc.connect(gain).connect(ctx!.destination);
        osc.start(now + i * 0.18);
        osc.stop(now + i * 0.18 + 0.18);
      });
    } catch {
      /* AudioContext not available / denied — silently skip */
    }
  };

  const fetchOrders = async (opts: { silent?: boolean } = {}) => {
    const { silent = false } = opts;
    try {
      const token = getAdminToken();
      const res = await fetch("/api/orders", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const incoming = (data.orders || []) as CompletedOrder[];

      // Compare against the seen-set to surface freshly placed orders.
      // We only alert *after* the initial seed so first-load doesn't
      // light up with toasts for every existing order.
      const seen = seenOrderIdsRef.current;
      if (seen && silent) {
        const fresh = incoming.filter((o) => !seen.has(o.id));
        if (fresh.length > 0) {
          fresh.slice(0, 3).forEach((o) => {
            const who = o.orderInfo?.fullName?.trim() || "guest";
            toast.success(`New order ${o.id} — ${who}`, {
              description: `\u20b1${o.total.toLocaleString()} \u00b7 ${o.items.length} item${o.items.length === 1 ? "" : "s"}`,
            });
          });
          if (fresh.length > 3) {
            toast.message(`+${fresh.length - 3} more new orders`);
          }
          playNewOrderChime();
        }
      }
      // Always refresh the seen-set with the latest snapshot.
      seenOrderIdsRef.current = new Set(incoming.map((o) => o.id));

      setOrders(incoming);
    } catch {
      // Silent polls swallow errors — the admin doesn't need a toast
      // every 30 seconds when their wifi blips. The next successful
      // poll restores the list.
      if (!silent) toast.error("Could not load orders");
    } finally {
      if (!silent) setLoadingOrders(false);
    }
  };

  useEffect(() => {
    void fetchOrders();
    void (async () => {
      try {
        const token = getAdminToken();
        const res = await fetch("/api/orders?metrics=email-status", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setEmailStatus(data.email);
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  // Auto-poll for new orders every 30s. The interval mirrors the existing
  // refund poll cadence and gives admins near-real-time awareness without
  // needing SSE / Durable Objects. Pauses while the tab is hidden so we
  // don't burn KV reads (and quota) on a backgrounded dashboard, then
  // does a catch-up fetch the moment the tab is foregrounded again.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void fetchOrders({ silent: true });
    };
    const id = window.setInterval(tick, 30_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // fetchOrders is defined in this component and has no closure deps
    // beyond the seen-set ref (which is intentionally not in the dep
    // array — we want the effect to run once on mount).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProductionStageUpdate = async (
    orderId: string,
    stage: ProductionStage | null,
  ) => {
    setUpdatingId(orderId);
    try {
      const token = getAdminToken();
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "update-production-stage",
          orderId,
          stage,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const updated = data.order as CompletedOrder | undefined;
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? (updated ?? {
                ...o,
                productionStage: stage ?? undefined,
              })
            : o,
        ),
      );
      const note = data.notification as
        | {
            push?: {
              delivered?: boolean;
              skipped?: boolean;
              reason?: string;
            };
          }
        | null
        | undefined;
      if (stage === null) {
        toast.success("Production stage cleared");
      } else if (note?.push?.delivered) {
        toast.success("Stage updated · Push sent to customer");
      } else if (note?.push?.skipped) {
        toast.message(
          `Stage updated · Push skipped: ${note.push.reason || "not configured"}`,
        );
      } else {
        toast.success("Stage updated");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update stage",
      );
    } finally {
      setUpdatingId(null);
    }
  };

  // Behind-the-scenes photo upload. The flow is two hops on purpose:
  //   1. POST the compressed bytes to /api/uploads, which writes them to
  //      R2 at a content-addressable key and returns `/api/r/<path>`.
  //   2. POST that path + stage to /api/orders `add-production-photo`,
  //      which appends it to the order's productionPhotos array, logs an
  //      activity event, and fires the push notification.
  // Doing this in one round-trip would mean reading the bytes twice on
  // the worker (once to hash for R2, once to attach to the order) and
  // would tangle the upload size budget with the order JSON budget.
  const handleUploadProductionPhoto = async (
    orderId: string,
    stage: ProductionStage,
    file: File,
  ) => {
    setUpdatingId(orderId);
    try {
      // 1.6 MB encoded budget at 1600 px long-edge. Bigger than the email
      // header banner (1.2 MB) because progress photos are the hero of
      // the customer's notification — a softer JPEG looks worse here
      // than it does in a transactional email footer.
      const compressed = await compressImage(file, {
        maxDim: 1600,
        maxBytes: 1600 * 1024,
        initialQuality: 0.85,
      });
      const upload = await uploadImageToR2(compressed.blob);
      if (upload.kind !== "uploaded") {
        const reason =
          upload.kind === "fallback"
            ? "R2 storage is not configured on this deploy."
            : upload.message;
        throw new Error(reason);
      }
      const token = getAdminToken();
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "add-production-photo",
          orderId,
          stage,
          url: upload.result.url,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const updated = data.order as CompletedOrder | undefined;
      if (updated) {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      }
      const note = data.notification as
        | {
            push?: {
              delivered?: boolean;
              skipped?: boolean;
              reason?: string;
            };
          }
        | null
        | undefined;
      if (note?.push?.delivered) {
        toast.success("Photo uploaded · Push sent to customer");
      } else if (note?.push?.skipped) {
        toast.message(
          `Photo uploaded · Push skipped: ${note.push.reason || "not configured"}`,
        );
      } else {
        toast.success("Photo uploaded");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not upload photo",
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRemoveProductionPhoto = async (
    orderId: string,
    photoId: string,
  ) => {
    // No setUpdatingId here — removal is fast (no upload) and we don't
    // want to grey out the stage selector while a delete confirmation
    // round-trips. The button itself goes through optimistic state.
    try {
      const token = getAdminToken();
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "remove-production-photo",
          orderId,
          photoId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const updated = data.order as CompletedOrder | undefined;
      if (updated) {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      }
      toast.success("Photo removed");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not remove photo",
      );
    }
  };

  const handleStatusUpdate = async (
    orderId: string,
    status: CompletedOrder["status"],
  ) => {
    setUpdatingId(orderId);
    try {
      const token = getAdminToken();
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "update-status", orderId, status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const updated = data.order as CompletedOrder | undefined;
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? (updated ?? { ...o, status }) : o)),
      );
      const note = data.notification as
        | {
            delivered?: boolean;
            skipped?: boolean;
            skipReason?: string;
            error?: string;
          }
        | null
        | undefined;
      if (note?.delivered) {
        toast.success("Status updated · Email sent to customer");
      } else if (note?.skipped) {
        toast.message(
          `Status updated · Email skipped: ${note.skipReason || "not configured"}`,
        );
      } else if (note?.error) {
        toast.error(`Status updated · Email failed: ${note.error}`);
      } else {
        toast.success("Status updated");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update status",
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSetReviewPublished = async (
    orderId: string,
    publishedToHomepage: boolean,
    productId?: string,
  ) => {
    setUpdatingId(orderId);
    try {
      const token = getAdminToken();
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "set-review-published",
          orderId,
          productId,
          publishedToHomepage,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const updated = data.order as CompletedOrder | undefined;
      setOrders((prev) =>
        prev.map((o) => {
          if (o.id !== orderId) return o;
          if (updated) return updated;
          const reviews = o.reviews
            ? o.reviews.map((r) =>
                (r.productId ?? "") === (productId ?? "")
                  ? { ...r, publishedToHomepage }
                  : r,
              )
            : o.review
              ? [{ ...o.review, publishedToHomepage }]
              : [];
          const legacy =
            o.review && (o.review.productId ?? "") === (productId ?? "")
              ? { ...o.review, publishedToHomepage }
              : o.review;
          return { ...o, reviews, review: legacy };
        }),
      );
      toast.success(
        publishedToHomepage
          ? "Review published to homepage"
          : "Review unpublished from homepage",
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update review",
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSaveShipment = async (
    orderId: string,
    shipment: {
      courier: string;
      trackingNumber: string;
      trackingUrl?: string;
      shippedAt?: string;
    },
  ) => {
    setUpdatingId(orderId);
    try {
      const token = getAdminToken();
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "update-shipment",
          orderId,
          shipment,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const updated = data.order as CompletedOrder;
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      toast.success("Tracking saved");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save tracking",
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const handleClearShipment = async (orderId: string) => {
    setUpdatingId(orderId);
    try {
      const token = getAdminToken();
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "update-shipment",
          orderId,
          shipment: null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const updated = data.order as CompletedOrder;
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      toast.success("Tracking cleared");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not clear tracking",
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const handleResendEmail = async (
    orderId: string,
    notificationIndex: number,
  ) => {
    const key = `${orderId}:${notificationIndex}`;
    setResendingKey(key);
    try {
      const token = getAdminToken();
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "resend-email",
          orderId,
          notificationIndex,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const updated = data.order as CompletedOrder;
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      const note = data.notification;
      if (note?.delivered) {
        toast.success("Email resent");
      } else if (note?.skipped) {
        toast.message(`Email skipped: ${note.skipReason || "not configured"}`);
      } else if (note?.error) {
        toast.error(`Email failed: ${note.error}`);
      } else {
        toast.success("Notification updated");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resend");
    } finally {
      setResendingKey(null);
    }
  };

  const handleRefund = async (order: CompletedOrder) => {
    setRefundingId(order.id);
    try {
      const token = getAdminToken();
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "request-refund",
          orderId: order.id,
          reason: "requested_by_customer",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        detail?: string;
        order?: CompletedOrder;
      };
      if (!res.ok) {
        // The backend returns `{error, detail}` for PayMongo failures
        // (502s) and `{error}` for everything else. Folding `detail`
        // into the toast surfaces the actual PayMongo reason (e.g.
        // "Insufficient balance") instead of the useless "HTTP 502"
        // fallback.
        const message = data.detail
          ? `${data.error || "Refund failed"}: ${data.detail}`
          : data.error || `HTTP ${res.status}`;
        throw new Error(message);
      }
      const updated = data.order as CompletedOrder;
      setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
      toast.success(
        `Refund initiated. Status: ${updated.refund?.status ?? "pending"}`,
      );
      setConfirmRefundFor(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not initiate refund",
      );
    } finally {
      setRefundingId(null);
    }
  };

  const handleCheckRefund = async (orderId: string) => {
    setRefundingId(orderId);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check-refund", orderId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        detail?: string;
        order?: CompletedOrder;
      };
      if (!res.ok) {
        const message = data.detail
          ? `${data.error || "Check refund failed"}: ${data.detail}`
          : data.error || `HTTP ${res.status}`;
        throw new Error(message);
      }
      const updated = data.order as CompletedOrder;
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      const status = updated.refund?.status;
      if (status === "succeeded") toast.success("Refund completed");
      else if (status === "failed") toast.error("Refund failed");
      else toast.info("Refund still pending");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not check refund",
      );
    } finally {
      setRefundingId(null);
    }
  };

  // Auto-poll pending refunds every 30s while the section is visible
  useEffect(() => {
    const pendingIds = orders
      .filter((o) => o.refund?.status === "pending")
      .map((o) => o.id);
    if (pendingIds.length === 0) return;
    const id = setInterval(() => {
      pendingIds.forEach((orderId) => {
        void (async () => {
          try {
            const res = await fetch("/api/orders", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "check-refund", orderId }),
            });
            if (!res.ok) return;
            const data = await res.json();
            const updated = data.order as CompletedOrder;
            setOrders((prev) =>
              prev.map((o) => (o.id === orderId ? updated : o)),
            );
          } catch {
            // ignore polling errors
          }
        })();
      });
    }, 30000);
    return () => clearInterval(id);
  }, [orders]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: orders.length,
      confirmed: 0,
      in_progress: 0,
      out_for_delivery: 0,
      received: 0,
      refunded: 0,
    };
    for (const o of orders) {
      if (o.refund?.status === "succeeded") counts.refunded++;
      if (o.status && counts[o.status] !== undefined) counts[o.status]++;
    }
    return counts;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    let result = orders;
    if (statusFilter !== "all") {
      result = result.filter((o) =>
        statusFilter === "refunded"
          ? o.refund?.status === "succeeded"
          : o.status === statusFilter,
      );
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((o) => {
        const haystack = [
          o.id,
          o.orderInfo?.fullName,
          o.orderInfo?.email,
          o.orderInfo?.phone,
          o.status,
          ...(o.items?.map((i: { title?: string }) => i.title) || []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }
    const sorted = [...result];
    switch (sortKey) {
      case "oldest":
        sorted.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        break;
      case "highest":
        sorted.sort((a, b) => (b.total || 0) - (a.total || 0));
        break;
      case "lowest":
        sorted.sort((a, b) => (a.total || 0) - (b.total || 0));
        break;
      default:
        sorted.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
    }
    return sorted;
  }, [orders, statusFilter, searchQuery, sortKey]);

  const ORDERS_PER_PAGE = 10;
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.ceil(filteredOrders.length / ORDERS_PER_PAGE);
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * ORDERS_PER_PAGE;
    return filteredOrders.slice(start, start + ORDERS_PER_PAGE);
  }, [filteredOrders, currentPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchQuery, sortKey]);

  if (loadingOrders) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-12">
        <Package className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No orders yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-display text-xl">
          Orders ({filteredOrders.length}
          {filteredOrders.length !== orders.length
            ? ` of ${orders.length}`
            : ""}
          )
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Create order
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void fetchOrders()}>
            <RefreshCw
              className={`w-3.5 h-3.5 mr-1 ${loadingOrders ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      <AdminCreateOrderDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => void fetchOrders()}
      />

      <div className="flex gap-2 flex-wrap">
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search order ID, name, email, product…"
          className="h-9 w-64"
        />
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as OrderStatusFilter)}
        >
          <SelectTrigger className="h-9 w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(
              [
                { value: "all", label: "All statuses" },
                { value: "confirmed", label: "Confirmed" },
                { value: "in_progress", label: "In progress" },
                { value: "out_for_delivery", label: "Out for delivery" },
                { value: "received", label: "Received" },
                { value: "refunded", label: "Refunded" },
              ] as const
            ).map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}{" "}
                <span className="text-muted-foreground ml-1">
                  ({statusCounts[opt.value] ?? 0})
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={sortKey}
          onValueChange={(v) => setSortKey(v as OrderSortKey)}
        >
          <SelectTrigger className="h-9 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="highest">Highest total</SelectItem>
            <SelectItem value="lowest">Lowest total</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {emailStatus && (
        <div
          className={`text-xs rounded-md border px-3 py-2 ${
            emailStatus.configured
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800"
              : "bg-amber-500/10 border-amber-500/30 text-amber-800"
          }`}
        >
          <Mail className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" />
          {emailStatus.configured ? (
            <>
              Email notifications active via{" "}
              <strong>{emailStatus.provider}</strong>
              {emailStatus.from ? ` · from ${emailStatus.from}` : ""}
            </>
          ) : (
            <>
              Email notifications not configured. Set{" "}
              <code className="font-mono">RESEND_API_KEY</code> or{" "}
              <code className="font-mono">BREVO_API_KEY</code> plus{" "}
              <code className="font-mono">EMAIL_FROM</code> in Cloudflare Pages
              env to start sending. Notification history is still recorded.
            </>
          )}
        </div>
      )}

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-lg animate-in fade-in duration-150">
          <button
            type="button"
            onClick={selectAll}
            className="text-xs text-primary font-medium hover:underline"
          >
            {selectedIds.size === paginatedOrders.length
              ? "Deselect all"
              : "Select all on page"}
          </button>
          <span className="text-xs text-muted-foreground">
            {selectedIds.size} selected
          </span>
          <div className="flex-1" />
          <Select
            onValueChange={(v) =>
              void handleBulkStatus(v as CompletedOrder["status"])
            }
          >
            <SelectTrigger className="h-7 w-40 text-xs" disabled={bulkUpdating}>
              <SelectValue
                placeholder={bulkUpdating ? "Updating…" : "Batch update status"}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="out_for_delivery">Out for delivery</SelectItem>
              <SelectItem value="received">Received</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setSelectedIds(new Set())}
          >
            Cancel
          </Button>
        </div>
      )}

      {filteredOrders.length === 0 && (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">
            No orders match your filters
          </p>
        </div>
      )}

      {paginatedOrders.map((order) => {
        const currentStepIdx = ORDER_STEPS.findIndex(
          (s) => s.key === order.status,
        );
        const statusColors: Record<string, string> = {
          confirmed:
            "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
          in_progress:
            "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
          out_for_delivery:
            "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30",
          received:
            "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
        };
        const statusLabels: Record<string, string> = {
          confirmed: "Confirmed",
          in_progress: "In progress",
          out_for_delivery: "Shipping",
          received: "Received",
        };
        return (
          <div
            key={order.id}
            className="border border-border/40 rounded-lg p-5 space-y-4 transition-all hover:border-border/70 hover:shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleSelect(order.id)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title={selectedIds.has(order.id) ? "Deselect" : "Select"}
                  >
                    {selectedIds.has(order.id) ? (
                      <CheckSquare className="w-4 h-4 text-primary" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                  <p className="font-body text-sm font-semibold">{order.id}</p>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                      statusColors[order.status] ||
                      "bg-muted text-muted-foreground border-border"
                    }`}
                  >
                    {statusLabels[order.status] || order.status}
                  </span>
                </div>
                <p className="font-body text-xs text-muted-foreground">
                  {formatDate(order.createdAt)} ·{" "}
                  {order.orderInfo?.fullName ?? "—"} ·{" "}
                  {order.orderInfo?.email ?? "—"}
                </p>
              </div>
              <p className="font-body text-sm font-semibold">
                ₱{(order.total ?? 0).toLocaleString()}
              </p>
            </div>

            {/* Items */}
            <div className="text-xs text-muted-foreground space-y-0.5">
              {order.items.map((item) => (
                <p key={item.id}>
                  {item.title} × {item.quantity}
                  {item.dimensions ? (
                    <span className="ml-1 text-foreground/80">
                      · {item.dimensions}
                    </span>
                  ) : item.sizeCm ? (
                    <span className="ml-1 text-foreground/80">
                      · {formatSize(item.sizeCm)}
                    </span>
                  ) : null}{" "}
                  — ₱{(item.price * item.quantity).toLocaleString()}
                </p>
              ))}
            </div>

            {/* Shipping details */}
            <div className="text-xs space-y-1.5 p-3 bg-muted/30 border border-border/40 rounded-md">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <MapPin className="w-3.5 h-3.5" />
                Shipping details
              </div>
              <div className="space-y-0.5 text-foreground/80">
                <p className="font-medium text-foreground">
                  {order.orderInfo?.fullName ?? "—"}
                </p>
                <p>{order.orderInfo?.phone ?? "—"}</p>
                {order.orderInfo?.addressLine1 && (
                  <p>{order.orderInfo.addressLine1}</p>
                )}
                {order.orderInfo?.addressLine2 && (
                  <p>{order.orderInfo.addressLine2}</p>
                )}
                {order.orderInfo?.barangay && (
                  <p>Brgy. {order.orderInfo.barangay}</p>
                )}
                <p>
                  {order.orderInfo?.city ?? "—"}
                  {order.orderInfo?.province
                    ? `, ${order.orderInfo.province}`
                    : ""}
                  {order.orderInfo?.postalCode
                    ? ` ${order.orderInfo.postalCode}`
                    : ""}
                </p>
                {order.orderInfo?.region && (
                  <p className="text-muted-foreground">
                    {order.orderInfo.region}
                  </p>
                )}
                {order.orderInfo?.landmark && (
                  <p className="text-muted-foreground italic">
                    Landmark: {order.orderInfo.landmark}
                  </p>
                )}
                {!order.orderInfo?.addressLine1 && order.orderInfo?.address && (
                  <p>{order.orderInfo.address}</p>
                )}
              </div>
              {(order.orderInfo?.courier || order.shippingFee != null) && (
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 pt-1 border-t border-border/30 text-muted-foreground">
                  {order.orderInfo?.courier && (
                    <span>
                      Courier:{" "}
                      <span className="text-foreground">
                        {COURIERS.find((c) => c.id === order.orderInfo?.courier)
                          ?.label || order.orderInfo.courier}
                      </span>
                    </span>
                  )}
                  {order.shippingFee != null && (
                    <span>
                      Shipping:{" "}
                      <span className="text-foreground">
                        {order.freeShipping
                          ? "Free (we cover rider fee)"
                          : order.orderInfo?.courier === "lalamove" &&
                              order.shippingFee === 0
                            ? "Paid to rider"
                            : `₱${order.shippingFee.toLocaleString()}`}
                      </span>
                    </span>
                  )}
                  {order.orderInfo?.shippingZone && (
                    <span>
                      Zone:{" "}
                      <span className="text-foreground">
                        {order.orderInfo.shippingZone}
                      </span>
                    </span>
                  )}
                </div>
              )}
              {LALAMOVE_PAID_TO_RIDER &&
                order.orderInfo?.courier === "lalamove" &&
                order.orderInfo?.province && (
                  <div className="text-muted-foreground pt-0.5">
                    {(() => {
                      const range = getLalamoveRange(
                        order.orderInfo.province || "",
                      );
                      return range ? (
                        <span>
                          Est. rider fare:{" "}
                          <span className="text-foreground">
                            {formatLalamoveRange(range)}
                          </span>
                        </span>
                      ) : null;
                    })()}
                  </div>
                )}
              {order.orderInfo?.notes && (
                <div className="pt-1 border-t border-border/30">
                  <span className="text-muted-foreground">Notes: </span>
                  <span className="text-foreground/80">
                    {order.orderInfo.notes}
                  </span>
                </div>
              )}
            </div>

            {/* Payment QR */}
            {(order.paymentIntentId || order.qrCodeImageUrl) && (
              <div className="flex items-start gap-3 p-3 bg-muted/30 border border-border/40 rounded-md">
                {order.qrCodeImageUrl ? (
                  <a
                    href={order.qrCodeImageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0"
                  >
                    <img
                      src={order.qrCodeImageUrl}
                      alt="Payment QR"
                      className="w-20 h-20 object-contain bg-white p-1 rounded-sm border border-border/30"
                      loading="lazy"
                      decoding="async"
                    />
                  </a>
                ) : (
                  <QrCode className="w-5 h-5 text-muted-foreground mt-0.5" />
                )}
                <div className="min-w-0 flex-1 text-xs space-y-0.5">
                  <p className="text-foreground font-medium">QR Ph payment</p>
                  {order.paymentIntentId && (
                    <p className="text-muted-foreground break-all">
                      Intent: {order.paymentIntentId}
                    </p>
                  )}
                  {order.qrCodeImageUrl && (
                    <a
                      href={order.qrCodeImageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground underline"
                    >
                      Open QR image
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Visitor / device info */}
            {order.requestMeta &&
              (order.requestMeta.ip || order.requestMeta.userAgent) && (
                <div className="text-xs space-y-1 p-3 bg-muted/30 border border-border/40 rounded-md">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Customer device
                  </div>
                  <p className="text-foreground/80">
                    {order.requestMeta.browser || "Unknown browser"} ·{" "}
                    {order.requestMeta.os || "Unknown OS"} ·{" "}
                    {order.requestMeta.device || "device"}
                  </p>
                  {order.requestMeta.ip && (
                    <p className="text-muted-foreground font-mono">
                      IP: {order.requestMeta.ip}
                    </p>
                  )}
                </div>
              )}

            {/* Activity log (admin / customer touchpoints) */}
            {order.activityLog && order.activityLog.length > 0 && (
              <div className="text-xs space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Activity log
                </div>
                <ul className="space-y-1 pl-5 list-disc text-muted-foreground">
                  {order.activityLog.map((entry, idx) => (
                    <li key={`${entry.at}-${idx}`}>
                      <span className="text-foreground">{entry.type}</span> (
                      {entry.actor}) — {new Date(entry.at).toLocaleString()}
                      {entry.ip && (
                        <span className="font-mono"> · {entry.ip}</span>
                      )}
                      {entry.browser && (
                        <span>
                          {" "}
                          · {entry.browser} on {entry.os}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Notifications log */}
            {order.notifications && order.notifications.length > 0 && (
              <div className="text-xs space-y-1.5">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Bell className="w-3.5 h-3.5" />
                  <span className="text-[10px] uppercase tracking-wider">
                    Notifications sent
                  </span>
                </div>
                <ul className="space-y-2 text-muted-foreground">
                  {order.notifications.map((n, idx) => {
                    let badge: {
                      text: string;
                      className: string;
                    } | null = null;
                    if (n.delivered) {
                      badge = {
                        text: `Email delivered${n.provider ? ` · ${n.provider}` : ""}`,
                        className:
                          "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
                      };
                    } else if (n.skipped) {
                      badge = {
                        text: `Email skipped${
                          n.skipReason ? ` · ${n.skipReason}` : ""
                        }`,
                        className:
                          "bg-muted text-muted-foreground border-border/40",
                      };
                    } else if (n.error) {
                      badge = {
                        text: `Email failed`,
                        className:
                          "bg-red-500/15 text-red-700 border-red-500/30",
                      };
                    }
                    return (
                      <li
                        key={`${n.sentAt}-${idx}`}
                        className="border border-border/30 rounded-md p-2 bg-muted/20"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-foreground">{n.message}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {n.recipient} ·{" "}
                              {new Date(n.sentAt).toLocaleString()}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-[10px]"
                            disabled={resendingKey === `${order.id}:${idx}`}
                            onClick={() => handleResendEmail(order.id, idx)}
                          >
                            {resendingKey === `${order.id}:${idx}`
                              ? "Resending…"
                              : "Resend email"}
                          </Button>
                        </div>
                        {badge && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            <span
                              className={`inline-block text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${badge.className}`}
                            >
                              {badge.text}
                            </span>
                            {n.providerId && (
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {n.providerId}
                              </span>
                            )}
                          </div>
                        )}
                        {n.error && (
                          <p className="mt-1 text-[10px] text-red-700">
                            {n.error}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Shipment / tracking */}
            <ShipmentEditor
              order={order}
              busy={updatingId === order.id}
              onSave={(s) => handleSaveShipment(order.id, s)}
              onClear={() => handleClearShipment(order.id)}
            />

            {/* Reviews (per painting) */}
            {(() => {
              const reviewsList: OrderReview[] =
                order.reviews && order.reviews.length > 0
                  ? order.reviews
                  : order.review
                    ? [order.review]
                    : [];
              if (reviewsList.length === 0) return null;
              return reviewsList.map((rev, idx) => (
                <div
                  key={`${rev.productId ?? "legacy"}-${idx}`}
                  className="text-xs space-y-2 p-3 bg-muted/30 border border-border/40 rounded-md"
                >
                  <div className="flex items-center gap-2 text-muted-foreground flex-wrap">
                    <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                    <span className="text-[10px] uppercase tracking-wider">
                      Customer review
                      {rev.productTitle ? ` · ${rev.productTitle}` : ""}
                    </span>
                    {rev.publishedToHomepage && (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 rounded">
                        On homepage
                      </span>
                    )}
                    <span className="ml-auto text-[10px]">
                      {new Date(rev.submittedAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={`w-3.5 h-3.5 ${
                          n <= rev.rating
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-muted-foreground"
                        }`}
                      />
                    ))}
                    <span className="ml-1 text-muted-foreground">
                      {rev.rating}/5
                    </span>
                  </div>
                  <p className="text-foreground whitespace-pre-wrap">
                    {rev.text}
                  </p>
                  {rev.images.length > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                      {rev.images.map((src, i) => (
                        <a
                          key={i}
                          href={src}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <img
                            src={src}
                            alt={`Review image ${i + 1}`}
                            className="aspect-square w-full object-cover rounded-sm border border-border/20"
                            loading="lazy"
                            decoding="async"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-end pt-1">
                    <Button
                      type="button"
                      variant={rev.publishedToHomepage ? "outline" : "default"}
                      size="sm"
                      disabled={updatingId === order.id}
                      onClick={() =>
                        void handleSetReviewPublished(
                          order.id,
                          !rev.publishedToHomepage,
                          rev.productId,
                        )
                      }
                      className="text-xs h-7"
                    >
                      {rev.publishedToHomepage ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5 mr-1" />
                          Unpublish
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          Publish to homepage
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ));
            })()}

            {/* Journey Map */}
            <div className="flex items-center gap-1">
              {ORDER_STEPS.map((step, idx) => {
                const done = idx <= currentStepIdx;
                const isActive = idx === currentStepIdx;
                return (
                  <button
                    key={step.key}
                    disabled={updatingId === order.id}
                    onClick={() => handleStatusUpdate(order.id, step.key)}
                    className={`flex-1 py-2 px-1 text-center rounded-sm text-[10px] font-medium transition-colors ${
                      done
                        ? isActive
                          ? "bg-foreground text-background"
                          : "bg-foreground/20 text-foreground"
                        : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
                    } ${updatingId === order.id ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                    title={step.description}
                  >
                    {step.label}
                  </button>
                );
              })}
            </div>

            {/* Production stage stepper — only meaningful while the
                artist is actively working on the painting, so we hide
                it for confirmed / shipping / received rows to keep the
                row compact. */}
            {order.status === "in_progress" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <Brush className="w-3 h-3" />
                    Production stage
                  </div>
                  {order.productionStage && (
                    <button
                      type="button"
                      disabled={updatingId === order.id}
                      onClick={() =>
                        void handleProductionStageUpdate(order.id, null)
                      }
                      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {PRODUCTION_STAGES.map((s) => {
                    const isCurrent = order.productionStage === s.key;
                    return (
                      <button
                        key={s.key}
                        type="button"
                        disabled={updatingId === order.id}
                        onClick={() =>
                          void handleProductionStageUpdate(order.id, s.key)
                        }
                        title={s.description}
                        className={`flex-1 py-1.5 px-1 text-center rounded-sm text-[10px] font-medium transition-colors ${
                          isCurrent
                            ? "bg-foreground text-background"
                            : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
                        } ${updatingId === order.id ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
                {/* Behind-the-scenes photo strip per stage. Shows
                    existing photos (with hover-to-remove), plus an
                    upload button that's only enabled when a stage is
                    actually selected — uploading without a stage tag
                    would leave the photo orphaned in the customer UI. */}
                <div className="space-y-1.5 pt-1">
                  {PRODUCTION_STAGES.map((s) => {
                    const photos = (order.productionPhotos || []).filter(
                      (p) => p.stage === s.key,
                    );
                    const canUpload =
                      order.productionStage === s.key &&
                      updatingId !== order.id;
                    if (photos.length === 0 && order.productionStage !== s.key)
                      return null;
                    return (
                      <div
                        key={s.key}
                        className="flex items-start gap-2 text-[10px]"
                      >
                        <span className="w-14 shrink-0 pt-1 uppercase tracking-wider text-muted-foreground">
                          {s.label}
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5 flex-1">
                          {photos.map((p) => (
                            <div
                              key={p.id}
                              className="relative group w-12 h-12 rounded-sm overflow-hidden border border-border/40 bg-muted/40"
                            >
                              <a
                                href={p.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block w-full h-full"
                                title={`Uploaded ${formatDate(p.uploadedAt)}`}
                              >
                                <img
                                  src={p.url}
                                  alt={`${s.label} photo`}
                                  loading="lazy"
                                  className="w-full h-full object-cover"
                                />
                              </a>
                              <button
                                type="button"
                                onClick={() =>
                                  void handleRemoveProductionPhoto(
                                    order.id,
                                    p.id,
                                  )
                                }
                                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-background/90 text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity flex items-center justify-center"
                                aria-label={`Remove ${s.label} photo`}
                                title="Remove photo"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ))}
                          <label
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-sm border border-dashed text-[10px] uppercase tracking-wider transition-colors ${
                              canUpload
                                ? "border-border text-muted-foreground hover:bg-muted/40 cursor-pointer"
                                : "border-border/50 text-muted-foreground/50 cursor-not-allowed"
                            }`}
                            title={
                              canUpload
                                ? "Upload a behind-the-scenes photo"
                                : "Mark this stage as current to upload"
                            }
                          >
                            <input
                              type="file"
                              accept="image/*"
                              className="sr-only"
                              disabled={!canUpload}
                              onChange={(e) => {
                                const file = e.currentTarget.files?.[0];
                                e.currentTarget.value = "";
                                if (!file) return;
                                void handleUploadProductionPhoto(
                                  order.id,
                                  s.key,
                                  file,
                                );
                              }}
                            />
                            <ImagePlus className="w-3 h-3" />
                            {photos.length === 0 ? "Add photo" : "Add"}
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Refund block */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/30">
              {order.refund ? (
                <div className="flex flex-wrap items-center gap-2 w-full">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-sm text-[10px] uppercase tracking-wider ${
                      order.refund.status === "succeeded"
                        ? "bg-emerald-500/15 text-emerald-600"
                        : order.refund.status === "failed"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-amber-500/15 text-amber-600"
                    }`}
                  >
                    <Wallet className="w-3 h-3" />
                    Refund {order.refund.status}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ₱{order.refund.amount.toLocaleString()} · requested{" "}
                    {new Date(order.refund.requestedAt).toLocaleString()}
                  </span>
                  {order.refund.id && (
                    <span className="text-[10px] text-muted-foreground break-all">
                      Ref: {order.refund.id}
                    </span>
                  )}
                  {order.refund.status === "pending" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={refundingId === order.id}
                      onClick={() => void handleCheckRefund(order.id)}
                      className="ml-auto"
                    >
                      <RefreshCw
                        className={`w-3 h-3 mr-1 ${refundingId === order.id ? "animate-spin" : ""}`}
                      />
                      Check QR Ph status
                    </Button>
                  )}
                  {order.refund.status === "failed" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={refundingId === order.id}
                      onClick={() => setConfirmRefundFor(order)}
                      className="ml-auto"
                    >
                      <Undo2 className="w-3 h-3 mr-1" /> Retry refund
                    </Button>
                  )}
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!order.paymentIntentId || refundingId === order.id}
                  onClick={() => setConfirmRefundFor(order)}
                  title={
                    order.paymentIntentId
                      ? "Manually refund this order via PayMongo back to the customer's QR Ph wallet"
                      : "No PayMongo payment recorded — cannot auto-refund"
                  }
                >
                  <Undo2 className="w-3 h-3 mr-1" /> Manual refund
                </Button>
              )}
            </div>

            {/* Admin notes */}
            <div className="pt-2 border-t border-border/30">
              {editingNoteId === order.id ? (
                <div className="flex gap-2">
                  <Input
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    placeholder="Add internal note…"
                    className="h-8 text-xs flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        void saveAdminNote(order.id, noteInput);
                      if (e.key === "Escape") setEditingNoteId(null);
                    }}
                    autoFocus
                  />
                  <Button
                    variant="default"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => void saveAdminNote(order.id, noteInput)}
                  >
                    Save
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setEditingNoteId(null)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <StickyNote className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                  {adminNotes[order.id] ||
                  (order as unknown as Record<string, unknown>).adminNote ? (
                    <p className="text-xs text-muted-foreground flex-1">
                      {adminNotes[order.id] ||
                        String(
                          (order as unknown as Record<string, unknown>)
                            .adminNote ?? "",
                        )}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground/50 italic flex-1">
                      No admin notes
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setNoteInput(
                        adminNotes[order.id] ||
                          String(
                            (order as unknown as Record<string, unknown>)
                              .adminNote ?? "",
                          ),
                      );
                      setEditingNoteId(order.id);
                    }}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Order timeline */}
            <div className="pt-2 border-t border-border/30">
              <button
                type="button"
                onClick={() =>
                  setExpandedTimeline(
                    expandedTimeline === order.id ? null : order.id,
                  )
                }
                className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <Clock className="w-3 h-3" />
                {expandedTimeline === order.id
                  ? "Hide timeline"
                  : "View timeline"}
              </button>
              {expandedTimeline === order.id && (
                <div className="mt-2 ml-1 space-y-0 border-l-2 border-border/30 pl-4">
                  {(() => {
                    const log = Array.isArray(
                      (order as unknown as Record<string, unknown>).activityLog,
                    )
                      ? ((order as unknown as Record<string, unknown>)
                          .activityLog as {
                          at: string;
                          type: string;
                          actor?: string;
                        }[])
                      : [];
                    const events =
                      log.length > 0
                        ? [...log].sort((a, b) =>
                            (b.at || "").localeCompare(a.at || ""),
                          )
                        : [
                            {
                              at: order.createdAt,
                              type: "placed",
                              actor: "customer",
                            },
                          ];
                    const labels: Record<string, string> = {
                      placed: "Order placed",
                      "status:confirmed": "Status → Confirmed",
                      "status:in_progress": "Status → In progress",
                      "status:out_for_delivery": "Status → Shipped",
                      "status:received": "Status → Delivered",
                      "shipment:cleared": "Shipment cleared",
                      "email:resent": "Email resent",
                      "refund:initiated": "Refund initiated",
                      "refund:succeeded": "Refund completed",
                    };
                    return events.map((evt, i) => (
                      <div
                        key={i}
                        className="relative flex items-start gap-2 py-1.5"
                      >
                        <div className="absolute -left-[21px] top-2.5 w-2 h-2 rounded-full bg-border" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">
                            {labels[evt.type] || evt.type}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(evt.at).toLocaleString("en-PH", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                            {evt.actor ? ` · ${evt.actor}` : ""}
                          </p>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-3 h-3 mr-1" />
              Prev
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(
                (p) =>
                  p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1,
              )
              .reduce<(number | "ellipsis")[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1)
                  acc.push("ellipsis");
                acc.push(p);
                return acc;
              }, [])
              .map((p, idx) =>
                p === "ellipsis" ? (
                  <span
                    key={`e-${idx}`}
                    className="px-1 text-xs text-muted-foreground"
                  >
                    …
                  </span>
                ) : (
                  <Button
                    key={p}
                    variant={currentPage === p ? "default" : "outline"}
                    size="sm"
                    className="h-8 w-8 p-0 text-xs"
                    onClick={() => setCurrentPage(p)}
                  >
                    {p}
                  </Button>
                ),
              )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
              <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Confirm refund dialog */}
      {confirmRefundFor && (
        <div className="fixed inset-0 z-[200] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border/40 rounded-lg p-6 max-w-md w-full space-y-4">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-amber-500" />
              <h3 className="font-display text-lg">Confirm refund</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Refund ₱{(confirmRefundFor.total ?? 0).toLocaleString()} for order{" "}
              <span className="text-foreground font-medium">
                {confirmRefundFor.id}
              </span>{" "}
              back to {confirmRefundFor.orderInfo?.email}'s QR Ph wallet via
              PayMongo? The customer will receive a refund-in-progress
              notification immediately and a confirmation once PayMongo
              completes the transfer (typically minutes to a few banking days).
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={refundingId === confirmRefundFor.id}
                onClick={() => setConfirmRefundFor(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={refundingId === confirmRefundFor.id}
                onClick={() => void handleRefund(confirmRefundFor)}
              >
                {refundingId === confirmRefundFor.id ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />{" "}
                    Initiating...
                  </>
                ) : (
                  <>
                    <Undo2 className="w-3 h-3 mr-1" /> Issue refund
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Convert an ISO timestamp into the YYYY-MM-DD shape the native date
// input expects, in the viewer's local timezone (so "shipped today"
// renders as today even on the other side of the dateline).
const toDateInputValue = (iso?: string): string => {
  if (!iso) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

function ShipmentEditor({
  order,
  busy,
  onSave,
  onClear,
}: {
  order: CompletedOrder;
  busy: boolean;
  onSave: (s: {
    courier: string;
    trackingNumber: string;
    trackingUrl?: string;
    shippedAt?: string;
  }) => void;
  onClear: () => void;
}) {
  const existing: OrderShipment | undefined = order.shipment;
  const [courier, setCourier] = useState<string>(existing?.courier ?? "");
  const [trackingNumber, setTrackingNumber] = useState<string>(
    existing?.trackingNumber ?? "",
  );
  const [trackingUrl, setTrackingUrl] = useState<string>(
    existing?.trackingUrl ?? "",
  );
  const [shippedAt, setShippedAt] = useState<string>(
    toDateInputValue(existing?.shippedAt),
  );

  useEffect(() => {
    setCourier(existing?.courier ?? "");
    setTrackingNumber(existing?.trackingNumber ?? "");
    setTrackingUrl(existing?.trackingUrl ?? "");
    setShippedAt(toDateInputValue(existing?.shippedAt));
  }, [
    existing?.courier,
    existing?.trackingNumber,
    existing?.trackingUrl,
    existing?.shippedAt,
  ]);

  const previewUrl = buildTrackingUrl(courier, trackingNumber, trackingUrl);
  const existingShippedAtInput = toDateInputValue(existing?.shippedAt);
  const dirty =
    (existing?.courier ?? "") !== courier ||
    (existing?.trackingNumber ?? "") !== trackingNumber ||
    (existing?.trackingUrl ?? "") !== trackingUrl ||
    existingShippedAtInput !== shippedAt;
  const canSave = courier.trim() && trackingNumber.trim() && dirty;

  return (
    <div className="text-xs space-y-2 p-3 bg-muted/30 border border-border/40 rounded-md">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Truck className="w-3.5 h-3.5" />
        <span className="text-[10px] uppercase tracking-wider">
          Shipment / tracking
        </span>
        {existing && (
          <span className="ml-auto text-[10px] text-muted-foreground">
            Saved {new Date(existing.updatedAt).toLocaleString()}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Courier
          </Label>
          <Select value={courier || ""} onValueChange={setCourier}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select courier" />
            </SelectTrigger>
            <SelectContent>
              {COURIERS.map((c) => (
                <SelectItem key={c.id} value={c.label}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Tracking number
          </Label>
          <Input
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="e.g. JT1234567890"
            className="h-8 text-xs"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Ship date
        </Label>
        <Input
          type="date"
          value={shippedAt}
          onChange={(e) => setShippedAt(e.target.value)}
          className="h-8 text-xs"
        />
        <p className="text-[10px] text-muted-foreground">
          Defaults to today. Edit if you typed the AWB in late so the buyer sees
          the actual drop-off date.
        </p>
      </div>
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Custom tracking URL (optional)
        </Label>
        <Input
          value={trackingUrl}
          onChange={(e) => setTrackingUrl(e.target.value)}
          placeholder="Leave blank to auto-build from courier"
          className="h-8 text-xs"
        />
        {previewUrl && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-foreground/70 underline break-all"
          >
            Preview: {previewUrl}
          </a>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={busy || !canSave}
          onClick={() =>
            onSave({
              courier: courier.trim(),
              trackingNumber: trackingNumber.trim(),
              trackingUrl: trackingUrl.trim() || undefined,
              shippedAt: shippedAt
                ? new Date(`${shippedAt}T00:00:00`).toISOString()
                : undefined,
            })
          }
        >
          {existing ? "Update tracking" : "Save tracking"}
        </Button>
        {existing && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={busy}
            onClick={onClear}
          >
            Clear
          </Button>
        )}
        {/* Admin-side waybill download — works any time, even before
            tracking is set, so admins can print a label first then
            stick the courier number on later. */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs ml-auto"
          onClick={async () => {
            try {
              // Lazy-load to keep jspdf + jsbarcode (~410 KB) out of
              // the admin-page initial chunk; only loaded on demand.
              const { downloadWaybillPdf } = await import("@/lib/waybill");
              downloadWaybillPdf(order);
            } catch (err) {
              toast.error(
                err instanceof Error
                  ? err.message
                  : "Could not generate waybill",
              );
            }
          }}
        >
          Download waybill
        </Button>
      </div>
    </div>
  );
}

function SettingsSection() {
  const { changePassword, logout } = useAdminAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (changingPassword) return;
    if (!currentPassword) {
      return toast.error("Enter your current password");
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return toast.error(
        `New password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }
    if (newPassword === currentPassword) {
      return toast.error("New password must be different");
    }

    setChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      toast.success("Password updated");
      setCurrentPassword("");
      setNewPassword("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not change password",
      );
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="max-w-md space-y-6">
      <section className="bg-card/40 border border-border/60 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="w-4 h-4 text-primary" />
          <h2 className="font-display text-lg">Change password</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Pick any new password (8+ characters). After saving, your existing
          session stays signed in but every other device gets logged out.
        </p>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <div>
            <Label htmlFor="currentPassword">Current password</Label>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="newPassword">New password</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={changingPassword} className="w-full">
            {changingPassword ? "Updating..." : "Update password"}
          </Button>
        </form>
      </section>

      <section className="bg-card/40 border border-border/60 rounded-xl p-6">
        <h2 className="font-display text-lg mb-2">Sign out</h2>
        <p className="text-sm text-muted-foreground mb-4">
          End your admin session on this device. You can sign back in any time
          from this URL.
        </p>
        <Button variant="outline" onClick={logout} className="w-full">
          <LogOut className="w-4 h-4 mr-2" /> Sign out
        </Button>
      </section>
    </div>
  );
}

function ExportsSection() {
  const token = getAdminToken() ?? "";
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="font-display text-xl mb-1">Data exports</h2>
        <p className="text-sm text-muted-foreground">
          Pull the live snapshot of orders, customers, or newsletter
          subscribers. CSV opens cleanly in Excel / Google Sheets; JSON keeps
          every nested field for backups and migrations.
        </p>
      </div>
      <ExportPanel token={token} />
      <MigrateR2Card />
      <MigrateVariantsCard />
    </div>
  );
}

interface ChatMessage {
  at: string;
  from: "customer" | "admin" | "system";
  body: string;
}

interface ChatThreadIndexEntry {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  customerLastMessageAt?: string;
  lastReadByAdminAt?: string;
  lastFromAdmin?: boolean;
  messageCount?: number;
  ip?: string;
  browser?: string;
  os?: string;
  device?: string;
  closedAt?: string;
}

interface ChatThreadDetail {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  messages: ChatMessage[];
  closedAt?: string;
  closedBy?: string;
}

const isThreadUnread = (t: ChatThreadIndexEntry) => {
  if (!t.customerLastMessageAt) return false;
  if (!t.lastReadByAdminAt) return true;
  return Date.parse(t.customerLastMessageAt) > Date.parse(t.lastReadByAdminAt);
};

interface SavedReply {
  id: string;
  label: string;
  body: string;
}

function MessagesSection() {
  const [threads, setThreads] = useState<ChatThreadIndexEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<ChatThreadDetail | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [savedReplies, setSavedReplies] = useState<SavedReply[]>([]);
  const [repliesPopoverOpen, setRepliesPopoverOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const loadSavedReplies = async () => {
    try {
      const token = getAdminToken();
      const res = await fetch("/api/storefront-config?admin=1", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data?.config?.savedReplies)
        ? (data.config.savedReplies as SavedReply[])
        : [];
      setSavedReplies(list);
    } catch {
      // Non-blocking — admin can still send replies manually.
    }
  };

  useEffect(() => {
    void loadSavedReplies();
  }, []);

  const insertSavedReply = (reply: SavedReply) => {
    // Insert at the cursor position (or append if textarea isn't focused).
    // Doesn't replace the existing draft so admin can stack templates or
    // tweak the body before sending.
    const ta = draftRef.current;
    if (!ta) {
      setDraft((d) => (d ? `${d}\n\n${reply.body}` : reply.body));
    } else {
      const start = ta.selectionStart ?? draft.length;
      const end = ta.selectionEnd ?? draft.length;
      const before = draft.slice(0, start);
      const after = draft.slice(end);
      const sep = before && !before.endsWith("\n") ? "\n\n" : "";
      const next = `${before}${sep}${reply.body}${after}`;
      setDraft(next);
      requestAnimationFrame(() => {
        ta.focus();
        const cursor = before.length + sep.length + reply.body.length;
        ta.setSelectionRange(cursor, cursor);
      });
    }
    setRepliesPopoverOpen(false);
  };

  const refreshThreads = async () => {
    setLoading(true);
    try {
      const token = getAdminToken();
      const res = await fetch("/api/chat?action=list", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: ChatThreadIndexEntry[] = Array.isArray(data.threads)
        ? data.threads
        : [];
      list.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      setThreads(list);
    } catch (err) {
      console.error(err);
      toast.error("Could not load chat threads");
    } finally {
      setLoading(false);
    }
  };

  const loadThread = async (id: string) => {
    try {
      const res = await fetch(
        `/api/chat?action=thread&id=${encodeURIComponent(id)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.thread) setActiveThread(data.thread);
    } catch (err) {
      console.error(err);
      toast.error("Could not load thread");
    }
  };

  const markRead = async (id: string) => {
    try {
      const token = getAdminToken();
      await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: "admin-mark-read", id }),
      });
    } catch {
      // ignore — not critical
    }
  };

  useEffect(() => {
    void refreshThreads();
    const id = window.setInterval(() => void refreshThreads(), 10_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!activeId) {
      setActiveThread(null);
      return;
    }
    void loadThread(activeId);
    void markRead(activeId);
    setThreads((prev) =>
      prev.map((t) =>
        t.id === activeId
          ? { ...t, lastReadByAdminAt: new Date().toISOString() }
          : t,
      ),
    );
  }, [activeId]);

  useEffect(() => {
    if (!activeId) return;
    const id = window.setInterval(() => void loadThread(activeId), 5_000);
    return () => window.clearInterval(id);
  }, [activeId]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activeThread?.messages.length]);

  const sendReply = async () => {
    if (!activeId) return;
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      const token = getAdminToken();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: "admin-reply",
          id: activeId,
          message: trimmed,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not send reply");
      if (data.thread) setActiveThread(data.thread);
      setDraft("");
      void refreshThreads();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send reply");
    } finally {
      setSending(false);
    }
  };

  // Throttled typing ping. While the admin's draft has any content we POST
  // admin-typing at most once every 3s; the customer's poll picks the
  // indicator up within ~5s of the first keystroke.
  const lastTypingPingRef = useRef<number>(0);
  const sendTypingPing = (next: string) => {
    if (!activeId) return;
    if (!next.trim()) return;
    const now = Date.now();
    if (now - lastTypingPingRef.current < 3000) return;
    lastTypingPingRef.current = now;
    const token = getAdminToken();
    void fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ action: "admin-typing", id: activeId }),
    }).catch(() => {
      /* best-effort */
    });
  };

  const setThreadClosed = async (close: boolean) => {
    if (!activeId) return;
    if (
      close &&
      !window.confirm(
        "Close this conversation? The customer will see a 'Conversation closed' notice and can't reply unless they start a new chat.",
      )
    ) {
      return;
    }
    try {
      const token = getAdminToken();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: close ? "admin-close" : "admin-reopen",
          id: activeId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(
          data.error || (close ? "Could not close" : "Could not reopen"),
        );
      if (data.thread) setActiveThread(data.thread);
      void refreshThreads();
      toast.success(close ? "Conversation closed" : "Conversation reopened");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  };

  const unreadCount = threads.filter(isThreadUnread).length;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl">Messages</h1>
          <p className="text-xs text-muted-foreground">
            {threads.length} thread{threads.length === 1 ? "" : "s"}
            {unreadCount > 0 ? ` · ${unreadCount} unread` : ""}.
          </p>
        </div>
        <Button onClick={refreshThreads} variant="outline" disabled={loading}>
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[280px,1fr] min-h-[480px]">
        <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
          {threads.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              No chat threads yet.
            </div>
          ) : (
            <ul className="divide-y divide-border/40 max-h-[600px] overflow-y-auto">
              {threads.map((t) => {
                const unread = isThreadUnread(t);
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(t.id)}
                      className={`w-full text-left p-3 hover:bg-muted/30 transition flex flex-col gap-0.5 ${
                        activeId === t.id ? "bg-muted/40" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {t.name}
                        </span>
                        {unread && (
                          <span className="h-2 w-2 rounded-full bg-primary inline-block" />
                        )}
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {new Date(t.updatedAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground truncate">
                        {t.email}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {t.messageCount ?? 0} msg
                        {(t.messageCount ?? 0) === 1 ? "" : "s"}
                        {t.lastFromAdmin ? " · last: you" : ""}
                        {t.closedAt ? " · closed" : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-border/60 bg-card flex flex-col min-h-[480px]">
          {!activeId || !activeThread ? (
            <div className="flex-1 grid place-items-center text-sm text-muted-foreground">
              Select a thread to read and reply.
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-border/60 bg-muted/20 flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {activeThread.name}
                    {activeThread.closedAt && (
                      <span className="ml-2 inline-flex items-center text-[10px] uppercase tracking-wide bg-muted text-muted-foreground rounded-full px-2 py-0.5">
                        Closed
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {activeThread.email} · started{" "}
                    {new Date(activeThread.createdAt).toLocaleString()}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={activeThread.closedAt ? "default" : "outline"}
                  onClick={() => void setThreadClosed(!activeThread.closedAt)}
                  title={
                    activeThread.closedAt
                      ? "Reopen this conversation so the customer can reply"
                      : "Close & archive this conversation"
                  }
                >
                  {activeThread.closedAt ? "Reopen" : "Close"}
                </Button>
              </div>
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-4 py-3 space-y-2 max-h-[480px]"
              >
                {activeThread.messages.map((m, idx) => {
                  if (m.from === "system") {
                    return (
                      <div
                        key={`${m.at}-${idx}`}
                        className="flex justify-center my-1"
                      >
                        <p
                          className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/40 rounded-full px-2.5 py-1"
                          title={new Date(m.at).toLocaleString()}
                        >
                          {m.body}
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={`${m.at}-${idx}`}
                      className={`flex flex-col ${
                        m.from === "admin" ? "items-end" : "items-start"
                      }`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                          m.from === "admin"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                        }`}
                      >
                        {linkifyMessage(m.body)}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 px-1">
                        {m.from === "admin" ? "You" : activeThread.name} ·{" "}
                        {new Date(m.at).toLocaleString()}
                      </p>
                    </div>
                  );
                })}
              </div>
              {activeThread.closedAt ? (
                <div className="border-t border-border/60 px-4 py-3 bg-muted/20 text-xs text-muted-foreground text-center">
                  Conversation closed{" "}
                  {new Date(activeThread.closedAt).toLocaleString()}. Reopen to
                  reply.
                </div>
              ) : (
                <div className="border-t border-border/60 px-3 py-2 flex items-end gap-2">
                  <Textarea
                    ref={draftRef}
                    value={draft}
                    onChange={(e) => {
                      const next = e.target.value;
                      setDraft(next);
                      sendTypingPing(next);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        if (!sending && draft.trim()) void sendReply();
                      }
                    }}
                    placeholder="Reply to the customer (Ctrl+Enter to send)"
                    className="resize-none min-h-[44px] max-h-[120px] text-sm"
                    maxLength={2000}
                  />
                  <Popover
                    open={repliesPopoverOpen}
                    onOpenChange={setRepliesPopoverOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        title="Insert a saved reply"
                      >
                        <MessageSquarePlus className="w-4 h-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      className="w-80 p-0 overflow-hidden"
                    >
                      <div className="px-3 py-2 border-b border-border/40 flex items-center justify-between">
                        <p className="text-xs font-medium tracking-wider uppercase text-muted-foreground">
                          Saved replies
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setRepliesPopoverOpen(false);
                            setManageOpen(true);
                          }}
                          className="text-[11px] text-primary hover:underline"
                        >
                          Manage
                        </button>
                      </div>
                      {savedReplies.length === 0 ? (
                        <div className="p-4 text-xs text-muted-foreground text-center">
                          No saved replies yet. Click <strong>Manage</strong> to
                          add one.
                        </div>
                      ) : (
                        <ul className="max-h-72 overflow-y-auto divide-y divide-border/40">
                          {savedReplies.map((r) => (
                            <li key={r.id}>
                              <button
                                type="button"
                                onClick={() => insertSavedReply(r)}
                                className="w-full text-left px-3 py-2 hover:bg-muted/40 transition-colors"
                              >
                                <p className="text-sm font-medium truncate">
                                  {r.label}
                                </p>
                                <p className="text-[11px] text-muted-foreground line-clamp-2">
                                  {r.body}
                                </p>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </PopoverContent>
                  </Popover>
                  <Button
                    onClick={() => void sendReply()}
                    disabled={sending || !draft.trim()}
                  >
                    {sending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Send"
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <SavedRepliesManager
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        replies={savedReplies}
        onSaved={(next) => setSavedReplies(next)}
      />
    </div>
  );
}

function SavedRepliesManager({
  open,
  onClose,
  replies,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  replies: SavedReply[];
  onSaved: (next: SavedReply[]) => void;
}) {
  const [draft, setDraft] = useState<SavedReply[]>(replies);
  const [saving, setSaving] = useState(false);

  // Re-sync the editor when the parent's replies change (e.g. another
  // admin tab saved). We only do this when the drawer opens to avoid
  // wiping unsaved edits while admin is mid-typing.
  useEffect(() => {
    if (open) setDraft(replies);
  }, [open, replies]);

  const updateAt = (idx: number, patch: Partial<SavedReply>) => {
    setDraft((d) => d.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeAt = (idx: number) => {
    setDraft((d) => d.filter((_, i) => i !== idx));
  };

  const addNew = () => {
    setDraft((d) => [
      ...d,
      {
        id: `reply-${Date.now().toString(36)}`,
        label: "",
        body: "",
      },
    ]);
  };

  const save = async () => {
    setSaving(true);
    try {
      // Drop entries that are still empty so admin doesn't accidentally
      // ship a blank template.
      const cleaned = draft
        .map((r) => ({
          id: r.id,
          label: r.label.trim(),
          body: r.body.trim(),
        }))
        .filter((r) => r.label && r.body);
      const token = getAdminToken();
      const res = await fetch("/api/storefront-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: "update-saved-replies",
          savedReplies: cleaned,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const nextList = Array.isArray(data?.config?.savedReplies)
        ? (data.config.savedReplies as SavedReply[])
        : cleaned;
      onSaved(nextList);
      toast.success("Saved replies updated");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg flex flex-col p-0"
      >
        <SheetHeader className="px-6 py-4 border-b border-border/60">
          <SheetTitle>Manage saved replies</SheetTitle>
          <p className="text-xs text-muted-foreground">
            Templates you can drop into a chat reply with one click. Up to 30
            templates · 2,000 characters each.
          </p>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {draft.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No saved replies yet — click "Add reply" below to create one.
            </p>
          ) : (
            draft.map((r, idx) => (
              <div
                key={r.id}
                className="rounded-lg border border-border/60 bg-card/40 p-3 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <Input
                    value={r.label}
                    onChange={(e) => updateAt(idx, { label: e.target.value })}
                    placeholder="Label (e.g. Order shipped)"
                    maxLength={80}
                    className="font-medium"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeAt(idx)}
                    title="Delete reply"
                  >
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
                <Textarea
                  value={r.body}
                  onChange={(e) => updateAt(idx, { body: e.target.value })}
                  placeholder="Body — what the customer will see when you insert this reply."
                  rows={4}
                  maxLength={2000}
                  className="resize-none text-sm"
                />
                <p className="text-[11px] text-muted-foreground text-right">
                  {r.body.length}/2,000
                </p>
              </div>
            ))
          )}
          <Button
            variant="outline"
            onClick={addNew}
            disabled={draft.length >= 30}
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            {draft.length >= 30 ? "Limit reached (30)" : "Add reply"}
          </Button>
        </div>
        <div className="px-6 py-3 border-t border-border/60 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default AdminPage;
