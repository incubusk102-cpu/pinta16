import { motion, AnimatePresence } from "framer-motion";
import { X, Minus, Plus, Trash2, Tag, Truck } from "lucide-react";
import { useState } from "react";
import { useCart } from "@/contexts/CartContext";

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
    amountToFreeShipping,
    freeShippingThreshold,
    freeShippingEnabled,
    voucher,
    applyVoucher,
    removeVoucher,
    setShowCheckout,
  } = useCart();
  const [voucherInput, setVoucherInput] = useState("");

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
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-[85] w-full max-w-md bg-card border-l border-border/20 flex flex-col"
          >
            <div className="p-6 border-b border-border/10 flex items-center justify-between">
              <h2 className="font-display text-lg text-foreground">
                Your Cart ({items.length})
              </h2>
              <button
                onClick={closeCart}
                className="p-2 hover:bg-accent rounded-sm transition-colors"
              >
                <X className="w-5 h-5 text-foreground" />
              </button>
            </div>

            {items.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="font-body text-sm text-muted-foreground">
                  Your cart is empty
                </p>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {/* Free shipping progress */}
                  {!isFreeShipping && freeShippingEnabled && (
                    <div className="p-3 bg-muted/30 border border-border/10 rounded-sm mb-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Truck className="w-3.5 h-3.5 text-muted-foreground" />
                        <p className="font-body text-[10px] text-muted-foreground">
                          ₱{amountToFreeShipping.toLocaleString()} away from
                          free shipping (₱
                          {freeShippingThreshold.toLocaleString()})
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
                        <p className="font-body text-sm text-foreground mt-1">
                          ₱{(item.price * item.quantity).toLocaleString()}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            onClick={() =>
                              updateQuantity(item.id, item.quantity - 1)
                            }
                            className="p-1 hover:bg-accent rounded-sm transition-colors"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-body text-xs w-6 text-center">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() =>
                              updateQuantity(item.id, item.quantity + 1)
                            }
                            className="p-1 hover:bg-accent rounded-sm transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="p-1 ml-auto hover:bg-destructive/10 rounded-sm transition-colors"
                          >
                            <Trash2 className="w-3 h-3 text-destructive" />
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
                              : `\u20b1${voucher.value.toLocaleString()} off`}
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

                <div className="p-6 border-t border-border/10 space-y-2">
                  <div className="flex justify-between font-body text-xs text-muted-foreground">
                    <span>Subtotal</span>
                    <span>₱{subtotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-body text-xs text-muted-foreground">
                    <span>Shipping</span>
                    {isFreeShipping ? (
                      <span>
                        <span className="line-through mr-1">
                          ₱{shippingFeeOriginal.toLocaleString()}
                        </span>
                        <span className="text-foreground">FREE</span>
                      </span>
                    ) : (
                      <span>₱{shippingFee.toLocaleString()}</span>
                    )}
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between font-body text-xs text-foreground">
                      <span>Discount</span>
                      <span>-₱{discount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-body text-sm text-foreground pt-2 border-t border-border/10">
                    <span>Total</span>
                    <span className="font-semibold">
                      ₱{total.toLocaleString()}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      closeCart();
                      setShowCheckout(true);
                    }}
                    className="w-full mt-4 py-4 bg-foreground text-background font-body text-xs tracking-[0.3em] uppercase hover:bg-foreground/90 transition-all duration-300 rounded-sm"
                  >
                    Proceed to Checkout
                  </button>
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
