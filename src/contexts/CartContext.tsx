import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  useStorefrontConfig,
  type PromoCodeType,
} from "@/contexts/StorefrontConfigContext";

export interface CartItem {
  id: string;
  image: string;
  title: string;
  medium: string;
  year: string;
  price: number;
  quantity: number;
}

export interface OrderInfo {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  notes: string;
  // Optional structured fields populated by the hybrid address picker.
  // Server still reads `address` + `city` so legacy orders keep
  // working; these augment for couriers + future use.
  addressLine1?: string;
  addressLine2?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  latitude?: number | null;
  longitude?: number | null;
  formattedAddress?: string;
  placeId?: string;
}

export interface OrderNotification {
  type:
    | "shipped"
    | "received"
    | "in_progress"
    | "confirmed"
    | "out_for_delivery"
    | "refund_requested"
    | "refund_succeeded"
    | "refund_failed";
  message: string;
  recipient: string;
  sentAt: string;
  delivered?: boolean;
  provider?: "resend" | "brevo" | string;
  providerId?: string;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

export interface OrderRefund {
  id: string;
  paymentId: string;
  amount: number;
  status: "pending" | "succeeded" | "failed";
  reason: string;
  requestedAt: string;
  completedAt?: string;
  failureMessage?: string;
}

export interface OrderShipment {
  courier: string;
  trackingNumber: string;
  trackingUrl?: string;
  notes?: string;
  updatedAt: string;
}

export interface OrderReview {
  rating: number;
  text: string;
  images: string[];
  submittedAt: string;
  publishedToHomepage?: boolean;
  productId?: string;
  productTitle?: string;
  productImage?: string;
}

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
  browser?: string;
  os?: string;
  device?: string;
  capturedAt?: string;
}

export interface OrderActivityEntry extends RequestMeta {
  at: string;
  type: string;
  actor: "customer" | "admin" | "system" | string;
}

export interface CompletedOrder {
  id: string;
  items: CartItem[];
  orderInfo: OrderInfo;
  subtotal: number;
  shippingFee: number;
  discount: number;
  total: number;
  estimatedCreationDays: string;
  createdAt: string;
  status: "confirmed" | "in_progress" | "out_for_delivery" | "received";
  paymentIntentId?: string;
  qrCodeImageUrl?: string;
  voucherCode?: string;
  notifications?: OrderNotification[];
  /** @deprecated use `reviews` (one entry per item). Kept for backward compatibility. */
  review?: OrderReview;
  reviews?: OrderReview[];
  refund?: OrderRefund;
  shipment?: OrderShipment;
  requestMeta?: RequestMeta;
  activityLog?: OrderActivityEntry[];
}

export const REVIEW_MIN_CHARS = 500;
export const REVIEW_MAX_IMAGES = 5;

export const ORDER_STEPS: {
  key: CompletedOrder["status"];
  label: string;
  description: string;
}[] = [
  {
    key: "confirmed",
    label: "Order Confirmed",
    description: "Payment received, order is being processed",
  },
  {
    key: "in_progress",
    label: "Painting In Progress",
    description: "The artist is working on your painting",
  },
  {
    key: "out_for_delivery",
    label: "Out for Delivery",
    description: "Your order is on its way",
  },
  {
    key: "received",
    label: "Order Received",
    description: "Delivered successfully",
  },
];

interface VoucherState {
  code: string;
  type: PromoCodeType;
  value: number;
  freeShipping: boolean;
  applied: boolean;
  error: string;
}

interface CartContextType {
  items: CartItem[];
  isOpen: boolean;
  voucher: VoucherState;
  addToCart: (item: Omit<CartItem, "quantity">) => void;
  removeFromCart: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  applyVoucher: (code: string) => void;
  removeVoucher: () => void;
  shippingFee: number;
  shippingFeeOriginal: number;
  subtotal: number;
  discount: number;
  total: number;
  itemCount: number;
  freeShippingThreshold: number;
  freeShippingEnabled: boolean;
  isFreeShipping: boolean;
  amountToFreeShipping: number;
  estimatedCreationDays: string;
  orders: CompletedOrder[];
  placeOrder: (
    orderInfo: OrderInfo,
    payment?: { paymentIntentId?: string; qrCodeImageUrl?: string | null },
  ) => CompletedOrder;
  updateOrderStatus: (
    orderId: string,
    status: CompletedOrder["status"],
  ) => void;
  submitOrderReview: (orderId: string, review: OrderReview) => void;
  getOrderReviews: (order: CompletedOrder) => OrderReview[];
  applyOrderUpdate: (order: CompletedOrder) => void;
  showCheckout: boolean;
  setShowCheckout: (show: boolean) => void;
  lastOrder: CompletedOrder | null;
  showConfirmation: boolean;
  setShowConfirmation: (show: boolean) => void;
  viewOrder: (orderId: string) => void;
}

const DEFAULT_FREE_SHIPPING_THRESHOLD = 8000;
const DEFAULT_SHIPPING_FEE = 500;

const ORDERS_STORAGE_KEY = "canvhub_orders";
const CART_STORAGE_KEY = "canvhub_cart";

const CartContext = createContext<CartContextType | undefined>(undefined);

const getEstimatedCreationDays = (itemCount: number): string => {
  if (itemCount === 0) return "";
  if (itemCount <= 2) return "3–7 business days";
  return "Subject to artist availability — we'll email you with estimated completion";
};

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const { config } = useStorefrontConfig();
  const FREE_SHIPPING_THRESHOLD = config.freeShipping.enabled
    ? (config.freeShipping.threshold ?? DEFAULT_FREE_SHIPPING_THRESHOLD)
    : Number.POSITIVE_INFINITY;
  const SHIPPING_FEE = config.freeShipping.shippingFee ?? DEFAULT_SHIPPING_FEE;
  const [items, setItems] = useState<CartItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem(CART_STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // Persist cart locally so it survives reloads + offline navigation.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (items.length === 0) {
        localStorage.removeItem(CART_STORAGE_KEY);
      } else {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
      }
    } catch {
      /* ignore quota errors */
    }
  }, [items]);
  const [isOpen, setIsOpen] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [lastOrder, setLastOrder] = useState<CompletedOrder | null>(null);
  const [voucher, setVoucher] = useState<VoucherState>({
    code: "",
    type: "percent",
    value: 0,
    freeShipping: false,
    applied: false,
    error: "",
  });
  const [orders, setOrders] = useState<CompletedOrder[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem(ORDERS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const saveOrders = (newOrders: CompletedOrder[]) => {
    setOrders(newOrders);
    if (typeof window !== "undefined") {
      localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(newOrders));
    }
  };

  const addToCart = (item: Omit<CartItem, "quantity">) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
    setIsOpen(true);
  };

  const removeFromCart = (id: string) =>
    setItems((prev) => prev.filter((i) => i.id !== id));

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(id);
      return;
    }
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantity } : i)));
  };

  const clearCart = () => {
    setItems([]);
    removeVoucher();
  };

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const isFreeShipping = subtotal >= FREE_SHIPPING_THRESHOLD;
  const amountToFreeShipping = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);

  const applyVoucher = (code: string) => {
    const upper = code.toUpperCase().trim();
    const promo = config.promoCodes.find((p) => p.code === upper);
    const fail = (error: string) =>
      setVoucher({
        code: upper,
        type: "percent",
        value: 0,
        freeShipping: false,
        applied: false,
        error,
      });
    if (!promo) return fail("Invalid voucher code");
    if (promo.expiresAt && new Date(promo.expiresAt).getTime() < Date.now()) {
      return fail("This code has expired");
    }
    if (subtotal < promo.minSpend) {
      return fail(
        `Minimum spend of \u20b1${promo.minSpend.toLocaleString()} required.`,
      );
    }
    setVoucher({
      code: upper,
      type: promo.type,
      value: promo.value,
      freeShipping:
        promo.type === "free_shipping" || Boolean(promo.freeShipping),
      applied: true,
      error: "",
    });
  };

  const removeVoucher = () =>
    setVoucher({
      code: "",
      type: "percent",
      value: 0,
      freeShipping: false,
      applied: false,
      error: "",
    });

  const voucherFreeShipping = voucher.applied && voucher.freeShipping;
  const shippingFeeOriginal = SHIPPING_FEE;
  const shippingFee = isFreeShipping || voucherFreeShipping ? 0 : SHIPPING_FEE;
  const computeVoucherDiscount = (): number => {
    if (!voucher.applied) return 0;
    if (voucher.type === "percent") {
      return subtotal * (voucher.value / 100);
    }
    if (voucher.type === "flat") {
      // "Any order becomes ₱<value>" — discount is the gap above the flat
      // price, capped at subtotal so we never go negative.
      return Math.max(0, Math.min(subtotal, subtotal - voucher.value));
    }
    if (voucher.type === "free_shipping") {
      return 0;
    }
    return Math.min(voucher.value, subtotal);
  };
  const discount = computeVoucherDiscount();
  const total = subtotal - discount + shippingFee;
  const estimatedCreationDays = getEstimatedCreationDays(itemCount);

  const placeOrder = (
    orderInfo: OrderInfo,
    payment?: { paymentIntentId?: string; qrCodeImageUrl?: string | null },
  ): CompletedOrder => {
    const order: CompletedOrder = {
      id: `ORD-${crypto.randomUUID().split("-")[0].toUpperCase()}`,
      items: [...items],
      orderInfo,
      subtotal,
      shippingFee,
      discount,
      total,
      estimatedCreationDays,
      createdAt: new Date().toISOString(),
      status: "confirmed",
      paymentIntentId: payment?.paymentIntentId,
      qrCodeImageUrl: payment?.qrCodeImageUrl ?? undefined,
      voucherCode: voucher.applied ? voucher.code : undefined,
      notifications: [],
    };
    const newOrders = [order, ...orders];
    saveOrders(newOrders);
    setLastOrder(order);
    clearCart();
    setIsOpen(false);
    setShowCheckout(false);
    setShowConfirmation(true);
    fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "place", order }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      })
      .catch((err) => {
        console.error("Order sync failed:", err);
        import("sonner").then(({ toast }) =>
          toast.warning(
            "Order saved locally but could not sync to server. It will appear in your tracking once connectivity is restored.",
          ),
        );
      });
    return order;
  };

  const updateOrderStatus = (
    orderId: string,
    status: CompletedOrder["status"],
  ) => {
    const newOrders = orders.map((o) =>
      o.id === orderId ? { ...o, status } : o,
    );
    saveOrders(newOrders);
  };

  const mergeReviews = (
    existing: OrderReview[] | undefined,
    legacy: OrderReview | undefined,
    next: OrderReview,
  ): OrderReview[] => {
    const seed: OrderReview[] = existing
      ? [...existing]
      : legacy
        ? [legacy]
        : [];
    const idx = seed.findIndex(
      (r) => (r.productId ?? "") === (next.productId ?? ""),
    );
    if (idx >= 0) seed[idx] = next;
    else seed.push(next);
    return seed;
  };

  const submitOrderReview = (orderId: string, review: OrderReview) => {
    const newOrders = orders.map((o) => {
      if (o.id !== orderId) return o;
      const reviews = mergeReviews(o.reviews, o.review, review);
      return { ...o, reviews, review };
    });
    saveOrders(newOrders);
    if (lastOrder?.id === orderId) {
      const reviews = mergeReviews(lastOrder.reviews, lastOrder.review, review);
      setLastOrder({ ...lastOrder, reviews, review });
    }
  };

  const getOrderReviews = (order: CompletedOrder): OrderReview[] => {
    if (order.reviews && order.reviews.length > 0) return order.reviews;
    if (order.review) return [order.review];
    return [];
  };

  const applyOrderUpdate = (updated: CompletedOrder) => {
    const newOrders = orders.map((o) =>
      o.id === updated.id ? { ...o, ...updated } : o,
    );
    saveOrders(newOrders);
    if (lastOrder?.id === updated.id) {
      setLastOrder({ ...lastOrder, ...updated });
    }
  };

  return (
    <CartContext.Provider
      value={{
        items,
        isOpen,
        voucher,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        openCart: () => setIsOpen(true),
        closeCart: () => setIsOpen(false),
        applyVoucher,
        removeVoucher,
        shippingFee,
        shippingFeeOriginal,
        subtotal,
        discount,
        total,
        itemCount,
        freeShippingThreshold: Number.isFinite(FREE_SHIPPING_THRESHOLD)
          ? FREE_SHIPPING_THRESHOLD
          : 0,
        freeShippingEnabled: config.freeShipping.enabled,
        isFreeShipping,
        amountToFreeShipping,
        estimatedCreationDays,
        orders,
        placeOrder,
        updateOrderStatus,
        submitOrderReview,
        getOrderReviews,
        applyOrderUpdate,
        showCheckout,
        setShowCheckout,
        lastOrder,
        viewOrder: (orderId: string) => {
          const found = orders.find((o) => o.id === orderId);
          if (!found) return;
          setLastOrder(found);
          setShowConfirmation(true);
        },
        showConfirmation,
        setShowConfirmation,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
};
