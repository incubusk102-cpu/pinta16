import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ArrowLeft,
  User,
  Mail,
  Phone,
  MapPin,
  FileText,
  Loader2,
  LogIn,
  UserPlus,
} from "lucide-react";
import { useCart, type OrderInfo } from "@/contexts/CartContext";
import { useUserAuth } from "@/contexts/UserAuthContext";
import {
  sanitizeText,
  isValidEmail,
  isValidPhone,
  enforceMaxLength,
} from "@/lib/sanitize";
import PaymentModal from "./PaymentModal";
import { createPayment } from "@/utils/payment.functions";

const CheckoutForm = () => {
  const {
    showCheckout,
    setShowCheckout,
    items,
    subtotal,
    shippingFee,
    discount,
    total,
    estimatedCreationDays,
    placeOrder,
    isFreeShipping,
    shippingFeeOriginal,
    voucher,
  } = useCart();
  const { user, token } = useUserAuth();
  const isSignedIn = Boolean(token && user);
  const [checkoutMode, setCheckoutMode] = useState<
    "choose" | "guest" | "signed_in"
  >("choose");
  const [form, setForm] = useState<OrderInfo>({
    fullName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    notes: "",
  });
  const [errors, setErrors] = useState<
    Partial<Record<keyof OrderInfo, string>>
  >({});
  const [showPayment, setShowPayment] = useState(false);
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  useEffect(() => {
    if (showCheckout) {
      if (isSignedIn) {
        setCheckoutMode("signed_in");
        setForm((prev) => ({
          ...prev,
          fullName: prev.fullName || user?.name || "",
          email: prev.email || user?.email || "",
        }));
      } else {
        setCheckoutMode("choose");
      }
    }
  }, [showCheckout, isSignedIn, user?.name, user?.email]);

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof OrderInfo, string>> = {};
    if (!form.fullName.trim()) newErrors.fullName = "Full name is required";
    if (!form.email.trim()) newErrors.email = "Email is required";
    else if (!isValidEmail(form.email))
      newErrors.email = "Invalid email address";
    if (!form.phone.trim()) newErrors.phone = "Phone number is required";
    else if (!isValidPhone(form.phone))
      newErrors.phone = "Invalid phone number";
    if (!form.address.trim()) newErrors.address = "Address is required";
    if (!form.city.trim()) newErrors.city = "City is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handlePayWithQR = async () => {
    if (!validate()) return;
    setIsCreatingPayment(true);

    try {
      const data = await createPayment({
        data: {
          amount: total,
          customer: {
            fullName: form.fullName.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            address: form.address.trim(),
            city: form.city.trim(),
          },
        },
      });
      setPaymentIntentId(data.id);
      setQrCodeUrl(data.qrCodeImageUrl || null);
      setShowPayment(true);
    } catch (error) {
      console.error("Payment creation failed:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to create payment. Please try again.",
      );
    } finally {
      setIsCreatingPayment(false);
    }
  };

  const handlePaymentSuccess = () => {
    setShowPayment(false);
    const sanitizedForm: OrderInfo = {
      fullName: sanitizeText(enforceMaxLength(form.fullName, 100)),
      email: sanitizeText(enforceMaxLength(form.email, 254)),
      phone: sanitizeText(enforceMaxLength(form.phone, 20)),
      address: sanitizeText(enforceMaxLength(form.address, 300)),
      city: sanitizeText(enforceMaxLength(form.city, 100)),
      notes: sanitizeText(enforceMaxLength(form.notes, 500)),
    };
    placeOrder(sanitizedForm);
    setForm({
      fullName: "",
      email: "",
      phone: "",
      address: "",
      city: "",
      notes: "",
    });
  };

  const fields: {
    key: keyof OrderInfo;
    label: string;
    icon: typeof User;
    type?: string;
    placeholder: string;
    required?: boolean;
  }[] = [
    {
      key: "fullName",
      label: "Full Name",
      icon: User,
      placeholder: "Juan Dela Cruz",
      required: true,
    },
    {
      key: "email",
      label: "Email Address",
      icon: Mail,
      type: "email",
      placeholder: "juan@email.com",
      required: true,
    },
    {
      key: "phone",
      label: "Phone Number",
      icon: Phone,
      type: "tel",
      placeholder: "+63 9XX XXX XXXX",
      required: true,
    },
    {
      key: "address",
      label: "Delivery Address",
      icon: MapPin,
      placeholder: "Street, Barangay, Building",
      required: true,
    },
    {
      key: "city",
      label: "City / Province",
      icon: MapPin,
      placeholder: "Manila, Metro Manila",
      required: true,
    },
    {
      key: "notes",
      label: "Order Notes (Optional)",
      icon: FileText,
      placeholder: "Any special instructions...",
    },
  ];

  return (
    <>
      <AnimatePresence>
        {showCheckout && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCheckout(false)}
              className="fixed inset-0 z-[90] bg-background/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 bottom-0 z-[95] w-full max-w-md bg-card border-l border-border/20 flex flex-col"
            >
              <div className="p-6 border-b border-border/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowCheckout(false)}
                    className="p-2 hover:bg-accent rounded-sm transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5 text-foreground" />
                  </button>
                  <h2 className="font-display text-lg text-foreground">
                    Checkout
                  </h2>
                </div>
                <button
                  onClick={() => setShowCheckout(false)}
                  className="p-2 hover:bg-accent rounded-sm transition-colors"
                >
                  <X className="w-5 h-5 text-foreground" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {/* Guest vs Sign-in choice */}
                {checkoutMode === "choose" && (
                  <div className="mb-6 space-y-3">
                    <p className="font-body text-xs tracking-wider uppercase text-muted-foreground">
                      How would you like to checkout?
                    </p>
                    <button
                      onClick={() => setCheckoutMode("guest")}
                      className="w-full flex items-center gap-3 p-4 border border-border/30 rounded-sm hover:bg-accent/50 transition-colors text-left"
                    >
                      <UserPlus className="w-5 h-5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="font-body text-sm font-medium text-foreground">
                          Continue as Guest
                        </p>
                        <p className="font-body text-xs text-muted-foreground">
                          No account needed
                        </p>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        setShowCheckout(false);
                        window.location.href = "/login";
                      }}
                      className="w-full flex items-center gap-3 p-4 border border-border/30 rounded-sm hover:bg-accent/50 transition-colors text-left"
                    >
                      <LogIn className="w-5 h-5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="font-body text-sm font-medium text-foreground">
                          Sign in
                        </p>
                        <p className="font-body text-xs text-muted-foreground">
                          Track your order &amp; save your info
                        </p>
                      </div>
                    </button>
                  </div>
                )}

                {/* Order Summary + Form (hidden during choose mode) */}
                {checkoutMode !== "choose" && (
                  <>
                    <div className="mb-6 p-4 bg-muted/30 border border-border/10 rounded-sm">
                      <p className="font-body text-xs tracking-wider uppercase text-muted-foreground mb-3">
                        Order Summary
                      </p>
                      {items.map((item) => (
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
                      <div className="border-t border-border/10 mt-3 pt-3 space-y-1">
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
                            <span>Discount ({voucher.discountPercent}%)</span>
                            <span>-₱{discount.toLocaleString()}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-body text-sm text-foreground pt-2 border-t border-border/10">
                          <span>Total</span>
                          <span className="font-semibold">
                            ₱{total.toLocaleString()}
                          </span>
                        </div>
                      </div>
                      {estimatedCreationDays && (
                        <p className="font-body text-[10px] text-muted-foreground mt-2">
                          Est. creation: {estimatedCreationDays}
                        </p>
                      )}
                    </div>

                    {/* Form */}
                    <div className="space-y-4">
                      <p className="font-body text-xs tracking-wider uppercase text-muted-foreground">
                        Your Information
                      </p>
                      {fields.map(
                        ({
                          key,
                          label,
                          icon: Icon,
                          type,
                          placeholder,
                          required,
                        }) => (
                          <div key={String(key)}>
                            <label className="font-body text-xs text-muted-foreground flex items-center gap-1.5 mb-1.5">
                              <Icon className="w-3.5 h-3.5" />
                              {label}{" "}
                              {required && (
                                <span className="text-destructive">*</span>
                              )}
                            </label>
                            {key === "notes" ? (
                              <textarea
                                value={form[key]}
                                onChange={(e) =>
                                  setForm((prev) => ({
                                    ...prev,
                                    [key]: e.target.value,
                                  }))
                                }
                                placeholder={placeholder}
                                rows={3}
                                className="w-full px-3 py-2 bg-background border border-border/30 text-foreground font-body text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/30 transition-colors rounded-sm resize-none"
                              />
                            ) : (
                              <input
                                type={type || "text"}
                                value={form[key]}
                                onChange={(e) =>
                                  setForm((prev) => ({
                                    ...prev,
                                    [key]: e.target.value,
                                  }))
                                }
                                placeholder={placeholder}
                                className="w-full px-3 py-2 bg-background border border-border/30 text-foreground font-body text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/30 transition-colors rounded-sm"
                              />
                            )}
                            {errors[key] && (
                              <p className="font-body text-[10px] text-destructive mt-1">
                                {errors[key]}
                              </p>
                            )}
                          </div>
                        ),
                      )}

                      {/* Pay with QR Ph Button */}
                      <button
                        onClick={handlePayWithQR}
                        disabled={isCreatingPayment}
                        className="w-full py-4 bg-[#0066FF] text-[#FFFFFF] font-body text-xs tracking-[0.3em] uppercase hover:bg-[#0052CC] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 rounded-sm flex items-center justify-center gap-3"
                      >
                        {isCreatingPayment ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Generating QR Code...
                          </>
                        ) : (
                          "Pay with QR Ph"
                        )}
                      </button>

                      <p className="font-body text-[10px] text-center text-muted-foreground/50">
                        Secure payment via PayMongo. Scan with GCash, Maya, or
                        any QR Ph app.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {showPayment && paymentIntentId && (
        <PaymentModal
          paymentIntentId={paymentIntentId}
          qrCodeUrl={qrCodeUrl}
          total={total}
          onSuccess={handlePaymentSuccess}
          onClose={() => setShowPayment(false)}
        />
      )}
    </>
  );
};

export default CheckoutForm;
