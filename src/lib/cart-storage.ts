import type { PaintingSizeCm } from "@/lib/painting-sizes";

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
  sizeCm?: PaintingSizeCm;
}

// Bumped from "canvhub_cart" (v3) when made-to-order size selection
// got wired into the cart line. On first load we read whichever key
// is present, reshape into the v4 schema, and then forget the old
// one — see `loadCartItemsFromStorage` below.
export const CART_STORAGE_KEY = "canvhub_cart_v4";
export const LEGACY_CART_STORAGE_KEY = "canvhub_cart";

// Stable per-line identity. Two entries with the same product id but
// different sizes must collide on neither addToCart-merge nor
// remove/quantity update, so we fold size into the key. Legacy items
// without a size keep the bare product id (the v3 behaviour), so
// guest carts persisted before this change keep merging quantities
// the way users expect.
export const cartLineKey = (
  item: Pick<StoredCartItem, "id" | "sizeCm">,
): string => {
  if (!item.sizeCm) return item.id;
  const w = Math.round(item.sizeCm.widthCm * 10) / 10;
  const h = Math.round(item.sizeCm.heightCm * 10) / 10;
  return `${item.id}::${w}x${h}`;
};

// Clamp to plausible canvas dimensions (0–500 cm per side) so a
// malformed or hostile payload from localStorage can never blow up
// downstream consumers. Returns `undefined` (not null) so it slots
// straight into the optional field on `CartItem`.
export const sanitiseSizeCm = (raw: unknown): PaintingSizeCm | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as { widthCm?: unknown; heightCm?: unknown };
  const w = Number(obj.widthCm);
  const h = Number(obj.heightCm);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return undefined;
  if (w <= 0 || h <= 0 || w > 500 || h > 500) return undefined;
  return {
    widthCm: Math.round(w * 10) / 10,
    heightCm: Math.round(h * 10) / 10,
  };
};

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
  const sizeCm = sanitiseSizeCm(r.sizeCm);
  if (sizeCm) item.sizeCm = sizeCm;
  return item;
};

// Read the persisted cart from localStorage, accepting both the v4
// shape and the legacy unversioned shape (which had no `sizeCm`). On
// migration, the legacy key is removed so we never have two sources
// of truth and so future bumps can repeat the same pattern. Returns
// an empty array (never throws) on any parse / storage failure.
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
