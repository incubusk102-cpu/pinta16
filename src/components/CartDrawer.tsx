import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Minus,
  Plus,
  Trash2,
  Tag,
  Truck,
  ShoppingBag,
  ArrowRight,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { animate, stagger } from "animejs";
import { useCart, cartLineKey } from "@/contexts/CartContext";
import { useStorefrontConfig } from "@/contexts/StorefrontConfigContext";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { LALAMOVE_PAID_TO_RIDER } from "@/lib/shipment";
import { formatPHP } from "@/lib/format";
import AnimeCounter from "./motion/AnimeCounter";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// AnimeCounter feeds the running tween value through these formatters
// frame-by-frame; both delegate to the shared `formatPHP()` helper so
// the rendered string stays in lockstep with every other peso amount
// on the site (currency-locale-aware, no fractional centavos).
const pesoFormatter = (n: number): string =>
  formatPHP(Math.max(0, Math.round(n)));
const pesoDiscountFormatter = (n: number): string =>
  `-${formatPHP(Math.max(0, Math.round(n)))}`;

const CartDrawer = () => {
  const {
    items,
    isOpen,
    closeCart,
    removeFromCart,
    updateQuantity,
    subtotal,
    shippingFee,
    discount,
    total,
    isFreeShipping,
    shippingFeeOriginal,
    shippingFeePending,
    amountToFreeShipping,
    freeShippingThreshold,
    freeShippingEnabled,
    voucher,
    applyVoucher,
    removeVoucher,
    setShowCheckout,
  } = useCart();
  // The shipping line has three distinct states. Picking these apart up
  // front keeps the JSX readable and avoids the previous bug where a
  // genuine ₱0 fallback fee rendered as "₱0 FREE".
  const voucherFreeShipping = voucher.applied && voucher.freeShipping;
  const shippingIsWaived =
    !shippingFeePending && (isFreeShipping || voucherFreeShipping);
  const {
    config: { vacationMode },
  } = useStorefrontConfig();
  const [voucherInput, setVoucherInput] = useState("");
  const titleId = useId();
  const lineListRef = useRef<HTMLDivElement | null>(null);
  // Lock <body> scroll while the drawer is open so the page underneath
  // doesn't drift when the visitor scrolls inside the cart on mobile.
  useBodyScrollLock(isOpen);
  // Anime.js cascade reveal for the cart line items every time the
  // drawer opens or the items list grows. Framer-motion already
  // owns the drawer's slide-in spring — this layer is purely the
  // line-item ladder. Silent under prefers-reduced-motion.
  useEffect(() => {
    if (!isOpen || items.length === 0) return;
    if (prefersReducedMotion()) return;
    const host = lineListRef.current;
    if (!host) return;
    const lines = host.querySelectorAll<HTMLElement>("[data-cart-line]");
    if (lines.length === 0) return;
    animate(Array.from(lines), {
      opacity: [0, 1],
      translateX: [16, 0],
      duration: 380,
      delay: stagger(45),
      ease: "outQuad",
    });
  }, [isOpen, items.length]);
  // Close on ESC for keyboard users. The overlay click + close button
  // already cover pointer users.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCart();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, closeCart]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeCart}
            className="fixed inset-0 z-[80] bg-background/60 backdrop-blur-sm"
            aria-hidden="true"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-[85] w-full max-w-md bg-card border-l border-border/20 flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <div className="p-6 border-b border-border/10 flex items-center justify-between">
              <h2
                id={titleId}
                className="font-display text-lg text-foreground flex items-baseline gap-1"
              >
                <span>Your Cart (</span>
                <AnimeCounter
                  value={items.length}
                  durationMs={420}
                  className="tabular-nums"
                />
                <span>)</span>
              </h2>
              <button
                onClick={closeCart}
                className="p-2 hover:bg-accent rounded-sm transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Close cart"
              >
                <X className="w-5 h-5 text-foreground" />
              </button>
            </div>

            {items.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-muted/30 border border-border/10 flex items-center justify-center">
                  <ShoppingBag
                    className="w-7 h-7 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
                <div className="space-y-1">
                  <p className="font-display text-base text-foreground">
                    Your cart is empty
                  </p>
                  <p className="font-body text-xs text-muted-foreground max-w-[14rem] mx-auto">
                    Browse the gallery and tap the cart icon on any piece you
                    love.
                  </p>
                </div>
                <button
                  onClick={closeCart}
                  className="inline-flex items-center gap-2 px-5 py-3 bg-foreground text-background font-body text-xs tracking-[0.3em] uppercase rounded-sm hover:bg-foreground/90 transition-all duration-300"
                >
                  Browse the gallery
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <>
                <div
                  ref={lineListRef}
                  className="flex-1 overflow-y-auto p-6 space-y-4"
                >
                  {/* Free shipping progress */}
                  {freeShippingEnabled &&
                    freeShippingThreshold > 0 &&
                    subtotal < freeShippingThreshold && (
                      <div className="p-3 bg-muted/30 border border-border/10 rounded-sm mb-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Truck className="w-3.5 h-3.5 text-muted-foreground" />
                          <p className="font-body text-[10px] text-muted-foreground">
                            {formatPHP(amountToFreeShipping)} away from free
                            shipping ({formatPHP(freeShippingThreshold)})
                          </p>
                        </div>
                        <div className="w-full h-1 bg-border/30 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-foreground/50 rounded-full transition-all"
                            style={{
                              width: `${Math.min((subtotal / freeShippingThreshold) * 100, 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                  {items.map((item) => (
                    <div
                      key={item.id}
                      data-cart-line
                      className="flex gap-4 p-3 bg-muted/20 border border-border/10 rounded-sm"
                    >
                      <img
                        src={item.image}
                        alt={item.title}
                        className="w-16 h-20 object-cover rounded-sm"
                        loading="lazy"
                        decoding="async"
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-display text-sm text-foreground truncate">
                          {item.title}
                        </h4>
                        <p className="font-body text-[10px] text-muted-foreground">
                          {item.medium}
                        </p>
                        {item.dimensions ? (
                          <p className="font-body text-[10px] text-muted-foreground mt-0.5">
                            <span className="uppercase tracking-[0.2em] opacity-70">
                              Dimensions
                            </span>{" "}
                            <span className="text-foreground">
                              {item.dimensions}
                            </span>
                          </p>
                        ) : null}
                        <p className="font-body text-sm text-foreground mt-1">
                          {formatPHP(item.price * item.quantity)}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            onClick={() =>
                              updateQuantity(
                                cartLineKey(item),
                                item.quantity - 1,
                              )
                            }
                            className="min-w-[36px] min-h-[36px] flex items-center justify-center hover:bg-accent rounded-sm transition-colors"
                            aria-label={`Decrease quantity of ${item.title}`}
                          >
                            <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <span
                            className="font-body text-xs w-6 text-center"
                            aria-live="polite"
                          >
                            {item.quantity}
                          </span>
                          <button
                            onClick={() =>
                              updateQuantity(
                                cartLineKey(item),
                                item.quantity + 1,
                              )
                            }
                            className="min-w-[36px] min-h-[36px] flex items-center justify-center hover:bg-accent rounded-sm transition-colors"
                            aria-label={`Increase quantity of ${item.title}`}
                          >
                            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            onClick={() => removeFromCart(cartLineKey(item))}
                            className="min-w-[36px] min-h-[36px] ml-auto flex items-center justify-center hover:bg-destructive/10 rounded-sm transition-colors"
                            aria-label={`Remove ${item.title} from cart`}
                          >
                            <Trash2
                              className="w-3.5 h-3.5 text-destructive"
                              aria-hidden="true"
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Voucher */}
                  <div className="pt-4 border-t border-border/10">
                    {voucher.applied ? (
                      <div className="flex items-center justify-between p-3 bg-success/10 border border-success/20 rounded-sm">
                        <div className="flex items-center gap-2">
                          <Tag className="w-3.5 h-3.5 text-success" />
                          <span className="font-body text-xs text-success">
                            {voucher.code} (
                            {voucher.type === "percent"
                              ? `${voucher.value}% off`
                              : voucher.type === "flat"
                                ? `flat ${formatPHP(voucher.value)}`
                                : voucher.type === "free_shipping"
                                  ? "free shipping"
                                  : `${formatPHP(voucher.value)} off`}
                            {voucher.type !== "free_shipping" &&
                              voucher.freeShipping &&
                              " + free shipping"}
                            )
                          </span>
                        </div>
                        <button
                          onClick={removeVoucher}
                          className="font-body text-[10px] text-destructive hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          value={voucherInput}
                          onChange={(e) => setVoucherInput(e.target.value)}
                          placeholder="Voucher code"
                          className="flex-1 px-3 py-2 bg-background border border-border/30 text-foreground font-body text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/30 rounded-sm"
                        />
                        <button
                          onClick={() => {
                            applyVoucher(voucherInput);
                            setVoucherInput("");
                          }}
                          className="px-4 py-2 bg-foreground text-background font-body text-xs hover:bg-foreground/90 rounded-sm transition-colors"
                        >
                          Apply
                        </button>
                      </div>
                    )}
                    {voucher.error && (
                      <p className="font-body text-[10px] text-destructive mt-1">
                        {voucher.error}
                      </p>
                    )}
                  </div>
                </div>

                <div className="p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] border-t border-border/10 space-y-2 bg-card">
                  <div className="flex justify-between font-body text-xs text-muted-foreground">
                    <span>Subtotal</span>
                    <AnimeCounter
                      value={subtotal}
                      format={pesoFormatter}
                      durationMs={520}
                    />
                  </div>
                  <div className="flex justify-between font-body text-xs text-muted-foreground">
                    <span>Shipping</span>
                    {LALAMOVE_PAID_TO_RIDER ? (
                      <span className="text-foreground/80 text-right">
                        Lalamove
                        <span className="block text-[10px] text-muted-foreground">
                          paid to rider on delivery
                        </span>
                      </span>
                    ) : shippingFeePending ? (
                      <span className="text-foreground/70">
                        Pick a courier at checkout
                      </span>
                    ) : shippingIsWaived ? (
                      <span>
                        {shippingFeeOriginal > 0 && (
                          <span className="line-through mr-1">
                            {formatPHP(shippingFeeOriginal)}
                          </span>
                        )}
                        <span className="text-foreground">FREE</span>
                      </span>
                    ) : (
                      <AnimeCounter
                        value={shippingFee}
                        format={pesoFormatter}
                        durationMs={520}
                      />
                    )}
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between font-body text-xs text-foreground">
                      <span>Discount</span>
                      <AnimeCounter
                        value={discount}
                        format={pesoDiscountFormatter}
                        durationMs={520}
                      />
                    </div>
                  )}
                  <div className="flex justify-between font-body text-sm text-foreground pt-2 border-t border-border/10">
                    <span>Total</span>
                    <span className="font-semibold">
                      <AnimeCounter
                        value={total}
                        format={pesoFormatter}
                        durationMs={620}
                      />
                      {shippingFeePending && !LALAMOVE_PAID_TO_RIDER && (
                        <span className="font-body text-[10px] text-muted-foreground ml-1">
                          + shipping
                        </span>
                      )}
                      {LALAMOVE_PAID_TO_RIDER && (
                        <span className="font-body text-[10px] text-muted-foreground ml-1">
                          + Lalamove fee
                        </span>
                      )}
                    </span>
                  </div>
                  {vacationMode.enabled ? (
                    <div className="mt-4 space-y-2">
                      <button
                        disabled
                        className="w-full py-4 bg-muted text-muted-foreground font-body text-xs tracking-[0.3em] uppercase rounded-sm cursor-not-allowed"
                      >
                        Shop paused
                      </button>
                      <p className="text-[11px] text-muted-foreground leading-snug px-1">
                        Canvas Hub is briefly paused
                        {vacationMode.returnDate
                          ? ` — back on ${new Date(
                              `${vacationMode.returnDate}T00:00:00`,
                            ).toLocaleDateString(undefined, {
                              month: "long",
                              day: "numeric",
                            })}`
                          : ""}
                        . Your cart will still be here when checkout reopens.
                      </p>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        closeCart();
                        setShowCheckout(true);
                      }}
                      className="w-full mt-4 py-4 bg-foreground text-background font-body text-xs tracking-[0.3em] uppercase hover:bg-foreground/90 transition-all duration-300 rounded-sm"
                    >
                      Proceed to Checkout
                    </button>
                  )}
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default CartDrawer;
