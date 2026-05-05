import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle,
  Package,
  Clock,
  Truck,
  Info,
  Copy,
  Bell,
  Star,
  Search,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useCart, ORDER_STEPS } from "@/contexts/CartContext";
import { buildTrackingUrl } from "@/lib/shipment";
import { toast } from "sonner";
import OrderReviewForm from "./OrderReviewForm";
import DeliveredReviewPrompt from "./DeliveredReviewPrompt";
import RefundBanner from "./RefundBanner";
const OrderPushOptInPrompt = lazy(() => import("./OrderPushOptInPrompt"));

const formatNotificationDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
};

const OrderConfirmation = () => {
  const {
    showConfirmation,
    setShowConfirmation,
    lastOrder,
    getOrderReviews,
    orderNeedsSync,
    resyncOrder,
  } = useCart();
  const seenNotificationsRef = useRef<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

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

  // Close on Escape key — gives keyboard users a way out without
  // having to scroll to the bottom Close button.
  useEffect(() => {
    if (!showConfirmation) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowConfirmation(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showConfirmation, setShowConfirmation]);

  if (!lastOrder) return null;

  const currentStepIdx = ORDER_STEPS.findIndex(
    (s) => s.key === lastOrder.status,
  );

  const closeConfirmation = () => setShowConfirmation(false);

  // True between "PayMongo charged the buyer" and "our server saved
  // the order". When this is true the modal swaps the cheery
  // confirmation hero for an amber "payment received but order needs
  // to finish saving" panel so the buyer always knows their money
  // landed even if our /api/orders POST hasn't acknowledged yet.
  const pendingSync = orderNeedsSync(lastOrder);

  const handleRetrySync = async () => {
    setSyncing(true);
    setSyncError(null);
    const result = await resyncOrder(lastOrder.id);
    setSyncing(false);
    if (result.ok) {
      toast.success("Order saved on the server");
    } else {
      const detail =
        result.status !== undefined
          ? `${result.error} (HTTP ${result.status})`
          : result.error;
      setSyncError(detail);
      toast.error(`Couldn't finish saving the order: ${detail}`);
    }
  };

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
          onClick={closeConfirmation}
          className="fixed inset-0 z-[1100] bg-background/90 backdrop-blur-xl flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-card border border-border/20 rounded-sm max-w-lg w-full relative max-h-[90vh] flex flex-col"
          >
            <div className="flex-1 overflow-y-auto p-8">
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
                  {pendingSync ? (
                    <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-amber-500" />
                  ) : (
                    <CheckCircle className="w-16 h-16 mx-auto mb-4 text-success" />
                  )}
                </motion.div>
                <h2 className="font-display text-2xl text-foreground mb-2">
                  {pendingSync
                    ? "Payment received — finishing your order"
                    : "Order Confirmed!"}
                </h2>
                <p className="font-body text-sm text-muted-foreground mb-4">
                  {pendingSync
                    ? "Your payment went through. We're still saving the order on our side."
                    : "Thank you for your purchase"}
                </p>
                {pendingSync && (
                  <div className="mx-auto mb-4 max-w-sm w-full text-left p-4 bg-amber-500/10 border border-amber-500/40 rounded-sm space-y-2">
                    <p className="font-body text-xs text-amber-600 dark:text-amber-300">
                      Don't worry — your card was charged exactly once and we'll
                      keep retrying automatically. You can also tap
                      <strong> Retry now</strong> below to push the order to our
                      server, or email{" "}
                      <a
                        href={`mailto:support@canvhub.com?subject=Order%20${lastOrder.id}%20stuck&body=Order%20ID%3A%20${lastOrder.id}%0APayment%20ID%3A%20${lastOrder.paymentIntentId ?? "(none)"}%0A`}
                        className="underline"
                      >
                        support@canvhub.com
                      </a>{" "}
                      with the IDs below — we'll fix it manually.
                    </p>
                    {lastOrder.paymentIntentId && (
                      <p className="font-mono text-[11px] text-foreground/80 break-all">
                        Payment ID: {lastOrder.paymentIntentId}
                      </p>
                    )}
                    {syncError && (
                      <p className="font-body text-[11px] text-red-600 dark:text-red-300">
                        Last error: {syncError}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleRetrySync()}
                      disabled={syncing}
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-sm border border-amber-500/60 hover:bg-amber-500/10 disabled:opacity-60"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`}
                      />
                      {syncing ? "Retrying…" : "Retry now"}
                    </button>
                  </div>
                )}
                {/* Order ID hero. The ID is the only handle a guest has
                    on their order — we surface it big, mono-spaced, and
                    one-tap copyable so they can save it before closing
                    the overlay. The deep link below jumps straight into
                    the tracker pre-populated with this ID. */}
                <div className="mx-auto inline-flex flex-col items-stretch gap-2 p-4 bg-muted/40 border border-border/30 rounded-sm max-w-xs w-full">
                  <p className="font-body text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
                    Your Order ID
                  </p>
                  <button
                    onClick={copyOrderId}
                    className="font-mono text-base sm:text-lg text-foreground tracking-wider hover:bg-accent/40 px-2 py-1 rounded transition-colors flex items-center justify-center gap-2"
                    aria-label="Copy order ID"
                  >
                    {lastOrder.id}
                    <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <Link
                    to="/account"
                    search={{ track: lastOrder.id }}
                    hash="account-tracker"
                    onClick={closeConfirmation}
                    className="flex items-center justify-center gap-1.5 font-body text-xs text-foreground hover:underline"
                  >
                    <Search className="w-3.5 h-3.5" />
                    Track this order
                  </Link>
                </div>
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

                {/* Shipment tracking */}
                {lastOrder.shipment && (
                  <div className="p-4 bg-muted/30 border border-border/10 rounded-sm space-y-1">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-muted-foreground" />
                      <p className="font-body text-xs tracking-wider uppercase text-muted-foreground">
                        In transit
                      </p>
                    </div>
                    <p className="font-body text-sm text-foreground">
                      {lastOrder.shipment.courier} · Tracking{" "}
                      <span className="font-mono">
                        {lastOrder.shipment.trackingNumber}
                      </span>
                    </p>
                    {(() => {
                      const url = buildTrackingUrl(
                        lastOrder.shipment.courier,
                        lastOrder.shipment.trackingNumber,
                        lastOrder.shipment.trackingUrl,
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
                        <>
                          <DeliveredReviewPrompt
                            items={lastOrder.items}
                            existingReviews={reviews}
                          />
                          <div id="order-review-form" className="scroll-mt-24">
                            <OrderReviewForm
                              orderId={lastOrder.id}
                              customerEmail={lastOrder.orderInfo.email}
                              items={lastOrder.items}
                              existingReviews={reviews}
                            />
                          </div>
                        </>
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
                                {rev.productTitle
                                  ? ` · ${rev.productTitle}`
                                  : ""}
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

                {/* Free push-notification opt-in. Renders only when the
                    browser supports Web Push and the user hasn't already
                    granted/denied permission. The customer's email comes
                    from the order they just placed, so the server can
                    fan out future status changes to this device. */}
                {lastOrder.orderInfo?.email && (
                  <Suspense>
                    <OrderPushOptInPrompt
                      email={lastOrder.orderInfo.email}
                      variant="card"
                    />
                  </Suspense>
                )}

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
                      You will receive a confirmation email from{" "}
                      <span className="text-foreground">order@canvhub.com</span>
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

                <button
                  type="button"
                  onClick={closeConfirmation}
                  className="w-full py-3 rounded-md border border-border/60 bg-foreground text-background font-body text-sm hover:opacity-90 transition-opacity touch-manipulation"
                >
                  Close
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default OrderConfirmation;
