import {
  createFileRoute,
  Link,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { useUserAuth } from "@/contexts/UserAuthContext";
import {
  useCart,
  ORDER_STEPS,
  type CompletedOrder,
} from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import GalleryNav from "@/components/GalleryNav";
import {
  Bell,
  Heart,
  Mail,
  Package,
  Search,
  Star,
  Trash2,
  Truck,
  UserCircle,
} from "lucide-react";
import { useWishlist } from "@/contexts/WishlistContext";
import { buildTrackingUrl } from "@/lib/shipment";
import OrderReviewForm from "@/components/OrderReviewForm";
import RefundBanner from "@/components/RefundBanner";
import ReturnRequestPanel from "@/components/ReturnRequestPanel";
import ProfileEditor from "@/components/account/ProfileEditor";
import AddressBook from "@/components/account/AddressBook";
import MyOrders from "@/components/account/MyOrders";
import AppreciationSection from "@/components/account/AppreciationSection";
const OrderPushOptInPrompt = lazy(
  () => import("@/components/OrderPushOptInPrompt"),
);

export const Route = createFileRoute("/account")({
  component: AccountPage,
  head: () => ({
    meta: [
      { title: "My account — Canvas Hub" },
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
  const { orders: localOrders, getOrderReviews } = useCart();

  // Auto-lookup when the page is opened with `?track=ORD-XYZ`. The
  // confirmation overlay deep-links here so a guest can go from
  // "Order Confirmed!" → fully populated tracker in one tap, no manual
  // ID retyping. Reads from the live URL (not router search — the route
  // doesn't define validateSearch) so the param is decoupled from the
  // route's typed schema.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const trackId = params.get("track");
    if (!trackId) return;
    setOrderId(trackId);
    void (async () => {
      const id = trackId.trim().toUpperCase();
      if (!id) return;
      setSearching(true);
      try {
        const res = await fetch(`/api/orders?id=${encodeURIComponent(id)}`);
        if (res.ok) {
          const data = await res.json();
          setOrder(data.order);
          return;
        }
      } catch {
        /* fall through to local */
      } finally {
        setSearching(false);
      }
      const local = localOrders.find((o) => o.id === id);
      if (local) setOrder(local);
    })();
    // localOrders is intentionally excluded — we only want the
    // auto-lookup to run once on mount, not whenever the cart context
    // re-renders the orders array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lookup = async () => {
    const id = orderId.trim().toUpperCase();
    if (!id) return;
    setSearching(true);

    try {
      const res = await fetch(`/api/orders?id=${encodeURIComponent(id)}`);
      if (res.ok) {
        const data = await res.json();
        setOrder(data.order);
        setSearching(false);
        return;
      }
    } catch {
      /* server unreachable — fall through to local */
    }

    const local = localOrders.find((o) => o.id === id);
    if (local) {
      setOrder(local);
    } else {
      toast.error("Order not found");
      setOrder(null);
    }
    setSearching(false);
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

          {/* Shipment tracking */}
          {order.shipment && (
            <div className="pt-2 border-t border-border/10">
              <div className="flex items-center gap-2 mb-2">
                <Truck className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  In transit
                </span>
              </div>
              <p className="text-sm text-foreground break-words">
                {order.shipment.courier} ·{" "}
                <span className="font-mono text-xs break-all">
                  {order.shipment.trackingNumber}
                </span>
              </p>
              {(() => {
                const url = buildTrackingUrl(
                  order.shipment.courier,
                  order.shipment.trackingNumber,
                  order.shipment.trackingUrl,
                );
                return url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-foreground underline mt-1"
                  >
                    Track shipment ↗
                  </a>
                ) : null;
              })()}
            </div>
          )}

          {/* Notifications log */}
          {order.notifications && order.notifications.length > 0 && (
            <div className="pt-2 border-t border-border/10">
              <div className="flex items-center gap-2 mb-2">
                <Bell className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Notifications
                </p>
              </div>
              <ul className="space-y-1.5">
                {order.notifications.map((n, idx) => (
                  <li key={`${n.sentAt}-${idx}`} className="text-xs">
                    <p className="text-foreground">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(n.sentAt).toLocaleString()} · to {n.recipient}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Refund banner */}
          {order.refund && (
            <RefundBanner
              orderId={order.id}
              status={order.refund.status}
              amount={order.refund.amount}
              requestedAt={order.refund.requestedAt}
              completedAt={order.refund.completedAt}
              failureMessage={order.refund.failureMessage}
              onRefreshed={(updated) => setOrder(updated)}
            />
          )}

          {/* Returns / RMA — file a return on a received order, or show
              the status of an in-flight return request. */}
          <ReturnRequestPanel
            order={order}
            onUpdated={(updated) => setOrder(updated)}
          />

          {/* Review form / submitted reviews */}
          {(() => {
            const reviews = getOrderReviews(order);
            const showForm = order.status === "received" && !order.refund;
            return (
              <>
                {showForm && (
                  <OrderReviewForm
                    orderId={order.id}
                    customerEmail={order.orderInfo?.email}
                    items={order.items}
                    existingReviews={reviews}
                    onSubmitted={(review) => {
                      const idx = reviews.findIndex(
                        (r) => (r.productId ?? "") === (review.productId ?? ""),
                      );
                      const next = [...reviews];
                      if (idx >= 0) next[idx] = review;
                      else next.push(review);
                      setOrder({ ...order, reviews: next, review });
                    }}
                  />
                )}
                {reviews.map((rev, idx) => (
                  <div
                    key={`${rev.productId ?? "order"}-${idx}`}
                    className="pt-2 border-t border-border/10 space-y-2"
                  >
                    <div className="flex items-center gap-2 justify-between">
                      <div className="flex items-center gap-2">
                        <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Your review
                          {rev.productTitle ? ` · ${rev.productTitle}` : ""}
                        </p>
                      </div>
                      {rev.publishedToHomepage && (
                        <span className="px-1.5 py-0.5 bg-foreground/10 text-foreground text-[10px] tracking-[0.2em] uppercase rounded-sm">
                          Featured
                        </span>
                      )}
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
                    </div>
                    <p className="text-xs text-foreground whitespace-pre-wrap">
                      {rev.text}
                    </p>
                    {rev.images.length > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        {rev.images.map((src, i) => (
                          <img
                            key={i}
                            src={src}
                            alt={`Review image ${i + 1}`}
                            className="aspect-square w-full object-cover rounded-sm border border-border/10"
                            loading="lazy"
                            decoding="async"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function WishlistSection() {
  const { items, remove } = useWishlist();
  return (
    <div className="bg-card/40 border border-border/60 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
          <Heart className="w-4 h-4" /> My wishlist
        </div>
        <span className="text-xs text-muted-foreground">
          {items.length} saved
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Tap the heart on any painting to save it for later.
        </p>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-3">
          {items.map((entry) => (
            <li
              key={entry.id}
              className="flex gap-3 p-3 border border-border/40 rounded-md bg-background/40"
            >
              {entry.image && (
                <Link
                  to="/product/$id"
                  params={{ id: entry.id }}
                  className="shrink-0"
                >
                  <img
                    src={entry.image}
                    alt={entry.title || entry.id}
                    className="w-16 h-16 object-cover rounded-sm"
                    loading="lazy"
                    decoding="async"
                  />
                </Link>
              )}
              <div className="flex-1 min-w-0 flex flex-col">
                <Link
                  to="/product/$id"
                  params={{ id: entry.id }}
                  className="text-sm font-medium text-foreground truncate hover:underline"
                >
                  {entry.title || entry.id}
                </Link>
                {entry.price !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    ₱{entry.price.toLocaleString()}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground mt-auto">
                  Saved {formatDate(entry.addedAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  remove(entry.id);
                  toast.success("Removed from wishlist");
                }}
                aria-label={`Remove ${entry.title || entry.id} from wishlist`}
                className="self-start p-1.5 text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AccountPage() {
  const { user, token } = useUserAuth();
  const navigate = useNavigate();
  const hash = useRouterState({ select: (s) => s.location.hash });
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (token) return;
    // Visitors hitting /account without a session get bounced to the
    // homepage. The hamburger drawer surfaces the inline "Continue
    // with Google" button there — no dedicated /login page.
    if (pathname !== "/account") return;
    const storedToken =
      typeof window !== "undefined"
        ? localStorage.getItem("canvhub_user_token")
        : null;
    if (!storedToken) {
      void navigate({ to: "/" });
    }
  }, [token, navigate, pathname]);

  // Scroll to anchored section when arriving via /account#account-...
  useEffect(() => {
    if (!hash) return;
    const id = hash.replace(/^#/, "");
    if (!id) return;
    const el = document.getElementById(id);
    if (el) {
      window.requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [hash]);

  if (!user || !token) return null;

  return (
    <div className="min-h-screen bg-background">
      <GalleryNav />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-28 md:pt-32 pb-16 space-y-8 scroll-pt-28">
        <div>
          <h1 className="font-display text-3xl">My account</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome back{user.name ? `, ${user.name}` : ""}.
          </p>
        </div>

        <div id="account-profile" className="scroll-mt-28">
          <ProfileEditor />
        </div>

        <AppreciationSection />

        <div id="account-orders" className="scroll-mt-28">
          <MyOrders />
        </div>

        <div id="account-tracker" className="scroll-mt-28">
          <OrderTracker />
        </div>

        <div id="account-addresses" className="scroll-mt-28">
          <AddressBook />
        </div>

        <div id="account-wishlist" className="scroll-mt-28">
          <WishlistSection />
        </div>

        {/* Free Web Push opt-in / management. The customer's email is
            already on hand from their authenticated session, so we can
            wire the subscription on the spot without re-asking for
            anything. forceShow=true so the card is always visible from
            here even if the customer dismissed the order-confirmation
            variant. */}
        <div id="account-notifications" className="scroll-mt-28">
          <Suspense>
            <OrderPushOptInPrompt
              email={user.email}
              variant="inline"
              forceShow
            />
          </Suspense>
        </div>

        <div className="bg-card/40 border border-border/60 rounded-xl p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
            <Mail className="w-4 h-4" /> Inactivity
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Accounts that have been inactive for{" "}
            <strong className="text-foreground">30 days</strong> are removed,
            and we email you when this happens. Just visit your account any time
            to keep it active.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Joined {formatDate(user.createdAt)} · Last seen{" "}
            {formatDate(user.lastSeenAt)}
          </p>
        </div>
      </main>
    </div>
  );
}
