import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CART_STORAGE_KEY,
  LEGACY_CART_STORAGE_KEY,
  cartLineKey,
  loadCartItemsFromStorage,
  sanitiseSizeCm,
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
    it("returns the bare id when no size is set (v3 backward compat)", () => {
      expect(cartLineKey({ id: "art-1" })).toBe("art-1");
    });

    it("appends WxH for sized lines", () => {
      expect(
        cartLineKey({ id: "art-1", sizeCm: { widthCm: 60, heightCm: 90 } }),
      ).toBe("art-1::60x90");
    });

    it("normalises fractional sizes to one decimal so 30 vs 30.0 collide", () => {
      expect(
        cartLineKey({
          id: "art-1",
          sizeCm: { widthCm: 30, heightCm: 40 },
        }),
      ).toBe(
        cartLineKey({
          id: "art-1",
          sizeCm: { widthCm: 30.0, heightCm: 40.0 },
        }),
      );
    });

    it("treats different sizes as distinct lines", () => {
      const a = cartLineKey({
        id: "art-1",
        sizeCm: { widthCm: 30, heightCm: 40 },
      });
      const b = cartLineKey({
        id: "art-1",
        sizeCm: { widthCm: 60, heightCm: 90 },
      });
      expect(a).not.toBe(b);
    });

    it("treats the same size on different products as distinct lines", () => {
      const a = cartLineKey({
        id: "art-1",
        sizeCm: { widthCm: 60, heightCm: 90 },
      });
      const b = cartLineKey({
        id: "art-2",
        sizeCm: { widthCm: 60, heightCm: 90 },
      });
      expect(a).not.toBe(b);
    });
  });

  describe("sanitiseSizeCm", () => {
    it("returns undefined for null/undefined/non-object input", () => {
      expect(sanitiseSizeCm(null)).toBeUndefined();
      expect(sanitiseSizeCm(undefined)).toBeUndefined();
      expect(sanitiseSizeCm("60x90")).toBeUndefined();
      expect(sanitiseSizeCm(42)).toBeUndefined();
    });

    it("returns undefined for non-finite or non-positive dimensions", () => {
      expect(sanitiseSizeCm({ widthCm: NaN, heightCm: 90 })).toBeUndefined();
      expect(
        sanitiseSizeCm({ widthCm: Infinity, heightCm: 90 }),
      ).toBeUndefined();
      expect(sanitiseSizeCm({ widthCm: 0, heightCm: 90 })).toBeUndefined();
      expect(sanitiseSizeCm({ widthCm: -10, heightCm: 90 })).toBeUndefined();
    });

    it("returns undefined for dimensions exceeding 500 cm (paranoia clamp)", () => {
      expect(sanitiseSizeCm({ widthCm: 501, heightCm: 90 })).toBeUndefined();
      expect(sanitiseSizeCm({ widthCm: 60, heightCm: 999 })).toBeUndefined();
    });

    it("accepts string-coerceable numbers (defensive)", () => {
      expect(sanitiseSizeCm({ widthCm: "60", heightCm: "90" })).toEqual({
        widthCm: 60,
        heightCm: 90,
      });
    });

    it("rounds to one decimal so storage keys stay stable", () => {
      expect(sanitiseSizeCm({ widthCm: 60.444, heightCm: 89.555 })).toEqual({
        widthCm: 60.4,
        heightCm: 89.6,
      });
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
      expect(item?.sizeCm).toBeUndefined();
    });

    it("preserves a valid sizeCm field on round-trip", () => {
      const item = sanitiseStoredItem({
        id: "art-1",
        price: 4500,
        quantity: 2,
        sizeCm: { widthCm: 60, heightCm: 90 },
      });
      expect(item?.sizeCm).toEqual({ widthCm: 60, heightCm: 90 });
      expect(item?.quantity).toBe(2);
    });

    it("drops an invalid sizeCm without rejecting the whole line", () => {
      const item = sanitiseStoredItem({
        id: "art-1",
        sizeCm: { widthCm: -1, heightCm: 90 },
      });
      expect(item?.id).toBe("art-1");
      expect(item?.sizeCm).toBeUndefined();
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
            sizeCm: { widthCm: 60, heightCm: 90 },
          },
        ]),
      );
      const items = loadCartItemsFromStorage();
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe("art-1");
      expect(items[0].sizeCm).toEqual({ widthCm: 60, heightCm: 90 });
    });

    it("migrates a legacy v3 cart (no sizeCm) and removes the old key", () => {
      window.localStorage.setItem(
        LEGACY_CART_STORAGE_KEY,
        JSON.stringify([
          { id: "art-1", price: 4500, quantity: 2 },
          { id: "art-2", price: 6500, quantity: 1 },
        ]),
      );
      const items = loadCartItemsFromStorage();
      expect(items).toHaveLength(2);
      expect(items[0].sizeCm).toBeUndefined();
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
  });
});
