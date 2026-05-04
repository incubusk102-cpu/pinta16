import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import {
  useStorefrontConfig,
  type PromoCodeType,
} from "@/contexts/StorefrontConfigContext";
import { useUserAuth } from "@/contexts/UserAuthContext";
import {
  getShippingFee,
  hasShippingRates,
  LALAMOVE_PAID_TO_RIDER,
} from "@/lib/shipment";
import { jsonAuthHeaders } from "@/lib/api";
import type { ShippingZone } from "@/lib/ph-regions";

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
  // PH-specific fields collected from the cascading address picker.
  region?: string;
  barangay?: string;
  landmark?: string;
  // Courier the customer chose at checkout (used to charge the
  // per-courier × per-zone fee). May be empty for legacy orders.
  courier?: string;
  shippingZone?: string;
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
  // ISO date the parcel was actually handed to the courier. Defaults to
  // when the admin records the AWB but is editable so a slightly-late
  // entry still tells the buyer the right date.
  shippedAt?: string;
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
  /**
   * True when the order qualified for the admin-configured free-shipping
   * threshold. In Lalamove-paid-to-rider mode the storefront fronts the
   * rider fare on delivery for these orders; admin can match this flag
   * against `subtotal` to verify before reimbursing.
   */
  freeShipping?: boolean;
  /**
   * Subtotal threshold (in PHP) that was active when the order was
   * placed. Stored on the order so a later threshold change in admin
   * doesn't retroactively re-classify historical orders.
   */
  freeShippingThreshold?: number;
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

export const REVIEW_MIN_CHARS = 0;
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
  // True when the storefront has per-courier shipping rates configured
  // but the customer hasn't picked a courier+region yet. Lets the cart
  // and checkout summaries render "Pick a courier" instead of a
  // misleading "₱0 / FREE" placeholder.
  shippingFeePending: boolean;
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
    payment?: {
      paymentIntentId?: string;
      qrCodeImageUrl?: string | null;
      // Cloudflare Turnstile token captured by the CheckoutForm widget.
      // Forwarded to /api/orders so the server can verify the order
      // submission came from a real browser. Optional — when Turnstile
      // is not configured, the server falls open.
      turnstileToken?: string | null;
      // Honeypot — must be empty. Wired through so future flows that
      // don't want a hidden field can opt out by passing nothing.
      honeypot?: string;
    },
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
  // Customer's checkout courier/zone selection. CheckoutForm calls
  // `setCheckoutShipping` so the cart total reflects the fee from the
  // shipping rates table.
  checkoutCourier: string;
  checkoutZone: ShippingZone | null;
  setCheckoutShipping: (next: {
    courier: string;
    zone: ShippingZone | null;
  }) => void;
}

const DEFAULT_FREE_SHIPPING_THRESHOLD = 8000;
const DEFAULT_SHIPPING_FEE = 500;

// Orders are now scoped to whoever is signed in (or `guest` for
// signed-out shoppers). The legacy `canvhub_orders` key was a single
// browser-shared bucket — that meant if customer A placed an order,
// signed out, and customer B signed in on the same browser, customer
// B's `/account → My Orders` would still show customer A's order.
// We migrate any legacy entry into the guest bucket on first load and
// then forget the old key forever.
const LEGACY_ORDERS_STORAGE_KEY = "canvhub_orders";
const ORDERS_STORAGE_PREFIX = "canvhub_orders__";
const GUEST_ORDERS_STORAGE_KEY = `${ORDERS_STORAGE_PREFIX}guest`;
const CART_STORAGE_KEY = "canvhub_cart";

const normalizeUserEmail = (email: string | null | undefined): string | null =>
  email && email.trim() ? email.trim().toLowerCase() : null;

const ordersStorageKeyFor = (userEmail: string | null): string =>
  userEmail ? `${ORDERS_STORAGE_PREFIX}${userEmail}` : GUEST_ORDERS_STORAGE_KEY;

const readOrdersFromStorage = (userEmail: string | null): CompletedOrder[] => {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(ordersStorageKeyFor(userEmail));
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeOrdersToStorage = (
  userEmail: string | null,
  orders: CompletedOrder[],
): void => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      ordersStorageKeyFor(userEmail),
      JSON.stringify(orders),
    );
  } catch {
    /* ignore quota errors */
  }
};

// One-shot migration: collapse the legacy single-bucket key into the
// guest bucket so we don't lose offline guest order history, then
// remove the legacy key so it never bleeds into a signed-in account
// again. Safe to call multiple times — does nothing once the legacy
// key is gone.
const migrateLegacyOrdersStorage = (): void => {
  if (typeof window === "undefined") return;
  try {
    const legacy = localStorage.getItem(LEGACY_ORDERS_STORAGE_KEY);
    if (legacy === null) return;
    const guestExisting = localStorage.getItem(GUEST_ORDERS_STORAGE_KEY);
    if (guestExisting === null) {
      localStorage.setItem(GUEST_ORDERS_STORAGE_KEY, legacy);
    }
    localStorage.removeItem(LEGACY_ORDERS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
};

const CartContext = createContext<CartContextType | undefined>(undefined);

const getEstimatedCreationDays = (itemCount: number): string => {
  if (itemCount === 0) return "";
  if (itemCount <= 2) return "3–7 business days";
  return "Subject to artist availability — we'll email you with estimated completion";
};

const mergeReviews = (
  existing: OrderReview[] | undefined,
  legacy: OrderReview | undefined,
  next: OrderReview,
): OrderReview[] => {
  const seed: OrderReview[] = existing ? [...existing] : legacy ? [legacy] : [];
  const idx = seed.findIndex(
    (r) => (r.productId ?? "") === (next.productId ?? ""),
  );
  if (idx >= 0) seed[idx] = next;
  else seed.push(next);
  return seed;
};

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const { config } = useStorefrontConfig();
  const { user, token } = useUserAuth();
  const userEmail = normalizeUserEmail(user?.email);
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
  // Initial orders are read from the *current* user's scoped bucket so
  // signing in as a different Google account on the same browser never
  // shows the previous account's orders, even before the server
  // refresh below resolves. The legacy unscoped `canvhub_orders` key
  // is collapsed into the guest bucket on first load.
  const [orders, setOrders] = useState<CompletedOrder[]>(() => {
    migrateLegacyOrdersStorage();
    return readOrdersFromStorage(userEmail);
  });
  // Track which user the in-memory orders state belongs to so the
  // user-change effect can persist the previous user's state to its
  // own bucket before swapping to the new user's cache.
  const ordersOwnerRef = useRef<string | null>(userEmail);

  // Customer's checkout shipping selection — used to look up the
  // per-courier × per-zone fee in the shipping rates table. CheckoutForm
  // calls `setCheckoutShipping` whenever the courier or region changes
  // so the cart total stays in sync.
  const [checkoutShipping, setCheckoutShipping] = useState<{
    courier: string;
    zone: ShippingZone | null;
  }>({ courier: "", zone: null });

  const saveOrders = useCallback(
    (newOrders: CompletedOrder[]) => {
      setOrders(newOrders);
      writeOrdersToStorage(userEmail, newOrders);
      ordersOwnerRef.current = userEmail;
    },
    [userEmail],
  );

  // Keep `/account → My Orders` honest across login / logout / Google
  // account-switch on the same browser:
  //   - Sign-in: replace local state with whatever the server has for
  //     the signed-in email. Token-authenticated, so a malicious
  //     client can't spoof another user's history.
  //   - Sign-out / account-switch: drop the previous user's orders
  //     from memory and surface the new user's cached bucket while we
  //     wait for the server fetch (or, for guests, just the guest
  //     bucket).
  // Server-fetched orders are written back to localStorage so the
  // next reload can paint instantly without waiting for the network.
  useEffect(() => {
    if (ordersOwnerRef.current !== userEmail) {
      ordersOwnerRef.current = userEmail;
      setOrders(readOrdersFromStorage(userEmail));
    }
    if (!userEmail || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/orders?action=mine", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const data = (await response.json()) as {
          orders?: CompletedOrder[];
        };
        if (cancelled) return;
        if (ordersOwnerRef.current !== userEmail) return;
        const next = Array.isArray(data?.orders) ? data.orders : [];
        setOrders(next);
        writeOrdersToStorage(userEmail, next);
      } catch {
        /* network blip — keep cached orders */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userEmail, token]);

  const addToCart = useCallback((item: Omit<CartItem, "quantity">) => {
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
  }, []);

  const removeFromCart = useCallback(
    (id: string) => setItems((prev) => prev.filter((i) => i.id !== id)),
    [],
  );

  const updateQuantity = useCallback(
    (id: string, quantity: number) => {
      if (quantity <= 0) {
        removeFromCart(id);
        return;
      }
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, quantity } : i)),
      );
    },
    [removeFromCart],
  );

  const removeVoucher = useCallback(
    () =>
      setVoucher({
        code: "",
        type: "percent",
        value: 0,
        freeShipping: false,
        applied: false,
        error: "",
      }),
    [],
  );

  const clearCart = useCallback(() => {
    setItems([]);
    removeVoucher();
  }, [removeVoucher]);

  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    [items],
  );
  const itemCount = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items],
  );
  const isFreeShipping = subtotal >= FREE_SHIPPING_THRESHOLD;
  const amountToFreeShipping = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);

  const applyVoucher = useCallback(
    (code: string) => {
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
    },
    [config.promoCodes, subtotal],
  );

  const voucherFreeShipping = voucher.applied && voucher.freeShipping;
  // Per-courier × per-zone fee from the storefront config takes
  // precedence when the customer has picked a courier and we know the
  // delivery region's zone. Falls back to the legacy flat fee otherwise.
  const courierFee = getShippingFee(
    config.shippingRates,
    checkoutShipping.courier,
    checkoutShipping.zone,
  );
  // When the admin has configured per-courier rates we treat the cart's
  // shipping fee as "pending" until the customer has actually picked a
  // courier+region in checkout. Otherwise the cart would silently fall
  // back to the legacy flat fee (which can be ₱0 if the admin only set
  // the per-courier rates) and render a misleading "₱0 FREE" before the
  // shopper ever sees the courier picker.
  //
  // In Lalamove-paid-to-rider mode the cart never charges shipping at
  // all — the rider quotes the actual fare on dispatch and the buyer
  // pays them directly in cash. We collapse the entire shipping price
  // model to ₱0 and turn off the "Free shipping over ₱X" progress bar
  // (since there's nothing to waive).
  const ratesConfigured = hasShippingRates(config.shippingRates);
  const courierPicked = Boolean(
    checkoutShipping.courier && checkoutShipping.zone,
  );
  const shippingFeePending = LALAMOVE_PAID_TO_RIDER
    ? false
    : ratesConfigured && !courierPicked;
  const baseShippingFee = LALAMOVE_PAID_TO_RIDER
    ? 0
    : courierFee != null
      ? courierFee
      : shippingFeePending
        ? 0
        : SHIPPING_FEE;
  const shippingFeeOriginal = baseShippingFee;
  const shippingFee = LALAMOVE_PAID_TO_RIDER
    ? 0
    : isFreeShipping || voucherFreeShipping
      ? 0
      : baseShippingFee;
  const discount = useMemo((): number => {
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
  }, [voucher.applied, voucher.type, voucher.value, subtotal]);
  const total = subtotal - discount + shippingFee;
  const estimatedCreationDays = getEstimatedCreationDays(itemCount);

  const placeOrder = useCallback(
    (
      orderInfo: OrderInfo,
      payment?: {
        paymentIntentId?: string;
        qrCodeImageUrl?: string | null;
        turnstileToken?: string | null;
        honeypot?: string;
      },
    ): CompletedOrder => {
      const orderQualifiesForFreeShipping =
        config.freeShipping.enabled && isFreeShipping;
      const order: CompletedOrder = {
        id: `ORD-${crypto.randomUUID().split("-")[0].toUpperCase()}`,
        items: [...items],
        orderInfo,
        subtotal,
        shippingFee,
        freeShipping: orderQualifiesForFreeShipping || voucherFreeShipping,
        freeShippingThreshold: config.freeShipping.enabled
          ? config.freeShipping.threshold
          : undefined,
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
      // Generate the A6 waybill PDF on the client (jsPDF + JsBarcode
      // both need `document` for the offscreen barcode canvas, so this
      // can't run in the Worker) and ship it up as base64 alongside
      // the order. The server forwards it as the email attachment on
      // the confirmation mail. Falls back to `null` on any error so
      // the order itself still posts even if PDF generation fails.
      void import("@/lib/waybill")
        .then(({ buildWaybillPdfBase64 }) => buildWaybillPdfBase64(order))
        .catch(() => null)
        .then((waybillPdfBase64) =>
          fetch("/api/orders", {
            method: "POST",
            headers: jsonAuthHeaders(),
            body: JSON.stringify({
              action: "place",
              order,
              ...(waybillPdfBase64 ? { waybillPdfBase64 } : {}),
              // Optional anti-abuse signals. Server falls open on both
              // when they're missing or when Turnstile isn't
              // configured, so these stay safe to send
              // unconditionally.
              ...(payment?.turnstileToken
                ? { turnstileToken: payment.turnstileToken }
                : {}),
              ...(payment?.honeypot !== undefined
                ? { website: payment.honeypot }
                : {}),
            }),
          }),
        )
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
    },
    [
      items,
      subtotal,
      shippingFee,
      discount,
      total,
      estimatedCreationDays,
      voucher.applied,
      voucher.code,
      orders,
      saveOrders,
      clearCart,
      config.freeShipping.enabled,
      config.freeShipping.threshold,
      isFreeShipping,
      voucherFreeShipping,
    ],
  );

  const updateOrderStatus = useCallback(
    (orderId: string, status: CompletedOrder["status"]) => {
      const newOrders = orders.map((o) =>
        o.id === orderId ? { ...o, status } : o,
      );
      saveOrders(newOrders);
    },
    [orders, saveOrders],
  );

  const submitOrderReview = useCallback(
    (orderId: string, review: OrderReview) => {
      const newOrders = orders.map((o) => {
        if (o.id !== orderId) return o;
        const reviews = mergeReviews(o.reviews, o.review, review);
        return { ...o, reviews, review };
      });
      saveOrders(newOrders);
      if (lastOrder?.id === orderId) {
        const reviews = mergeReviews(
          lastOrder.reviews,
          lastOrder.review,
          review,
        );
        setLastOrder({ ...lastOrder, reviews, review });
      }
    },
    [orders, saveOrders, lastOrder],
  );

  const getOrderReviews = useCallback(
    (order: CompletedOrder): OrderReview[] => {
      if (order.reviews && order.reviews.length > 0) return order.reviews;
      if (order.review) return [order.review];
      return [];
    },
    [],
  );

  const applyOrderUpdate = useCallback(
    (updated: CompletedOrder) => {
      const newOrders = orders.map((o) =>
        o.id === updated.id ? { ...o, ...updated } : o,
      );
      saveOrders(newOrders);
      if (lastOrder?.id === updated.id) {
        setLastOrder({ ...lastOrder, ...updated });
      }
    },
    [orders, saveOrders, lastOrder],
  );

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);
  const viewOrder = useCallback(
    (orderId: string) => {
      const found = orders.find((o) => o.id === orderId);
      if (!found) return;
      setLastOrder(found);
      setShowConfirmation(true);
    },
    [orders],
  );

  // Surface the admin-configured threshold to the cart drawer + checkout
  // banner regardless of whether shipping is paid-to-rider. In Lalamove-
  // paid-to-rider mode the storefront covers the rider fare on delivery
  // for orders that hit the threshold; the admin reimburses or pre-books
  // an account-paid Lalamove on behalf of the customer (the order record
  // carries `freeShipping: true` so this is auditable).
  const freeShippingThreshold = Number.isFinite(FREE_SHIPPING_THRESHOLD)
    ? FREE_SHIPPING_THRESHOLD
    : 0;
  const freeShippingEnabled = config.freeShipping.enabled;

  // Memoise the context value so consumers don't re-render every time
  // a parent provider (e.g. polled storefront config or product list)
  // re-renders. The value object identity now only changes when one of
  // these primitives or refs actually changes.
  const value = useMemo(
    () => ({
      items,
      isOpen,
      voucher,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      openCart,
      closeCart,
      applyVoucher,
      removeVoucher,
      shippingFee,
      shippingFeeOriginal,
      shippingFeePending,
      subtotal,
      discount,
      total,
      itemCount,
      freeShippingThreshold,
      freeShippingEnabled,
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
      viewOrder,
      showConfirmation,
      setShowConfirmation,
      checkoutCourier: checkoutShipping.courier,
      checkoutZone: checkoutShipping.zone,
      setCheckoutShipping,
    }),
    [
      items,
      isOpen,
      voucher,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      openCart,
      closeCart,
      applyVoucher,
      removeVoucher,
      shippingFee,
      shippingFeeOriginal,
      shippingFeePending,
      subtotal,
      discount,
      total,
      itemCount,
      freeShippingThreshold,
      freeShippingEnabled,
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
      lastOrder,
      viewOrder,
      showConfirmation,
      checkoutShipping.courier,
      checkoutShipping.zone,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
};
