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
import {
  cartLineKey,
  loadCartItemsFromStorage,
  CART_STORAGE_KEY,
} from "@/lib/cart-storage";
import { toast } from "sonner";
import { useProducts } from "@/contexts/ProductContext";
import { isPurchasable, getAvailability } from "@/lib/artworks";
export {
  cartLineKey,
  CART_STORAGE_KEY,
  LEGACY_CART_STORAGE_KEY,
} from "@/lib/cart-storage";

export interface CartItem {
  id: string;
  image: string;
  title: string;
  medium: string;
  year: string;
  price: number;
  quantity: number;
  /**
   * Admin-provided dimensions string (free-form, e.g. `60 × 90 cm`)
   * captured from the product editor at the time the customer added
   * the item to their cart. Surfaces in the cart drawer, checkout
   * summary, order confirmation, transactional email, and admin
   * order detail. Optional for legacy lines added before this field
   * existed.
   */
  dimensions?: string;
  /**
   * Legacy customer-picked size for orders placed under the old
   * S/M/L/XL/XXL selector. New cart lines no longer carry this; kept
   * on the type so historical orders rendered by `OrderConfirmation`
   * / `AdminPage` still typecheck and fall back to a formatted size
   * label when `dimensions` is missing.
   */
  sizeCm?: { widthCm: number; heightCm: number };
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
    | "refund_failed"
    | "production_stage"
    | "production_photo";
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

export type ReturnRequestStatus =
  | "requested"
  | "approved"
  | "received"
  | "completed"
  | "denied"
  | "cancelled";

export type ReturnRequestReason =
  | "damaged_in_transit"
  | "wrong_item"
  | "not_as_described"
  | "changed_mind"
  | "other";

export interface ReturnRequestItem {
  productId: string;
  quantity: number;
}

export interface ReturnRequest {
  id: string;
  status: ReturnRequestStatus;
  reason: ReturnRequestReason;
  description: string;
  photoUrls?: string[];
  items?: ReturnRequestItem[];
  rmaNumber?: string;
  denialReason?: string;
  refundAmount?: number;
  /**
   * Reason the hybrid auto-refund couldn't run when the admin clicked
   * Complete return (e.g. order has no PayMongo paymentIntent, refund
   * amount > order total, PayMongo rejected the refund). Surfaced on
   * the admin Returns queue so the operator can fall back to the
   * Manual refund flow on the order. Cleared on a successful retry.
   */
  autoRefundError?: string | null;
  requestedAt: string;
  decidedAt?: string;
  receivedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
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
  returnRequest?: ReturnRequest;
  shipment?: OrderShipment;
  adminNote?: string;
  requestMeta?: RequestMeta;
  activityLog?: OrderActivityEntry[];
  /**
   * Sub-stage shown while `status === "in_progress"`. The artist (admin)
   * advances the order through cut → frame → paint → varnish → packed
   * so the customer can see exactly where their painting is in the
   * studio, instead of just a generic "in progress" badge for days at a
   * stretch. Undefined means the artist hasn't picked a stage yet.
   */
  productionStage?: ProductionStage;
  /**
   * Behind-the-scenes progress photos uploaded by the artist, tagged
   * with the stage they were taken at. Newest first. Each entry stores
   * a stable `/api/r/<key>` URL pointing at the R2 object served by
   * functions/api/r/[[path]].js (uploaded via /api/uploads).
   */
  productionPhotos?: ProductionPhoto[];
  /**
   * Local sync state. `false` means the SPA tried to POST this order to
   * `/api/orders` but the request never confirmed (network blip, edge
   * challenge, body-size rejection, anything). `true` means the server
   * acknowledged it. `undefined` is a legacy order from before this
   * field existed — treated as synced unless `createdAt` is recent.
   *
   * The boot effect in `CartProvider` retries every order with
   * `serverSynced === false` until it sticks, so a buyer who gets the
   * confirmation modal but had their POST silently fail will still
   * see the order in `/admin` after their next visit.
   */
  serverSynced?: boolean;
}

/**
 * An order is treated as "needs to be re-POSTed to the server" when it
 * was explicitly flagged as un-synced, OR when it's a fresh-looking
 * legacy order (created within the last 24h) that predates the flag.
 * Anything older is assumed to have been synced long ago — re-POSTing
 * it now would just bounce off the server's duplicate-id guard.
 */
const NEEDS_SYNC_LEGACY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const orderNeedsSync = (o: CompletedOrder): boolean => {
  if (o.serverSynced === true) return false;
  if (o.serverSynced === false) return true;
  const createdMs = Date.parse(o.createdAt);
  if (!Number.isFinite(createdMs)) return false;
  return Date.now() - createdMs < NEEDS_SYNC_LEGACY_WINDOW_MS;
};

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

/**
 * Sub-stages the artist marks while an order is in_progress. These are
 * deliberately physical-studio milestones, not generic "started / mid /
 * finishing" buckets, so the customer's progress timeline reads like a
 * mini behind-the-scenes tour. Order matters — the order tracker walks
 * this array left-to-right.
 */
export type ProductionStage = "cut" | "frame" | "paint" | "varnish" | "packed";

export const PRODUCTION_STAGES: {
  key: ProductionStage;
  label: string;
  description: string;
  // Short customer-facing line piped into the push notification body.
  pushBody: string;
}[] = [
  {
    key: "cut",
    label: "Canvas cut",
    description: "Raw canvas trimmed and prepped for stretching",
    pushBody: "We've cut the canvas for your painting and started prep.",
  },
  {
    key: "frame",
    label: "Stretcher framed",
    description: "Canvas stretched onto the wooden frame",
    pushBody: "Your canvas is on the frame and ready for paint.",
  },
  {
    key: "paint",
    label: "Painting",
    description: "Artist is laying down the painting",
    pushBody: "Brushes are out — your painting is being made right now.",
  },
  {
    key: "varnish",
    label: "Varnishing",
    description: "Final varnish layer being applied and cured",
    pushBody: "Final varnish is on. We're letting it cure before packing.",
  },
  {
    key: "packed",
    label: "Packed",
    description: "Painting is wrapped and waiting for the courier",
    pushBody: "Packed and ready to ship — we'll add tracking shortly.",
  },
];

/**
 * A single behind-the-scenes photo uploaded by the artist while the
 * order is in_progress. The photo is tagged with the stage it belongs
 * to so the customer's tracker can group thumbnails under the right
 * milestone (e.g. three "paint" photos all sit under "Painting").
 */
export interface ProductionPhoto {
  /** Stable id (UUID) — used as the React key + the remove handle. */
  id: string;
  /** Which stage the artist took the photo at. */
  stage: ProductionStage;
  /** `/api/r/products/<aa>/<sha256>.<ext>` — served by the R2 proxy. */
  url: string;
  /** ISO 8601 timestamp captured server-side at upload time. */
  uploadedAt: string;
}

// Hard cap on photos per order. The customer-facing tracker fans them
// out as thumbnails, and most orders only need a handful per stage; an
// arbitrarily long gallery would just bloat the KV order JSON and the
// customer-facing render. Admins can prune older shots if they hit this.
export const MAX_PRODUCTION_PHOTOS = 30;

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
  // Removed / quantity-updated by the per-line key returned from
  // `cartLineKey(item)` (currently the bare product id).
  removeFromCart: (lineKey: string) => void;
  updateQuantity: (lineKey: string, quantity: number) => void;
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
  // Manually re-attempt the place POST for a single order. Returns
  // `{ ok: true }` if the server now has it, or `{ ok: false, error,
  // status }` so the UI can show what went wrong. Used by
  // `MyOrders` to surface a "Sync to server" button next to any
  // pending-sync order.
  resyncOrder: (
    orderId: string,
  ) => Promise<{ ok: true } | { ok: false; error: string; status?: number }>;
  // True when this order is in `serverSynced: false` state (i.e. the
  // SPA placed it locally but the server hasn't acked yet). Lets the
  // UI render a diagnostic chip + retry button.
  orderNeedsSync: (order: CompletedOrder) => boolean;
  // Customer's checkout courier/zone selection. CheckoutForm calls
  // `setCheckoutShipping` so the cart total reflects the fee from the
  // shipping rates table.
  checkoutCourier: string;
  checkoutZone: ShippingZone | null;
  setCheckoutShipping: (next: {
    courier: string;
    zone: ShippingZone | null;
  }) => void;
  // Map of cart item id → availability status for items that are NOT
  // purchasable (sold, reserved, draft). Empty when all items are ok.
  unavailableItems: Map<string, string>;
  // True when at least one cart item fails the availability check.
  hasUnavailableItems: boolean;
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
// Cart storage helpers live in `@/lib/cart-storage` so unit tests can
// exercise them without pulling in the React-only surface of this
// file; `cartLineKey`, `CART_STORAGE_KEY`, and `LEGACY_CART_STORAGE_KEY`
// are re-exported at the top of the file for backward compatibility
// with existing imports of `useCart` consumers.

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
  const { products } = useProducts();
  const userEmail = normalizeUserEmail(user?.email);
  const FREE_SHIPPING_THRESHOLD = config.freeShipping.enabled
    ? (config.freeShipping.threshold ?? DEFAULT_FREE_SHIPPING_THRESHOLD)
    : Number.POSITIVE_INFINITY;
  const SHIPPING_FEE = config.freeShipping.shippingFee ?? DEFAULT_SHIPPING_FEE;
  const [items, setItems] = useState<CartItem[]>(() =>
    loadCartItemsFromStorage(),
  );

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
  // Latest snapshot of `orders`, kept in sync via an effect below. Used
  // by the long-running async retry loop and the server-merge effect
  // so they read fresh data without re-running every time `orders`
  // changes (which would cause an infinite re-fetch loop).
  const ordersRef = useRef<CompletedOrder[]>([]);
  // Stable callable that flips `serverSynced: true` on a single order.
  // We hand it to the POST handler via a ref so the closure inside
  // `placeOrder` doesn't have to re-read state, and so the boot
  // retry effect can mark orders synced from outside the React render.
  const markOrderSyncedRef = useRef<(orderId: string) => void>(() => {});

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

  // Keep `ordersRef` and `markOrderSyncedRef` in sync with the latest
  // state + scope so that async POST callbacks always see the freshest
  // data, no matter how long they took to resolve.
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);
  useEffect(() => {
    markOrderSyncedRef.current = (orderId: string) => {
      const next = ordersRef.current.map((o) =>
        o.id === orderId ? { ...o, serverSynced: true } : o,
      );
      ordersRef.current = next;
      setOrders(next);
      writeOrdersToStorage(userEmail, next);
      // The confirmation modal renders straight from `lastOrder`, not
      // from the `orders` array, so without this the amber "Payment
      // received — finishing your order" banner stays stuck even after
      // the POST has acknowledged. Use the functional setter so we
      // don't have to depend on a fresh `lastOrder` closure.
      setLastOrder((prev) =>
        prev && prev.id === orderId ? { ...prev, serverSynced: true } : prev,
      );
    };
  }, [userEmail]);

  // Boot-time retry: on every mount, scan local orders for any that
  // never confirmed with the server (`serverSynced === false`, or a
  // legacy order created within the last 24h that predates the flag)
  // and POST them again. The server's duplicate-id guard makes this
  // idempotent — a 409 means it's already there, so we still flip
  // the flag and stop retrying. This recovers orders whose original
  // POST was eaten by an edge challenge or similar.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const pending = ordersRef.current.filter(orderNeedsSync);
        for (const order of pending) {
          if (cancelled) return;
          try {
            const res = await fetch("/api/orders", {
              method: "POST",
              headers: jsonAuthHeaders(),
              // The original /place needs Turnstile, which is
              // single-use and long since consumed for these stuck
              // orders. /resync uses the user-session cookie instead
              // and skips the bot check.
              body: JSON.stringify({ action: "resync", order }),
            });
            if (res.ok || res.status === 409) {
              markOrderSyncedRef.current(order.id);
            }
          } catch {
            /* leave for the next boot */
          }
        }
      })();
    }, 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

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
        const serverOrders = Array.isArray(data?.orders) ? data.orders : [];
        // Don't blow away local orders that haven't reached the server
        // yet — otherwise a failed POST followed by a sign-in would
        // erase the buyer's confirmation entirely. Pending orders stay
        // at the head of the list (they're newer than anything on the
        // server by definition) so the boot retry effect can drain
        // them on the next tick.
        const serverIds = new Set(
          serverOrders.map((o: CompletedOrder) => o.id),
        );
        const pendingLocal = ordersRef.current.filter(
          (o) => !serverIds.has(o.id) && orderNeedsSync(o),
        );
        const next = [...pendingLocal, ...serverOrders];
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
      const key = cartLineKey(item);
      const existing = prev.find((i) => cartLineKey(i) === key);
      if (existing) {
        return prev.map((i) =>
          cartLineKey(i) === key ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
    setIsOpen(true);
  }, []);

  const removeFromCart = useCallback(
    (lineKey: string) =>
      setItems((prev) => prev.filter((i) => cartLineKey(i) !== lineKey)),
    [],
  );

  const updateQuantity = useCallback(
    (lineKey: string, quantity: number) => {
      if (quantity <= 0) {
        removeFromCart(lineKey);
        return;
      }
      setItems((prev) =>
        prev.map((i) => (cartLineKey(i) === lineKey ? { ...i, quantity } : i)),
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

  // Auto-remove an applied voucher when the subtotal drops below the
  // promo's minSpend (e.g. customer removes items from cart). Without
  // this, the discount stays visually applied but the server would
  // reject the order for not meeting the minimum spend.
  useEffect(() => {
    if (!voucher.applied || !voucher.code) return;
    const promo = config.promoCodes.find((p) => p.code === voucher.code);
    if (!promo) return;
    if (promo.minSpend > 0 && subtotal < promo.minSpend) {
      removeVoucher();
      toast.info(
        `Voucher "${voucher.code}" removed — minimum spend of ₱${promo.minSpend.toLocaleString()} not met.`,
      );
    }
  }, [
    voucher.applied,
    voucher.code,
    subtotal,
    config.promoCodes,
    removeVoucher,
  ]);

  // Check each cart item's current availability against the product
  // catalog. Items that are sold, reserved, or draft are flagged so
  // the CartDrawer can render warning badges and the checkout button
  // can be disabled.
  const unavailableItems = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) {
      const product = products.find((p) => p.id === item.id);
      if (!product) continue;
      const avail = getAvailability(product);
      if (!isPurchasable(avail)) {
        map.set(item.id, avail);
      }
    }
    return map;
  }, [items, products]);
  const hasUnavailableItems = unavailableItems.size > 0;

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
        // Flip to true once the server-side POST below confirms. If the
        // POST silently fails (Cloudflare challenge, body-size cap,
        // network blip), the boot retry effect picks the order up and
        // re-POSTs on the next page load until it sticks.
        serverSynced: false,
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
          // 200 = first-time accept. 409 = server already has this id
          // (e.g. retry succeeded earlier in this same session). Both
          // mean the order is on the server — flip the flag and stop
          // retrying it.
          if (!res.ok && res.status !== 409) {
            throw new Error(`HTTP ${res.status}`);
          }
          markOrderSyncedRef.current(order.id);
        })
        .catch((err) => {
          console.error("Order sync failed:", err);
          import("sonner").then(({ toast }) =>
            toast.warning(
              "Order saved on this device but could not reach the server. We'll auto-retry the next time you open the site.",
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

  // Manually re-attempt the place POST for a single order. Surfaces the
  // server's actual error so `MyOrders` can show a useful diagnostic
  // chip ("Server says: voucher self-redemption not allowed") instead
  // of silently retrying forever in the background.
  const resyncOrder = useCallback(
    async (
      orderId: string,
    ): Promise<
      { ok: true } | { ok: false; error: string; status?: number }
    > => {
      const order = ordersRef.current.find((o) => o.id === orderId);
      if (!order) return { ok: false, error: "Order not found locally" };
      try {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: jsonAuthHeaders(),
          body: JSON.stringify({ action: "resync", order }),
        });
        if (res.ok || res.status === 409) {
          markOrderSyncedRef.current(orderId);
          return { ok: true };
        }
        let serverError = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          if (data && typeof data.error === "string") {
            serverError = data.error;
          }
        } catch {
          /* response wasn't JSON */
        }
        return { ok: false, error: serverError, status: res.status };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Network error",
        };
      }
    },
    [],
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
      resyncOrder,
      orderNeedsSync,
      showConfirmation,
      setShowConfirmation,
      checkoutCourier: checkoutShipping.courier,
      checkoutZone: checkoutShipping.zone,
      setCheckoutShipping,
      unavailableItems,
      hasUnavailableItems,
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
      resyncOrder,
      showConfirmation,
      checkoutShipping.courier,
      checkoutShipping.zone,
      unavailableItems,
      hasUnavailableItems,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
};
