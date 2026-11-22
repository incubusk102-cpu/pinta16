import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CART_STORAGE_KEY,
  LEGACY_CART_STORAGE_KEY,
  cartLineKey,
  loadCartItemsFromStorage,
  sanitiseStoredItem,
} from "@/lib/cart-storage";

// Lightweight in-memory replacement for the browser's localStorage so
// the tests can run under the existing node-based Vitest environment.
// Implements just enough of the Storage interface to satisfy the
// helpers under test; storage quota / event semantics are out of
// scope.
const makeMemoryStorage = (): Storage => {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
  };
};

describe("cart-storage", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: makeMemoryStorage() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("cartLineKey", () => {
    it("returns the bare product id (same product collapses to one line)", () => {
      expect(cartLineKey({ id: "art-1" })).toBe("art-1");
    });

    it("treats different products as distinct lines", () => {
      expect(cartLineKey({ id: "art-1" })).not.toBe(
        cartLineKey({ id: "art-2" }),
      );
    });
  });

  describe("sanitiseStoredItem", () => {
    it("returns null when id is missing or not a string", () => {
      expect(sanitiseStoredItem(null)).toBeNull();
      expect(sanitiseStoredItem({})).toBeNull();
      expect(sanitiseStoredItem({ id: 123 })).toBeNull();
    });

    it("fills sensible defaults for missing string fields", () => {
      const item = sanitiseStoredItem({ id: "art-1", price: 4500 });
      expect(item).toMatchObject({
        id: "art-1",
        image: "",
        title: "",
        medium: "",
        year: "",
        price: 4500,
        quantity: 1,
      });
      expect(item?.dimensions).toBeUndefined();
    });

    it("preserves a valid dimensions string on round-trip", () => {
      const item = sanitiseStoredItem({
        id: "art-1",
        price: 4500,
        quantity: 2,
        dimensions: "60 × 90 cm",
      });
      expect(item?.dimensions).toBe("60 × 90 cm");
      expect(item?.quantity).toBe(2);
    });

    it("trims whitespace and clamps long dimensions strings", () => {
      const item = sanitiseStoredItem({
        id: "art-1",
        dimensions: `  ${"a".repeat(500)}  `,
      });
      expect(item?.dimensions?.length).toBe(200);
    });

    it("drops an empty dimensions string", () => {
      const item = sanitiseStoredItem({ id: "art-1", dimensions: "   " });
      expect(item?.dimensions).toBeUndefined();
    });

    it("drops a non-string dimensions value", () => {
      const item = sanitiseStoredItem({ id: "art-1", dimensions: 60 });
      expect(item?.dimensions).toBeUndefined();
    });

    it("floors and clamps quantity to a minimum of 1", () => {
      expect(sanitiseStoredItem({ id: "a", quantity: 0 })?.quantity).toBe(1);
      expect(sanitiseStoredItem({ id: "a", quantity: -5 })?.quantity).toBe(1);
      expect(sanitiseStoredItem({ id: "a", quantity: 3.9 })?.quantity).toBe(3);
      expect(sanitiseStoredItem({ id: "a", quantity: "5" })?.quantity).toBe(5);
    });
  });

  describe("loadCartItemsFromStorage", () => {
    it("returns an empty array when storage is empty", () => {
      expect(loadCartItemsFromStorage()).toEqual([]);
    });

    it("returns the v4 cart when the new key is present", () => {
      window.localStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify([
          {
            id: "art-1",
            price: 4500,
            quantity: 1,
            dimensions: "60 × 90 cm",
          },
        ]),
      );
      const items = loadCartItemsFromStorage();
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe("art-1");
      expect(items[0].dimensions).toBe("60 × 90 cm");
    });

    it("migrates a legacy v3 cart and removes the old key", () => {
      window.localStorage.setItem(
        LEGACY_CART_STORAGE_KEY,
        JSON.stringify([
          { id: "art-1", price: 4500, quantity: 2 },
          { id: "art-2", price: 6500, quantity: 1 },
        ]),
      );
      const items = loadCartItemsFromStorage();
      expect(items).toHaveLength(2);
      expect(items[0].dimensions).toBeUndefined();
      expect(window.localStorage.getItem(LEGACY_CART_STORAGE_KEY)).toBeNull();
    });

    it("prefers v4 over legacy when both keys are present", () => {
      window.localStorage.setItem(
        LEGACY_CART_STORAGE_KEY,
        JSON.stringify([{ id: "legacy-art", price: 1, quantity: 1 }]),
      );
      window.localStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify([{ id: "v4-art", price: 1, quantity: 1 }]),
      );
      const items = loadCartItemsFromStorage();
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe("v4-art");
    });

    it("returns [] (does not throw) when storage holds corrupt JSON", () => {
      window.localStorage.setItem(CART_STORAGE_KEY, "{not valid json");
      expect(loadCartItemsFromStorage()).toEqual([]);
    });

    it("returns [] when the stored payload is not an array", () => {
      window.localStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify({ id: "art-1" }),
      );
      expect(loadCartItemsFromStorage()).toEqual([]);
    });

    it("filters out unsalvageable line items but keeps the rest", () => {
      window.localStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify([
          { id: "art-1", price: 4500, quantity: 1 },
          { id: 123 }, // bad id — drop
          null, // null — drop
          { id: "art-2", price: 6500, quantity: 2 },
        ]),
      );
      const items = loadCartItemsFromStorage();
      expect(items.map((i) => i.id)).toEqual(["art-1", "art-2"]);
    });

    it("ignores a stale sizeCm field on a stored v4 row (forward compat)", () => {
      // Carts persisted under the old size-picker may still have a
      // structured sizeCm. The new sanitiser drops it silently; the
      // line otherwise loads normally so the customer doesn't lose
      // their cart.
      window.localStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify([
          {
            id: "art-1",
            price: 4500,
            quantity: 1,
            sizeCm: { widthCm: 60, heightCm: 90 },
          },
        ]),
      );
      const items = loadCartItemsFromStorage();
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe("art-1");
      expect((items[0] as { sizeCm?: unknown }).sizeCm).toBeUndefined();
    });
  });
});
