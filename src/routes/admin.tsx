import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
  useProducts,
  getDiscountPercent,
  type Product,
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
import { VisitorsSection } from "@/components/admin/VisitorsSection";
import { UsersSection } from "@/components/admin/UsersSection";
import {
  ArrowLeft,
  Activity,
  Bell,
  KeyRound,
  Loader2,
  LogOut,
  Menu,
  Package,
  Pencil,
  Plus,
  QrCode,
  Settings,
  Star,
  Trash2,
  Upload,
  Users,
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

type AdminSection = "products" | "orders" | "visitors" | "users" | "settings";

const SECTION_LABELS: Record<AdminSection, string> = {
  products: "Products",
  orders: "Orders",
  visitors: "Visitors",
  users: "Users",
  settings: "Settings",
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mockupInputRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string>("");
  const [mockup, setMockup] = useState<string>("");
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

  const readImage = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (value: string) => void,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/"))
      return toast.error("Please select an image file");
    if (file.size > 5 * 1024 * 1024)
      return toast.error("Image must be under 5MB");

    try {
      setter(await fileToDataUrl(file));
    } catch {
      toast.error("Could not read image");
    }
  };

  const reset = () => {
    setImage("");
    setMockup("");
    setTitle("");
    setMedium("Acrylic on Canvas");
    setYear(String(new Date().getFullYear()));
    setPrice("");
    setSalePrice("");
    setDiscountPercent("");
    setDescription("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (mockupInputRef.current) mockupInputRef.current.value = "";
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
    if (!image) return toast.error("Please upload a painting image");
    if (!title.trim()) return toast.error("Title is required");
    const priceNum = Number(price);
    if (!priceNum || priceNum <= 0) return toast.error("Enter a valid price");

    setSubmitting(true);

    const salePriceNum = Number(salePrice);
    const effectiveSalePrice =
      salePriceNum > 0 && salePriceNum < priceNum ? salePriceNum : undefined;

    try {
      await addProduct({
        image,
        mockup: mockup || undefined,
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
              <Label htmlFor="image" className="mb-2 block">
                Painting image
              </Label>
              <label className="flex flex-col items-center justify-center w-full aspect-[4/3] border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/60 transition-colors overflow-hidden bg-background/40">
                {image ? (
                  <img
                    src={image}
                    alt="preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center text-muted-foreground p-6">
                    <Upload className="w-7 h-7 mx-auto mb-2" />
                    <p className="text-sm">Click to upload (max 5MB)</p>
                  </div>
                )}
                <input
                  id="image"
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void readImage(e, setImage)}
                />
              </label>
            </div>

            <div>
              <Label htmlFor="mockup" className="mb-2 block">
                Room mockup{" "}
                <span className="text-muted-foreground font-normal">
                  (optional, shown on hover)
                </span>
              </Label>
              <label className="flex flex-col items-center justify-center w-full aspect-[4/3] border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/60 transition-colors overflow-hidden bg-background/40">
                {mockup ? (
                  <img
                    src={mockup}
                    alt="mockup preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center text-muted-foreground p-6">
                    <Upload className="w-7 h-7 mx-auto mb-2" />
                    <p className="text-sm">Upload a room preview</p>
                  </div>
                )}
                <input
                  id="mockup"
                  ref={mockupInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void readImage(e, setMockup)}
                />
              </label>
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

                return (
                  <li
                    key={product.id}
                    className="flex gap-4 bg-card/40 border border-border/50 rounded-lg p-3"
                  >
                    <img
                      src={product.image}
                      alt={product.title}
                      className="w-24 h-24 object-cover rounded-md flex-shrink-0"
                    />
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

function OrdersSection() {
  const [orders, setOrders] = useState<CompletedOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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
      if (!res.ok) throw new Error();
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status } : o)),
      );
      toast.success("Status updated");
    } catch {
      toast.error("Could not update status");
    } finally {
      setUpdatingId(null);
    }
  };

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
          </div>
        );
      })}
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
