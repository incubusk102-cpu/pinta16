// Shape of a cart line in localStorage. Kept structurally compatible
// with `CartItem` from `@/contexts/CartContext` so consumers can pass
// either type around interchangeably; the context file re-exports
// these helpers so callers don't need to know about this module.
export interface StoredCartItem {
  id: string;
  image: string;
  title: string;
  medium: string;
  year: string;
  price: number;
  quantity: number;
  // Admin-provided dimensions string (e.g. `60 × 90 cm`). Comes
  // straight from the product editor so the cart, checkout, and order
  // emails all show the size the artist set rather than a customer
  // pick. Optional for legacy items added before this field existed.
  dimensions?: string;
}

// localStorage key for the cart. Reads from this key first; falls
// back to the legacy v3 key on first load to migrate older clients.
// See `loadCartItemsFromStorage` for the migration path.
export const CART_STORAGE_KEY = "canvhub_cart_v4";
export const LEGACY_CART_STORAGE_KEY = "canvhub_cart";

// Stable per-line identity. Same product id always collapses to the
// same line so customers see qty bumps rather than duplicate lines —
// dimensions are fixed per artwork (admin-controlled) so there is
// nothing to disambiguate at the cart level.
export const cartLineKey = (item: Pick<StoredCartItem, "id">): string =>
  item.id;

export const sanitiseStoredItem = (raw: unknown): StoredCartItem | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : null;
  if (!id) return null;
  const quantity = Math.max(1, Math.floor(Number(r.quantity) || 1));
  const item: StoredCartItem = {
    id,
    image: typeof r.image === "string" ? r.image : "",
    title: typeof r.title === "string" ? r.title : "",
    medium: typeof r.medium === "string" ? r.medium : "",
    year: typeof r.year === "string" ? r.year : "",
    price: Number(r.price) || 0,
    quantity,
  };
  if (item.price <= 0) {
    console.warn(`[cart-storage] Rejected item "${id}": price must be > 0`);
    return null;
  }
  if (typeof r.dimensions === "string" && r.dimensions.trim()) {
    item.dimensions = r.dimensions.trim().slice(0, 200);
  }
  return item;
};

// Read the persisted cart from localStorage, accepting both the v4
// shape and the legacy unversioned shape. On migration, the legacy
// key is removed so we never have two sources of truth and so future
// bumps can repeat the same pattern. Returns an empty array (never
// throws) on any parse / storage failure.
export const loadCartItemsFromStorage = (): StoredCartItem[] => {
  if (typeof window === "undefined") return [];
  try {
    const current = window.localStorage.getItem(CART_STORAGE_KEY);
    if (current) {
      const parsed = JSON.parse(current);
      if (Array.isArray(parsed)) {
        return parsed
          .map(sanitiseStoredItem)
          .filter((it): it is StoredCartItem => it !== null);
      }
      return [];
    }
    const legacy = window.localStorage.getItem(LEGACY_CART_STORAGE_KEY);
    if (!legacy) return [];
    const parsed = JSON.parse(legacy);
    window.localStorage.removeItem(LEGACY_CART_STORAGE_KEY);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitiseStoredItem)
      .filter((it): it is StoredCartItem => it !== null);
  } catch {
    return [];
  }
};
