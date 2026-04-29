import { useState } from "react";
import { Bell, Package, Search, Star, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useCart,
  ORDER_STEPS,
  type CompletedOrder,
} from "@/contexts/CartContext";
import { buildTrackingUrl } from "@/lib/shipment";
import OrderReviewForm from "@/components/OrderReviewForm";
import RefundBanner from "@/components/RefundBanner";

// Standalone tracker pulled out of /account so the hamburger drawer can
// render it in an inline sheet without navigating to /account. Same
// behaviour as before: accepts an Order ID, looks up via /api/orders
// with a localStorage fallback, renders step-by-step status, shipment
// tracking, notifications log, refund banner, and review form.
export default function OrderTracker() {
  const [orderId, setOrderId] = useState("");
  const [order, setOrder] = useState<CompletedOrder | null>(null);
  const [searching, setSearching] = useState(false);
  const { orders: localOrders, getOrderReviews } = useCart();

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
