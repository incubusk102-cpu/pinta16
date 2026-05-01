import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
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
} from "@/contexts/ProductContext";
import {
  AVAILABILITY_LABEL,
  AVAILABILITY_OPTIONS,
  getAvailability,
} from "@/lib/artworks";
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
import { EditProductDialog } from "@/components/admin/EditProductDialog";
import { ProductImageGallery } from "@/components/admin/ProductImageGallery";
import { StockListingsSection } from "@/components/admin/StockListingsSection";
import { VisitorsSection } from "@/components/admin/VisitorsSection";
import { ReviewsSection } from "@/components/admin/ReviewsSection";
import { UsersSection } from "@/components/admin/UsersSection";
import { CustomersSection } from "@/components/admin/CustomersSection";
import { MarketingSection } from "@/components/admin/MarketingSection";
import { StorefrontSection } from "@/components/admin/StorefrontSection";
import { PoliciesSection } from "@/components/admin/PoliciesSection";
import { HeroSlidesSection } from "@/components/admin/HeroSlidesSection";
import { SiteCopySection } from "@/components/admin/SiteCopySection";
import { WelcomeEmailSection } from "@/components/admin/WelcomeEmailSection";
import { OrderEmailSection } from "@/components/admin/OrderEmailSection";
import { NewUserModalSection } from "@/components/admin/NewUserModalSection";
import ExportPanel from "@/admin/ExportPanel";
import {
  ArrowLeft,
  Activity,
  Bell,
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
  Package,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Settings,
  Shield,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Images,
  Star,
  Trash2,
  TrendingUp,
  Truck,
  Type,
  Search,
  Clock,
  StickyNote,
  CheckSquare,
  Square,
  Undo2,
  Upload,
  Users,
  Wallet,
} from "lucide-react";
import {
  ORDER_STEPS,
  type CompletedOrder,
  type OrderReview,
  type OrderShipment,
} from "@/contexts/CartContext";
import { getAdminToken } from "@/contexts/AdminAuthContext";
import { COURIERS, buildTrackingUrl } from "@/lib/shipment";
import { linkifyMessage } from "@/lib/chat-format";
type AdminSection =
  | "dashboard"
  | "products"
  | "orders"
  | "messages"
  | "reviews"
  | "visitors"
  | "users"
  | "customers"
  | "marketing"
  | "storefront"
  | "hero"
  | "siteCopy"
  | "welcomeEmail"
  | "orderEmail"
  | "newUserModal"
  | "policies"
  | "exports"
  | "security"
  | "settings";

const SECTION_LABELS: Record<AdminSection, string> = {
  dashboard: "Dashboard",
  products: "Products",
  orders: "Orders",
  messages: "Messages",
  reviews: "Reviews",
  visitors: "Visitors",
  users: "Users",
  customers: "Customers",
  marketing: "Marketing",
  storefront: "Storefront",
  hero: "Hero slider",
  siteCopy: "Site copy",
  welcomeEmail: "Welcome email",
  orderEmail: "Order email",
  newUserModal: "New-user modal",
  policies: "Policies",
  exports: "Exports",
  security: "Security",
  settings: "Settings",
};

const MIN_PASSWORD_LENGTH = 8;

function GoldenCMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className="shrink-0"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="gold-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e8d48b" />
          <stop offset="50%" stopColor="#c4a86a" />
          <stop offset="100%" stopColor="#a08542" />
        </linearGradient>
      </defs>
      <text
        x="20"
        y="31"
        textAnchor="middle"
        fontFamily="'EB Garamond', Georgia, 'Playfair Display', serif"
        fontSize="34"
        fontStyle="italic"
        fontWeight={600}
        fill="url(#gold-grad)"
      >
        C
      </text>
    </svg>
  );
}

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
  const { initPassword, login } = useAdminAuth();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isInitMode = initialized === false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

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
        await initPassword(password);
        toast.success("Admin password set");
      } else {
        await login(password);
        toast.success("Welcome back");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Authentication failed",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-card/40 border border-border/60 rounded-xl p-8 space-y-6">
        <div className="space-y-2 text-center">
          <div className="flex items-center justify-center gap-2">
            <GoldenCMark size={36} />
            <h1 className="font-logo text-2xl">Canvas Hub</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {isInitMode
              ? "First time setup — choose a password to protect this admin."
              : initialized === null
                ? "Could not reach the auth service. Check your connection."
                : "Enter the admin password to manage your collection."}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
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
          <Button
            type="submit"
            className="w-full"
            disabled={submitting || initialized === null}
          >
            {submitting
              ? "Working..."
              : isInitMode
                ? "Set password"
                : "Sign in"}
          </Button>
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
        key: "orders",
        icon: <Package className="w-4 h-4" />,
        hint: "Track & update",
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
        key: "newUserModal",
        icon: <Users className="w-4 h-4" />,
        hint: "First-visit popup",
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

function SidebarNav({
  section,
  navigate,
  collapsed,
}: {
  section: AdminSection;
  navigate: (s: AdminSection) => void;
  collapsed?: boolean;
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
  const [section, setSection] = useState<AdminSection>("dashboard");
  const [navOpen, setNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const navigate = (next: AdminSection) => {
    setSection(next);
    setNavOpen(false);
  };

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
      {/* Desktop persistent sidebar */}
      <aside
        className={`hidden lg:flex flex-col border-r border-border/40 bg-card/30 backdrop-blur-sm sticky top-0 h-screen transition-all duration-300 ${
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
              className="lg:hidden"
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
              className="text-xs lg:hidden"
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
              <SidebarNav section={section} navigate={navigate} />
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
            <DashboardSection onOpenOrders={() => navigate("orders")} />
          )}
          {section === "products" && <ProductsSection />}
          {section === "orders" && <OrdersSection />}
          {section === "messages" && <MessagesSection />}
          {section === "reviews" && <ReviewsSection />}
          {section === "visitors" && <VisitorsSection />}
          {section === "users" && <UsersSection />}
          {section === "customers" && <CustomersSection />}
          {section === "marketing" && <MarketingSection />}
          {section === "storefront" && <StorefrontSection />}
          {section === "hero" && <HeroSlidesSection />}
          {section === "siteCopy" && <SiteCopySection />}
          {section === "welcomeEmail" && <WelcomeEmailSection />}
          {section === "orderEmail" && <OrderEmailSection />}
          {section === "newUserModal" && <NewUserModalSection />}
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
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  hint?: string;
  collapsed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? `${label}${hint ? ` — ${hint}` : ""}` : undefined}
      className={`flex items-center gap-3 rounded-lg text-left transition-all duration-150 ${
        collapsed ? "px-0 py-2 justify-center" : "px-3 py-2"
      } ${
        active
          ? "bg-primary/10 text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-card/60"
      }`}
    >
      <span
        className={`flex-shrink-0 transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}
      >
        {icon}
      </span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      {hint && (
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      )}
    </button>
  );
}

function ProductsSection() {
  const { products, addProduct, updateProduct, deleteProduct } = useProducts();
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
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Product | null>(null);

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

    setSubmitting(true);

    const salePriceNum = Number(salePrice);
    const effectiveSalePrice =
      salePriceNum > 0 && salePriceNum < priceNum ? salePriceNum : undefined;

    try {
      await addProduct({
        ...buildImageFields(images),
        title: title.trim(),
        medium: medium.trim() || "Mixed Media",
        year: year.trim() || String(new Date().getFullYear()),
        price: priceNum,
        salePrice: effectiveSalePrice,
        description: description.trim(),
        category: category.trim() || undefined,
        dimensions: dimensions.trim() || undefined,
        availability,
      });
      toast.success(`"${title.trim()}" added to the collection`);
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

  return (
    <>
      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-8">
        <section className="bg-card/40 border border-border/60 rounded-xl p-6 h-fit lg:sticky lg:top-24">
          <div className="flex items-center gap-2 mb-6">
            <Plus className="w-5 h-5 text-primary" />
            <h2 className="font-display text-lg">Upload a painting</h2>
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
            <h2 className="font-display text-lg">
              Your uploads ({filteredProducts.length})
            </h2>
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

                return (
                  <li
                    key={product.id}
                    className="flex gap-4 bg-card/40 border border-border/50 rounded-lg p-3"
                  >
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

function DashboardSection({ onOpenOrders }: { onOpenOrders: () => void }) {
  const [summary, setSummary] = useState<OrdersSummary | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsDays, setAnalyticsDays] = useState<number>(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityEntry[]>([]);

  const refresh = async (days: number = analyticsDays) => {
    setLoading(true);
    setError(null);
    try {
      const token = getAdminToken();
      const [summaryRes, analyticsRes] = await Promise.all([
        fetch("/api/orders?metrics=summary", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/orders?metrics=analytics&days=${days}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (!summaryRes.ok) throw new Error(`HTTP ${summaryRes.status}`);
      const summaryData = await summaryRes.json();
      setSummary(summaryData.summary as OrdersSummary);
      setRecentActivity((summaryData.recentActivity as ActivityEntry[]) || []);
      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json();
        setAnalytics(analyticsData.analytics as AnalyticsData);
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
    shipment: { courier: string; trackingNumber: string; trackingUrl?: string },
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
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
        <Button variant="ghost" size="sm" onClick={() => void fetchOrders()}>
          <RefreshCw
            className={`w-3.5 h-3.5 mr-1 ${loadingOrders ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

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
                  {item.title} × {item.quantity} — ₱
                  {(item.price * item.quantity).toLocaleString()}
                </p>
              ))}
            </div>

            {/* Delivery info */}
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>
                Ship to: {order.orderInfo?.address ?? "—"},{" "}
                {order.orderInfo?.city ?? "—"} · Phone:{" "}
                {order.orderInfo?.phone ?? "—"}
              </p>
              {order.orderInfo?.notes && (
                <p>
                  <span className="text-foreground/70">Customer notes:</span>{" "}
                  {order.orderInfo.notes}
                </p>
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

  useEffect(() => {
    setCourier(existing?.courier ?? "");
    setTrackingNumber(existing?.trackingNumber ?? "");
    setTrackingUrl(existing?.trackingUrl ?? "");
  }, [existing?.courier, existing?.trackingNumber, existing?.trackingUrl]);

  const previewUrl = buildTrackingUrl(courier, trackingNumber, trackingUrl);
  const dirty =
    (existing?.courier ?? "") !== courier ||
    (existing?.trackingNumber ?? "") !== trackingNumber ||
    (existing?.trackingUrl ?? "") !== trackingUrl;
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
    </div>
  );
}

interface AuditEvent {
  at: string;
  type: string;
  outcome: string;
  ip?: string;
  browser?: string;
  os?: string;
  device?: string;
  userAgent?: string;
  subject?: string;
  detail?: string;
}

function SecuritySection() {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>("");

  const refresh = async () => {
    setLoading(true);
    try {
      const token = getAdminToken();
      const res = await fetch("/api/admin-auth?action=audit&limit=300", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEvents(Array.isArray(data.events) ? data.events : []);
    } catch (err) {
      console.error(err);
      toast.error("Could not load audit log");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const filtered = (events ?? []).filter((e) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      e.type.toLowerCase().includes(q) ||
      e.outcome.toLowerCase().includes(q) ||
      (e.ip || "").toLowerCase().includes(q) ||
      (e.subject || "").toLowerCase().includes(q) ||
      (e.detail || "").toLowerCase().includes(q) ||
      (e.browser || "").toLowerCase().includes(q) ||
      (e.os || "").toLowerCase().includes(q)
    );
  });

  const failedLogins = (events ?? []).filter(
    (e) =>
      (e.type === "admin.login" || e.type === "user.login") &&
      e.outcome === "failure",
  );

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl">Security</h1>
          <p className="text-xs text-muted-foreground">
            Authentication events, order activity, refunds. IP + device captured
            on every sensitive action.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Filter (type / IP / email / browser…)"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-72"
          />
          <Button onClick={refresh} variant="outline" disabled={loading}>
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Recorded events" value={events?.length ?? 0} />
        <SummaryCard
          label="Failed logins (recent)"
          value={failedLogins.length}
        />
        <SummaryCard
          label="Unique IPs"
          value={
            new Set(
              (events ?? [])
                .map((e) => e.ip)
                .filter((ip): ip is string => Boolean(ip)),
            ).size
          }
        />
      </div>

      <section className="rounded-lg border border-border/60 bg-card overflow-hidden">
        <div className="p-3 border-b border-border/60 bg-muted/20 text-xs uppercase tracking-wider text-muted-foreground">
          Audit log ({filtered.length})
        </div>
        {events === null ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            {events.length === 0
              ? "No audit events yet."
              : "No events match the filter."}
          </div>
        ) : (
          <ul className="divide-y divide-border/40 text-xs">
            {filtered.map((e, idx) => (
              <li key={`${e.at}-${idx}`} className="p-3 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-foreground">{e.type}</span>
                  <span
                    className={
                      e.outcome === "failure"
                        ? "text-rose-500"
                        : e.outcome === "success"
                          ? "text-emerald-500"
                          : "text-muted-foreground"
                    }
                  >
                    {e.outcome}
                  </span>
                  <span className="text-muted-foreground ml-auto">
                    {new Date(e.at).toLocaleString()}
                  </span>
                </div>
                {(e.subject || e.detail) && (
                  <p className="text-muted-foreground">
                    {e.subject && (
                      <span className="text-foreground/80">{e.subject}</span>
                    )}
                    {e.subject && e.detail && " — "}
                    {e.detail}
                  </p>
                )}
                <p className="text-muted-foreground">
                  {e.ip && <span className="font-mono">{e.ip}</span>}
                  {e.ip && (e.browser || e.os) && " · "}
                  {e.browser && e.os && (
                    <span>
                      {e.browser} on {e.os} ({e.device || "device"})
                    </span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="text-2xl font-semibold mt-1">{value.toLocaleString()}</p>
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

function MessagesSection() {
  const [threads, setThreads] = useState<ChatThreadIndexEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<ChatThreadDetail | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

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
    </div>
  );
}

export default AdminPage;
