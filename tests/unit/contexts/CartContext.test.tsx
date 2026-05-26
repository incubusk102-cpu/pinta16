// @vitest-environment happy-dom
//
// Component test for `<CartProvider>` and `useCart()`. Covers the
// public cart hook surface — addToCart / removeFromCart /
// updateQuantity / clearCart / voucher application / cart-drawer
// open/close. The storefront-config, user-auth, and product
// contexts are mocked so the provider can be mounted on its own,
// without dragging in the full app tree.

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

const useUserAuthMock = vi.fn();
const useProductsMock = vi.fn();
const useStorefrontConfigMock = vi.fn();

vi.mock("@/contexts/UserAuthContext", () => ({
  useUserAuth: () => useUserAuthMock(),
}));
vi.mock("@/contexts/ProductContext", () => ({
  useProducts: () => useProductsMock(),
}));
vi.mock("@/contexts/StorefrontConfigContext", () => ({
  useStorefrontConfig: () => useStorefrontConfigMock(),
}));
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
    message: vi.fn(),
  },
}));
vi.mock("@/lib/api", () => ({
  jsonAuthHeaders: () => ({ "Content-Type": "application/json" }),
}));

import {
  CART_STORAGE_KEY,
  CartProvider,
  useCart,
  type CartItem,
} from "@/contexts/CartContext";

type ProbeHandle = ReturnType<typeof useCart>;
const probeRef: { current: ProbeHandle | null } = { current: null };

const Probe = () => {
  // The lint rule flags writing to a module-scoped object inside a
  // component render. We do it on purpose so individual tests can
  // poke the hook surface without re-rendering — `probeRef` mirrors
  // the React `MutableRefObject` shape and is reset between tests.
  // eslint-disable-next-line react-hooks/immutability
  probeRef.current = useCart();
  return null;
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const baseItem: Omit<CartItem, "quantity"> = {
  id: "p-1",
  title: "Sunrise",
  image: "/p-1.webp",
  price: 4500,
  category: "Original",
};

const otherItem: Omit<CartItem, "quantity"> = {
  id: "p-2",
  title: "Sunset",
  image: "/p-2.webp",
  price: 6500,
  category: "Original",
};

const mount = async (children: ReactNode) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<CartProvider>{children}</CartProvider>);
  });
};

const unmount = async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
  probeRef.current = null;
};

const flushAsync = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const defaultConfig = () => ({
  config: {
    freeShipping: {
      enabled: true,
      threshold: 8000,
      shippingFee: 500,
    },
    promoCodes: [],
    vacationMode: { enabled: false },
    lalamoveFare: {
      base: 100,
      perKm: 10,
      baseKm: 5,
      surchargePerKg: 0,
      maxFare: 2000,
    },
    shippingRates: [],
  },
});

beforeEach(() => {
  localStorage.clear();
  useUserAuthMock.mockReturnValue({ user: null, token: null });
  useProductsMock.mockReturnValue({ products: [], productsLoaded: true });
  useStorefrontConfigMock.mockReturnValue(defaultConfig());
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("[]", { status: 200 })) as unknown as Mock,
  );
});

afterEach(async () => {
  await unmount();
  vi.unstubAllGlobals();
  useUserAuthMock.mockReset();
  useProductsMock.mockReset();
  useStorefrontConfigMock.mockReset();
});

describe("CartProvider — initial state", () => {
  it("starts empty when localStorage is empty", async () => {
    await mount(<Probe />);
    expect(probeRef.current!.items).toEqual([]);
    expect(probeRef.current!.isOpen).toBe(false);
    expect(probeRef.current!.showCheckout).toBe(false);
    expect(probeRef.current!.showConfirmation).toBe(false);
  });

  it("hydrates cart items from localStorage on first mount", async () => {
    localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify([{ ...baseItem, quantity: 2 }]),
    );
    await mount(<Probe />);
    expect(probeRef.current!.items).toHaveLength(1);
    expect(probeRef.current!.items[0].id).toBe("p-1");
    expect(probeRef.current!.items[0].quantity).toBe(2);
  });

  it("ignores malformed localStorage payloads", async () => {
    localStorage.setItem(CART_STORAGE_KEY, "not-json{{{");
    await mount(<Probe />);
    expect(probeRef.current!.items).toEqual([]);
  });
});

describe("CartProvider — addToCart", () => {
  it("inserts a new line at quantity=1 and opens the drawer", async () => {
    await mount(<Probe />);
    await act(async () => {
      probeRef.current!.addToCart(baseItem);
    });
    expect(probeRef.current!.items).toHaveLength(1);
    expect(probeRef.current!.items[0]).toMatchObject({
      id: "p-1",
      quantity: 1,
    });
    expect(probeRef.current!.isOpen).toBe(true);
  });

  it("increments an existing line instead of duplicating it", async () => {
    await mount(<Probe />);
    await act(async () => {
      probeRef.current!.addToCart(baseItem);
      probeRef.current!.addToCart(baseItem);
      probeRef.current!.addToCart(baseItem);
    });
    expect(probeRef.current!.items).toHaveLength(1);
    expect(probeRef.current!.items[0].quantity).toBe(3);
  });

  it("treats different product ids as different lines", async () => {
    await mount(<Probe />);
    await act(async () => {
      probeRef.current!.addToCart(baseItem);
      probeRef.current!.addToCart(otherItem);
    });
    expect(probeRef.current!.items).toHaveLength(2);
    expect(probeRef.current!.items.map((i) => i.id)).toEqual(["p-1", "p-2"]);
  });

  it("persists cart updates to localStorage", async () => {
    await mount(<Probe />);
    await act(async () => {
      probeRef.current!.addToCart(baseItem);
    });
    await flushAsync();
    const persisted = JSON.parse(
      localStorage.getItem(CART_STORAGE_KEY) || "[]",
    );
    expect(persisted).toHaveLength(1);
    expect(persisted[0].id).toBe("p-1");
  });
});

describe("CartProvider — removeFromCart + updateQuantity", () => {
  it("removeFromCart drops the line by line-key", async () => {
    await mount(<Probe />);
    await act(async () => {
      probeRef.current!.addToCart(baseItem);
      probeRef.current!.addToCart(otherItem);
    });
    await act(async () => {
      probeRef.current!.removeFromCart("p-1");
    });
    expect(probeRef.current!.items).toHaveLength(1);
    expect(probeRef.current!.items[0].id).toBe("p-2");
  });

  it("updateQuantity sets the quantity on the matching line", async () => {
    await mount(<Probe />);
    await act(async () => {
      probeRef.current!.addToCart(baseItem);
    });
    await act(async () => {
      probeRef.current!.updateQuantity("p-1", 5);
    });
    expect(probeRef.current!.items[0].quantity).toBe(5);
  });

  it("updateQuantity removes the line when the new quantity is 0", async () => {
    await mount(<Probe />);
    await act(async () => {
      probeRef.current!.addToCart(baseItem);
    });
    await act(async () => {
      probeRef.current!.updateQuantity("p-1", 0);
    });
    expect(probeRef.current!.items).toEqual([]);
  });

  it("updateQuantity removes the line when the new quantity is negative", async () => {
    await mount(<Probe />);
    await act(async () => {
      probeRef.current!.addToCart(baseItem);
    });
    await act(async () => {
      probeRef.current!.updateQuantity("p-1", -3);
    });
    expect(probeRef.current!.items).toEqual([]);
  });
});

describe("CartProvider — clearCart + drawer", () => {
  it("clearCart empties the list and clears localStorage", async () => {
    await mount(<Probe />);
    await act(async () => {
      probeRef.current!.addToCart(baseItem);
      probeRef.current!.addToCart(otherItem);
    });
    await act(async () => {
      probeRef.current!.clearCart();
    });
    await flushAsync();
    expect(probeRef.current!.items).toEqual([]);
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBeNull();
  });

  it("openCart / closeCart toggles the drawer state", async () => {
    await mount(<Probe />);
    expect(probeRef.current!.isOpen).toBe(false);
    await act(async () => {
      probeRef.current!.openCart();
    });
    expect(probeRef.current!.isOpen).toBe(true);
    await act(async () => {
      probeRef.current!.closeCart();
    });
    expect(probeRef.current!.isOpen).toBe(false);
  });

  it("setShowCheckout exposes the public flag for the multi-step checkout flow", async () => {
    await mount(<Probe />);
    expect(probeRef.current!.showCheckout).toBe(false);
    await act(async () => {
      probeRef.current!.setShowCheckout(true);
    });
    expect(probeRef.current!.showCheckout).toBe(true);
    await act(async () => {
      probeRef.current!.setShowCheckout(false);
    });
    expect(probeRef.current!.showCheckout).toBe(false);
  });
});

describe("CartProvider — voucher", () => {
  it("rejects an unknown promo code", async () => {
    useStorefrontConfigMock.mockReturnValue({
      ...defaultConfig(),
      config: {
        ...defaultConfig().config,
        promoCodes: [],
      },
    });
    await mount(<Probe />);
    await act(async () => {
      probeRef.current!.applyVoucher("BOGUS");
    });
    expect(probeRef.current!.voucher.applied).toBe(false);
    expect(probeRef.current!.voucher.error).toMatch(/invalid/i);
  });

  it("applies a percent-off promo code that's currently valid", async () => {
    useStorefrontConfigMock.mockReturnValue({
      config: {
        ...defaultConfig().config,
        promoCodes: [
          {
            code: "SAVE10",
            type: "percent",
            value: 10,
            description: "10% off everything",
            minSpend: 0,
            startsAt: "",
            expiresAt: "",
            usageLimit: 0,
            usageCount: 0,
            active: true,
          },
        ],
      },
    });
    await mount(<Probe />);
    await act(async () => {
      probeRef.current!.addToCart(baseItem);
    });
    await act(async () => {
      probeRef.current!.applyVoucher("save10");
    });
    expect(probeRef.current!.voucher.applied).toBe(true);
    expect(probeRef.current!.voucher.code.toUpperCase()).toBe("SAVE10");
    expect(probeRef.current!.voucher.value).toBe(10);
    expect(probeRef.current!.voucher.error).toBe("");
  });

  it("removeVoucher resets the applied state", async () => {
    useStorefrontConfigMock.mockReturnValue({
      config: {
        ...defaultConfig().config,
        promoCodes: [
          {
            code: "SAVE10",
            type: "percent",
            value: 10,
            description: "",
            minSpend: 0,
            startsAt: "",
            expiresAt: "",
            usageLimit: 0,
            usageCount: 0,
            active: true,
          },
        ],
      },
    });
    await mount(<Probe />);
    await act(async () => {
      probeRef.current!.addToCart(baseItem);
    });
    await act(async () => {
      probeRef.current!.applyVoucher("SAVE10");
    });
    expect(probeRef.current!.voucher.applied).toBe(true);

    await act(async () => {
      probeRef.current!.removeVoucher();
    });
    expect(probeRef.current!.voucher.applied).toBe(false);
    expect(probeRef.current!.voucher.code).toBe("");
  });
});

describe("CartProvider — derived totals", () => {
  it("subtotal sums quantity × effectivePrice across lines", async () => {
    await mount(<Probe />);
    await act(async () => {
      probeRef.current!.addToCart({ ...baseItem, price: 1000 });
      probeRef.current!.addToCart({ ...otherItem, price: 2500 });
      probeRef.current!.addToCart({ ...otherItem, price: 2500 });
    });
    // p-1 × 1 @ 1000 + p-2 × 2 @ 2500 → 1000 + 5000 = 6000
    expect(probeRef.current!.subtotal).toBe(6000);
  });

  it("isFreeShipping flips on once subtotal crosses the threshold", async () => {
    useStorefrontConfigMock.mockReturnValue({
      config: {
        ...defaultConfig().config,
        freeShipping: { enabled: true, threshold: 8000, shippingFee: 500 },
      },
    });
    await mount(<Probe />);
    await act(async () => {
      probeRef.current!.addToCart({ ...baseItem, price: 7500 });
    });
    expect(probeRef.current!.isFreeShipping).toBe(false);
    await act(async () => {
      probeRef.current!.addToCart({ ...baseItem, price: 7500 });
    });
    // 7500 × 2 = 15000 ≥ 8000
    expect(probeRef.current!.isFreeShipping).toBe(true);
  });

  it("treats free-shipping as disabled when config.freeShipping.enabled is false", async () => {
    useStorefrontConfigMock.mockReturnValue({
      config: {
        ...defaultConfig().config,
        freeShipping: { enabled: false, threshold: 0, shippingFee: 500 },
      },
    });
    await mount(<Probe />);
    await act(async () => {
      probeRef.current!.addToCart({ ...baseItem, price: 100000 });
    });
    expect(probeRef.current!.isFreeShipping).toBe(false);
  });
});

describe("CartProvider — user switch", () => {
  it("re-mounts the orders bucket when the active user changes", async () => {
    // Mount as guest first.
    useUserAuthMock.mockReturnValue({ user: null, token: null });
    await mount(<Probe />);
    await act(async () => {
      probeRef.current!.addToCart(baseItem);
    });
    expect(probeRef.current!.items).toHaveLength(1);

    // Switch to a signed-in user.
    useUserAuthMock.mockReturnValue({
      user: { id: "u-1", email: "u@example.com" },
      token: "tok",
    });
    await act(async () => {
      root!.render(
        <CartProvider>
          <Probe />
        </CartProvider>,
      );
    });
    await flushAsync();
    // Cart items survive the auth switch — the cart is browser-bound,
    // not user-bound.
    expect(probeRef.current!.items).toHaveLength(1);
  });
});
