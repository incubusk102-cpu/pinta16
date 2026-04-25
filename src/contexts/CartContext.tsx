import { createContext, useContext, useState, ReactNode } from "react";

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

export interface OrderReview {
  rating: number;
  text: string;
  images: string[];
  submittedAt: string;
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
  notifications?: OrderNotification[];
  review?: OrderReview;
  refund?: OrderRefund;
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
  discountPercent: number;
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
  applyOrderUpdate: (order: CompletedOrder) => void;
  showCheckout: boolean;
  setShowCheckout: (show: boolean) => void;
  lastOrder: CompletedOrder | null;
  showConfirmation: boolean;
  setShowConfirmation: (show: boolean) => void;
}

const VOUCHERS: Record<string, { discountPercent: number; minSpend: number }> =
  {
    PINTATERRA10: { discountPercent: 10, minSpend: 7100 },
    PINTATERRA15: { discountPercent: 15, minSpend: 7100 },
    ARTLOVER20: { discountPercent: 20, minSpend: 7100 },
    GETNEW28: { discountPercent: 28, minSpend: 7100 },
  };

const MIN_SPEND = 7100;
const FREE_SHIPPING_THRESHOLD = 8000;
const SHIPPING_FEE = 500;

const ORDERS_STORAGE_KEY = "pintaterra_orders";

const CartContext = createContext<CartContextType | undefined>(undefined);

const getEstimatedCreationDays = (itemCount: number): string => {
  if (itemCount === 0) return "";
  if (itemCount <= 2) return "3–7 business days";
  return "Subject to artist availability — we'll email you with estimated completion";
};

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [lastOrder, setLastOrder] = useState<CompletedOrder | null>(null);
  const [voucher, setVoucher] = useState<VoucherState>({
    code: "",
    discountPercent: 0,
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
    const v = VOUCHERS[upper];
    if (!v) {
      setVoucher({
        code: upper,
        discountPercent: 0,
        applied: false,
        error: "Invalid voucher code",
      });
      return;
    }
    if (subtotal < MIN_SPEND) {
      setVoucher({
        code: upper,
        discountPercent: 0,
        applied: false,
        error: `Minimum spend of ₱${MIN_SPEND.toLocaleString()} required.`,
      });
      return;
    }
    setVoucher({
      code: upper,
      discountPercent: v.discountPercent,
      applied: true,
      error: "",
    });
  };

  const removeVoucher = () =>
    setVoucher({ code: "", discountPercent: 0, applied: false, error: "" });

  const shippingFeeOriginal = SHIPPING_FEE;
  const shippingFee = isFreeShipping ? 0 : SHIPPING_FEE;
  const discount = voucher.applied
    ? subtotal * (voucher.discountPercent / 100)
    : 0;
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

  const submitOrderReview = (orderId: string, review: OrderReview) => {
    const newOrders = orders.map((o) =>
      o.id === orderId ? { ...o, review } : o,
    );
    saveOrders(newOrders);
    if (lastOrder?.id === orderId) {
      setLastOrder({ ...lastOrder, review });
    }
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
        freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
        isFreeShipping,
        amountToFreeShipping,
        estimatedCreationDays,
        orders,
        placeOrder,
        updateOrderStatus,
        submitOrderReview,
        applyOrderUpdate,
        showCheckout,
        setShowCheckout,
        lastOrder,
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
