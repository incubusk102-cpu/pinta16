import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle,
  X,
  Package,
  Clock,
  Truck,
  Info,
  Copy,
  Bell,
  Star,
} from "lucide-react";
import { useCart, ORDER_STEPS } from "@/contexts/CartContext";
import { toast } from "sonner";
import OrderReviewForm from "./OrderReviewForm";
import RefundBanner from "./RefundBanner";

const formatNotificationDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
};

const OrderConfirmation = () => {
  const { showConfirmation, setShowConfirmation, lastOrder, getOrderReviews } =
    useCart();
  const seenNotificationsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!lastOrder?.notifications?.length) return;
    for (const n of lastOrder.notifications) {
      const key = `${lastOrder.id}:${n.sentAt}`;
      if (seenNotificationsRef.current.has(key)) continue;
      seenNotificationsRef.current.add(key);
      toast.message(n.message, {
        description: `Notification sent to ${n.recipient}`,
      });
    }
  }, [lastOrder]);

  if (!lastOrder) return null;

  const currentStepIdx = ORDER_STEPS.findIndex(
    (s) => s.key === lastOrder.status,
  );

  const copyOrderId = () => {
    navigator.clipboard.writeText(lastOrder.id).then(() => {
      toast.success("Order ID copied");
    });
  };

  return (
    <AnimatePresence>
      {showConfirmation && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] bg-background/90 backdrop-blur-xl flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30 }}
            className="bg-card border border-border/20 rounded-sm max-w-lg w-full p-8 relative max-h-[90vh] overflow-y-auto"
          >
            <button
              onClick={() => setShowConfirmation(false)}
              className="absolute top-4 right-4 p-2 hover:bg-accent rounded-sm transition-colors"
            >
              <X className="w-5 h-5 text-foreground" />
            </button>

            <div className="text-center mb-8">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 200,
                  damping: 15,
                  delay: 0.2,
                }}
              >
                <CheckCircle className="w-16 h-16 mx-auto mb-4 text-success" />
              </motion.div>
              <h2 className="font-display text-2xl text-foreground mb-2">
                Order Confirmed!
              </h2>
              <p className="font-body text-sm text-muted-foreground">
                Thank you for your purchase
              </p>
              <button
                onClick={copyOrderId}
                className="inline-flex items-center gap-1.5 mt-1 font-body text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Order ID: {lastOrder.id}
                <Copy className="w-3 h-3" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Order Journey Map */}
              <div className="p-4 bg-muted/30 border border-border/10 rounded-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Truck className="w-4 h-4 text-muted-foreground" />
                  <p className="font-body text-xs tracking-wider uppercase text-muted-foreground">
                    Order Status
                  </p>
                </div>
                <div className="space-y-0">
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
                        <div className="-mt-0.5 pb-4">
                          <p
                            className={`font-body text-xs font-medium ${done ? "text-foreground" : "text-muted-foreground"}`}
                          >
                            {step.label}
                          </p>
                          <p className="font-body text-[10px] text-muted-foreground">
                            {step.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Items */}
              <div className="p-4 bg-muted/30 border border-border/10 rounded-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Package className="w-4 h-4 text-muted-foreground" />
                  <p className="font-body text-xs tracking-wider uppercase text-muted-foreground">
                    Items
                  </p>
                </div>
                {lastOrder.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between font-body text-xs text-foreground mb-1"
                  >
                    <span>
                      {item.title} × {item.quantity}
                    </span>
                    <span>
                      ₱{(item.price * item.quantity).toLocaleString()}
                    </span>
                  </div>
                ))}
                <div className="border-t border-border/10 mt-3 pt-3">
                  <div className="flex justify-between font-body text-sm text-foreground font-semibold">
                    <span>Total Paid</span>
                    <span>₱{lastOrder.total.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {lastOrder.estimatedCreationDays && (
                <div className="flex items-center gap-2 p-3 bg-muted/20 border border-border/10 rounded-sm">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <p className="font-body text-xs text-muted-foreground">
                    Estimated creation: {lastOrder.estimatedCreationDays}
                  </p>
                </div>
              )}

              {/* Notifications log */}
              {lastOrder.notifications &&
                lastOrder.notifications.length > 0 && (
                  <div className="p-4 bg-muted/30 border border-border/10 rounded-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <Bell className="w-4 h-4 text-muted-foreground" />
                      <p className="font-body text-xs tracking-wider uppercase text-muted-foreground">
                        Notifications
                      </p>
                    </div>
                    <ul className="space-y-2">
                      {lastOrder.notifications.map((n, idx) => (
                        <li
                          key={`${n.sentAt}-${idx}`}
                          className="font-body text-xs text-foreground"
                        >
                          <p>{n.message}</p>
                          <p className="text-[10px] text-muted-foreground">
                            Sent to {n.recipient} ·{" "}
                            {formatNotificationDate(n.sentAt)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              {/* Refund banner */}
              {lastOrder.refund && (
                <RefundBanner
                  orderId={lastOrder.id}
                  status={lastOrder.refund.status}
                  amount={lastOrder.refund.amount}
                  requestedAt={lastOrder.refund.requestedAt}
                  completedAt={lastOrder.refund.completedAt}
                  failureMessage={lastOrder.refund.failureMessage}
                />
              )}

              {/* Review form / submitted reviews */}
              {(() => {
                const reviews = getOrderReviews(lastOrder);
                const showForm =
                  lastOrder.status === "received" && !lastOrder.refund;
                return (
                  <>
                    {showForm && (
                      <OrderReviewForm
                        orderId={lastOrder.id}
                        customerEmail={lastOrder.orderInfo.email}
                        items={lastOrder.items}
                        existingReviews={reviews}
                      />
                    )}
                    {reviews.map((rev, idx) => (
                      <div
                        key={`${rev.productId ?? "order"}-${idx}`}
                        className="p-4 bg-muted/30 border border-border/10 rounded-sm space-y-2"
                      >
                        <div className="flex items-center gap-2 justify-between">
                          <div className="flex items-center gap-2">
                            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                            <p className="font-body text-xs tracking-wider uppercase text-muted-foreground">
                              Your review
                              {rev.productTitle ? ` · ${rev.productTitle}` : ""}
                            </p>
                          </div>
                          {rev.publishedToHomepage && (
                            <span className="px-2 py-0.5 bg-foreground/10 text-foreground font-body text-[10px] tracking-[0.2em] uppercase rounded-sm">
                              Featured
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star
                              key={n}
                              className={`w-4 h-4 ${
                                n <= rev.rating
                                  ? "fill-yellow-400 text-yellow-400"
                                  : "text-muted-foreground"
                              }`}
                            />
                          ))}
                        </div>
                        <p className="font-body text-xs text-foreground whitespace-pre-wrap">
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
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </>
                );
              })()}

              {/* Instructions */}
              <div className="p-4 bg-muted/20 border border-border/10 rounded-sm space-y-2">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-muted-foreground" />
                  <p className="font-body text-xs tracking-wider uppercase text-muted-foreground">
                    What happens next
                  </p>
                </div>
                <ol className="font-body text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                  <li>
                    You will receive a confirmation email at{" "}
                    <span className="text-foreground">
                      {lastOrder.orderInfo.email}
                    </span>
                  </li>
                  <li>
                    The artist will begin working on your painting — you can
                    track the status using your Order ID
                  </li>
                  <li>
                    Once completed, your painting will be carefully packed and
                    shipped to your address
                  </li>
                  <li>
                    You will be notified when the order is out for delivery
                  </li>
                </ol>
              </div>

              <p className="font-body text-[10px] text-center text-muted-foreground">
                Save your Order ID to check the status anytime
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default OrderConfirmation;
