import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useUserAuth } from "@/contexts/UserAuthContext";
import {
  useCart,
  ORDER_STEPS,
  type CompletedOrder,
} from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import {
  ArrowLeft,
  LogOut,
  Mail,
  Package,
  Search,
  UserCircle,
} from "lucide-react";

export const Route = createFileRoute("/account")({
  component: AccountPage,
  head: () => ({
    meta: [
      { title: "My account — Pintaterra" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const formatDate = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
};

function OrderTracker() {
  const [orderId, setOrderId] = useState("");
  const [order, setOrder] = useState<CompletedOrder | null>(null);
  const [searching, setSearching] = useState(false);
  const { orders: localOrders } = useCart();

  const lookup = async () => {
    const id = orderId.trim().toUpperCase();
    if (!id) return;
    setSearching(true);

    const local = localOrders.find((o) => o.id === id);
    if (local) {
      setOrder(local);
      setSearching(false);
      return;
    }

    try {
      const res = await fetch(`/api/orders?id=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setOrder(data.order);
    } catch {
      toast.error("Order not found");
      setOrder(null);
    } finally {
      setSearching(false);
    }
  };

  const currentStepIdx = order
    ? ORDER_STEPS.findIndex((s) => s.key === order.status)
    : -1;

  return (
    <div className="bg-card/40 border border-border/60 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
        <Package className="w-4 h-4" /> Track Order
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Enter Order ID (e.g. ORD-...)"
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void lookup()}
          className="text-sm"
        />
        <Button size="sm" onClick={() => void lookup()} disabled={searching}>
          <Search className="w-4 h-4" />
        </Button>
      </div>

      {order && (
        <div className="space-y-3 pt-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium">{order.id}</span>
            <span className="font-semibold">
              ₱{order.total.toLocaleString()}
            </span>
          </div>
          <div className="text-xs text-muted-foreground space-y-0.5">
            {order.items.map((item) => (
              <p key={item.id}>
                {item.title} × {item.quantity}
              </p>
            ))}
          </div>

          {/* Journey Map */}
          <div className="space-y-0 pt-2">
            {ORDER_STEPS.map((step, idx) => {
              const done = idx <= currentStepIdx;
              const active = idx === currentStepIdx;
              return (
                <div key={step.key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-3 h-3 rounded-full border-2 shrink-0 ${
                        done
                          ? "bg-foreground border-foreground"
                          : "border-border bg-transparent"
                      } ${active ? "ring-2 ring-foreground/20" : ""}`}
                    />
                    {idx < ORDER_STEPS.length - 1 && (
                      <div
                        className={`w-0.5 h-6 ${done ? "bg-foreground" : "bg-border"}`}
                      />
                    )}
                  </div>
                  <div className="-mt-0.5 pb-3">
                    <p
                      className={`text-xs font-medium ${done ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      {step.label}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {step.description}
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

function AccountPage() {
  const { user, token, logout } = useUserAuth();
  const navigate = useNavigate();
  const loggingOutRef = useRef(false);

  useEffect(() => {
    if (loggingOutRef.current) return;
    if (token) return;
    const storedToken =
      typeof window !== "undefined"
        ? localStorage.getItem("pintaterra_user_token")
        : null;
    if (!storedToken) {
      void navigate({ to: "/login" });
    }
  }, [token, navigate]);

  if (!user || !token) return null;

  const handleLogout = () => {
    loggingOutRef.current = true;
    logout();
    toast.success("Signed out");
    void navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-right" />
      <header className="border-b border-border/50 bg-card/30 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to site
          </Link>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="w-3 h-3 mr-1" />
            Sign out
          </Button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-8">
        <div>
          <h1 className="font-display text-3xl">My account</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome back{user.name ? `, ${user.name}` : ""}.
          </p>
        </div>

        <OrderTracker />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="bg-card/40 border border-border/60 rounded-xl p-5">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
              <UserCircle className="w-4 h-4" /> Profile
            </div>
            <div className="mt-3 space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">Name:</span>{" "}
                {user.name || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Email:</span>{" "}
                {user.email}
              </p>
              <p className="text-xs text-muted-foreground mt-3">
                Joined {formatDate(user.createdAt)}
              </p>
              <p className="text-xs text-muted-foreground">
                Last seen {formatDate(user.lastSeenAt)}
              </p>
            </div>
          </div>
          <div className="bg-card/40 border border-border/60 rounded-xl p-5">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
              <Mail className="w-4 h-4" /> Inactivity
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Pintaterra removes accounts that have been inactive for{" "}
              <strong className="text-foreground">30 days</strong> and emails
              you when this happens. Just sign in any time to keep yours active.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
