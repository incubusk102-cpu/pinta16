import { useEffect, useRef, useState } from "react";
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
import { Toaster } from "@/components/ui/sonner";
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
import ExportPanel from "@/admin/ExportPanel";
import {
  ArrowLeft,
  Activity,
  Bell,
  CheckCircle2,
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
  Images,
  Star,
  Trash2,
  TrendingUp,
  Truck,
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
  policies: "Policies",
  exports: "Exports",
  security: "Security",
  settings: "Settings",
};

const MIN_PASSWORD_LENGTH = 8;

function AdminPage() {
  const { token, initialized, loading } = useAdminAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Toaster richColors position="top-right" />
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
  const [confirmPassword, setConfirmPassword] = useState("");
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
      if (password !== confirmPassword) {
        return toast.error("Passwords do not match");
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
      <Toaster richColors position="top-right" />
      <div className="w-full max-w-md bg-card/40 border border-border/60 rounded-xl p-8 space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="font-display text-2xl">Admin · Canvas Hub</h1>
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
          {isInitMode && (
            <div>
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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

function AdminDashboard() {
  const { logout } = useAdminAuth();
  const { products } = useProducts();
  const [section, setSection] = useState<AdminSection>("products");
  const [navOpen, setNavOpen] = useState(false);

  const navigate = (next: AdminSection) => {
    setSection(next);
    setNavOpen(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-right" />
      <header className="border-b border-border/50 bg-card/30 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </Button>
          <h1 className="font-display text-lg sm:text-xl flex-1 truncate">
            Admin · {SECTION_LABELS[section]}
          </h1>
          {section === "products" && (
            <span className="hidden sm:inline text-xs text-muted-foreground">
              {products.length} uploaded
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="text-xs"
          >
            <LogOut className="w-3 h-3 mr-1" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="w-72">
          <SheetHeader>
            <SheetTitle className="font-display">Admin · Canvas Hub</SheetTitle>
          </SheetHeader>
          <nav className="mt-6 flex flex-col gap-1">
            <NavLink
              icon={<LayoutDashboard className="w-4 h-4" />}
              label="Dashboard"
              active={section === "dashboard"}
              onClick={() => navigate("dashboard")}
              hint="Revenue, ship-out, complete"
            />
            <NavLink
              icon={<Upload className="w-4 h-4" />}
              label="Products"
              active={section === "products"}
              onClick={() => navigate("products")}
              hint={`${products.length} uploaded`}
            />
            <NavLink
              icon={<Package className="w-4 h-4" />}
              label="Orders"
              active={section === "orders"}
              onClick={() => navigate("orders")}
              hint="Track & update"
            />
            <NavLink
              icon={<MessageSquare className="w-4 h-4" />}
              label="Messages"
              active={section === "messages"}
              onClick={() => navigate("messages")}
              hint="Customer chat threads"
            />
            <NavLink
              icon={<Star className="w-4 h-4" />}
              label="Reviews"
              active={section === "reviews"}
              onClick={() => navigate("reviews")}
              hint="Edit, delete, publish customer reviews"
            />
            <NavLink
              icon={<Activity className="w-4 h-4" />}
              label="Visitors"
              active={section === "visitors"}
              onClick={() => navigate("visitors")}
              hint="Live + 24h chart"
            />
            <NavLink
              icon={<Users className="w-4 h-4" />}
              label="Users"
              active={section === "users"}
              onClick={() => navigate("users")}
              hint="Sign-ups + 30-day cleanup"
            />
            <NavLink
              icon={<Wallet className="w-4 h-4" />}
              label="Customers"
              active={section === "customers"}
              onClick={() => navigate("customers")}
              hint="LTV, segments, notes & tags"
            />
            <NavLink
              icon={<TrendingUp className="w-4 h-4" />}
              label="Marketing"
              active={section === "marketing"}
              onClick={() => navigate("marketing")}
              hint="Promo code performance"
            />
            <NavLink
              icon={<Activity className="w-4 h-4" />}
              label="Storefront"
              active={section === "storefront"}
              onClick={() => navigate("storefront")}
              hint="Announcement, shipping, promo codes"
            />
            <NavLink
              icon={<Images className="w-4 h-4" />}
              label="Hero slider"
              active={section === "hero"}
              onClick={() => navigate("hero")}
              hint="Upload + manage homepage slides"
            />
            <NavLink
              icon={<FileText className="w-4 h-4" />}
              label="Policies"
              active={section === "policies"}
              onClick={() => navigate("policies")}
              hint="Terms, refund, shipping, privacy"
            />
            <NavLink
              icon={<Download className="w-4 h-4" />}
              label="Exports"
              active={section === "exports"}
              onClick={() => navigate("exports")}
              hint="Download orders / customers / newsletter"
            />
            <NavLink
              icon={<Shield className="w-4 h-4" />}
              label="Security"
              active={section === "security"}
              onClick={() => navigate("security")}
              hint="Login + activity audit log"
            />
            <NavLink
              icon={<Settings className="w-4 h-4" />}
              label="Settings"
              active={section === "settings"}
              onClick={() => navigate("settings")}
              hint="Change password"
            />
          </nav>
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

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
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
        {section === "policies" && <PoliciesSection />}
        {section === "exports" && <ExportsSection />}
        {section === "security" && <SecuritySection />}
        {section === "settings" && <SettingsSection />}
      </main>
    </div>
  );
}

function NavLink({
  icon,
  label,
  active,
  onClick,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
        active
          ? "bg-primary/10 text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-card/60"
      }`}
    >
      <span
        className={`flex-shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`}
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

function DashboardSection({ onOpenOrders }: { onOpenOrders: () => void }) {
  const [summary, setSummary] = useState<OrdersSummary | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsDays, setAnalyticsDays] = useState<number>(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          </div>
        </>
      )}

      <AnalyticsPanel
        analytics={analytics}
        days={analyticsDays}
        onChangeDays={setAnalyticsDays}
        loading={loading}
      />
    </div>
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
                    {p.image ? (
                      <img
                        src={p.image}
                        alt=""
                        className="w-9 h-9 object-cover rounded-sm border border-border/40"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-sm bg-muted" />
                    )}
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

function OrdersSection() {
  const [orders, setOrders] = useState<CompletedOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [resendingKey, setResendingKey] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<{
    configured: boolean;
    provider: string | null;
    from: string | null;
    replyTo: string | null;
  } | null>(null);
  const [confirmRefundFor, setConfirmRefundFor] =
    useState<CompletedOrder | null>(null);

  const fetchOrders = async () => {
    try {
      const token = getAdminToken();
      const res = await fetch("/api/orders", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setOrders(data.orders || []);
    } catch {
      toast.error("Could not load orders");
    } finally {
      setLoadingOrders(false);
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
      toast.success("Status updated");
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
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl">Orders ({orders.length})</h2>
        <Button variant="ghost" size="sm" onClick={() => void fetchOrders()}>
          Refresh
        </Button>
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
              <code className="font-mono">EMAIL_FROM</code> in Netlify env to
              start sending. Notification history is still recorded.
            </>
          )}
        </div>
      )}

      {orders.map((order) => {
        const currentStepIdx = ORDER_STEPS.findIndex(
          (s) => s.key === order.status,
        );
        return (
          <div
            key={order.id}
            className="border border-border/40 rounded-lg p-5 space-y-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-body text-sm font-semibold">{order.id}</p>
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
          </div>
        );
      })}

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
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
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
    if (newPassword !== confirmNewPassword) {
      return toast.error("New passwords do not match");
    }

    setChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      toast.success("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
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
          <div>
            <Label htmlFor="confirmNewPassword">Confirm new password</Label>
            <Input
              id="confirmNewPassword"
              type="password"
              autoComplete="new-password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
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
