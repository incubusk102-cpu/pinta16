import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
  useProducts,
  getDiscountPercent,
  getProductImages,
  buildImageFields,
  PRODUCT_MAX_IMAGES,
  type Product,
  type ProductImage,
} from "@/contexts/ProductContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { VisitorsSection } from "@/components/admin/VisitorsSection";
import { UsersSection } from "@/components/admin/UsersSection";
import {
  ArrowLeft,
  Activity,
  Bell,
  CheckCircle2,
  KeyRound,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Package,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Settings,
  Star,
  Trash2,
  TrendingUp,
  Truck,
  Undo2,
  Upload,
  Users,
  Wallet,
} from "lucide-react";
import { ORDER_STEPS, type CompletedOrder } from "@/contexts/CartContext";
import { getAdminToken } from "@/contexts/AdminAuthContext";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({
    meta: [
      { title: "Admin — Pintaterra" },
      {
        name: "description",
        content: "Upload and manage paintings in your gallery.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type AdminSection =
  | "dashboard"
  | "products"
  | "orders"
  | "visitors"
  | "users"
  | "settings";

const SECTION_LABELS: Record<AdminSection, string> = {
  dashboard: "Dashboard",
  products: "Products",
  orders: "Orders",
  visitors: "Visitors",
  users: "Users",
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
          <h1 className="font-display text-2xl">Admin · Pintaterra</h1>
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
            <SheetTitle className="font-display">Admin · Pintaterra</SheetTitle>
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
        {section === "visitors" && <VisitorsSection />}
        {section === "users" && <UsersSection />}
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
  const [price, setPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Product | null>(null);

  const reset = () => {
    setImages([]);
    setTitle("");
    setMedium("Acrylic on Canvas");
    setYear(String(new Date().getFullYear()));
    setPrice("");
    setSalePrice("");
    setDiscountPercent("");
    setDescription("");
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
          <h2 className="font-display text-lg mb-4">Your uploads</h2>
          {products.length === 0 ? (
            <div className="border border-dashed border-border rounded-xl p-10 text-center text-muted-foreground">
              No uploaded products yet. Add your first painting on the left.
            </div>
          ) : (
            <ul className="space-y-3">
              {products.map((product) => {
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
                          />
                          {photos.length > 1 && (
                            <span className="absolute bottom-1 right-1 px-1.5 py-0.5 text-[10px] font-medium bg-background/90 backdrop-blur rounded">
                              {photos.length} photos
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
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">{product.title}</h3>
                      <p className="text-xs text-muted-foreground">
                        {product.medium} · {product.year}
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

function DashboardSection({ onOpenOrders }: { onOpenOrders: () => void }) {
  const [summary, setSummary] = useState<OrdersSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAdminToken();
      const res = await fetch("/api/orders?metrics=summary", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSummary(data.summary as OrdersSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load metrics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

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

            {/* Notifications log */}
            {order.notifications && order.notifications.length > 0 && (
              <div className="text-xs space-y-1.5">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Bell className="w-3.5 h-3.5" />
                  <span className="text-[10px] uppercase tracking-wider">
                    Notifications sent
                  </span>
                </div>
                <ul className="space-y-1 pl-5 list-disc text-muted-foreground">
                  {order.notifications.map((n, idx) => (
                    <li key={`${n.sentAt}-${idx}`}>
                      <span className="text-foreground">{n.message}</span> — to{" "}
                      {n.recipient} on {new Date(n.sentAt).toLocaleString()}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Review */}
            {order.review && (
              <div className="text-xs space-y-2 p-3 bg-muted/30 border border-border/40 rounded-md">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                  <span className="text-[10px] uppercase tracking-wider">
                    Customer review
                  </span>
                  <span className="ml-auto text-[10px]">
                    {new Date(order.review.submittedAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      className={`w-3.5 h-3.5 ${
                        n <= order.review!.rating
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-muted-foreground"
                      }`}
                    />
                  ))}
                  <span className="ml-1 text-muted-foreground">
                    {order.review.rating}/5
                  </span>
                </div>
                <p className="text-foreground whitespace-pre-wrap">
                  {order.review.text}
                </p>
                {order.review.images.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {order.review.images.map((src, i) => (
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
                        />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

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
