import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getAdminToken } from "@/contexts/AdminAuthContext";

export interface ProductImage {
  url: string;
  fileName?: string;
  bytes?: number;
}

export const PRODUCT_MAX_IMAGES = 5;

export type ProductAvailability = "available" | "reserved" | "sold" | "draft";

export interface Product {
  id: string;
  image: string;
  mockup?: string;
  title: string;
  medium: string;
  year: string;
  price: number;
  salePrice?: number;
  description: string;
  createdAt: string;
  category?: string;
  dimensions?: string;
  images?: ProductImage[];
  imageFileName?: string;
  imageBytes?: number;
  mockupFileName?: string;
  mockupBytes?: number;
  availability?: ProductAvailability;
  /**
   * When set, this custom product overrides a default (built-in) artwork with
   * the matching `defaultArtworks` id. The storefront replaces the default
   * with this product; in admin, the default shows as "Overridden" and can be
   * reverted by deleting this product.
   */
  replacesDefaultId?: string;
}

export const PRODUCT_CATEGORIES = [
  "Abstract",
  "Landscape",
  "Portrait",
  "Still Life",
  "Modern",
  "Surrealism",
  "Impressionism",
  "Other",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const getProductImages = (
  p: Pick<
    Product,
    | "image"
    | "mockup"
    | "images"
    | "imageFileName"
    | "imageBytes"
    | "mockupFileName"
    | "mockupBytes"
  >,
): ProductImage[] => {
  if (p.images && p.images.length > 0) {
    return p.images.slice(0, PRODUCT_MAX_IMAGES);
  }
  const arr: ProductImage[] = [];
  if (p.image) {
    arr.push({
      url: p.image,
      fileName: p.imageFileName,
      bytes: p.imageBytes,
    });
  }
  if (p.mockup) {
    arr.push({
      url: p.mockup,
      fileName: p.mockupFileName,
      bytes: p.mockupBytes,
    });
  }
  return arr;
};

export const buildImageFields = (
  images: ProductImage[],
): Pick<
  Product,
  | "image"
  | "mockup"
  | "imageFileName"
  | "imageBytes"
  | "mockupFileName"
  | "mockupBytes"
  | "images"
> => {
  const trimmed = images.slice(0, PRODUCT_MAX_IMAGES);
  const [first, second] = trimmed;
  return {
    image: first?.url ?? "",
    mockup: second?.url || undefined,
    imageFileName: first?.fileName,
    imageBytes: first?.bytes,
    mockupFileName: second?.fileName,
    mockupBytes: second?.bytes,
    images: trimmed,
  };
};

export const getEffectivePrice = (product: {
  price: number;
  salePrice?: number;
}): number => {
  if (
    product.salePrice != null &&
    product.salePrice > 0 &&
    product.salePrice < product.price
  ) {
    return product.salePrice;
  }
  return product.price;
};

export const getDiscountPercent = (product: {
  price: number;
  salePrice?: number;
}): number => {
  if (
    product.salePrice != null &&
    product.salePrice > 0 &&
    product.salePrice < product.price
  ) {
    return Math.round(
      ((product.price - product.salePrice) / product.price) * 100,
    );
  }
  return 0;
};

interface ProductContextType {
  products: Product[];
  addProduct: (product: Omit<Product, "id" | "createdAt">) => Promise<void>;
  updateProduct: (id: string, product: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
}

const ProductContext = createContext<ProductContextType | undefined>(undefined);
const STORAGE_KEY = "pintaterra_products";
const PRODUCTS_API = "/api/products";

const readStoredProducts = (): Product[] => {
  if (typeof window === "undefined") return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const sortProducts = (products: Product[]) =>
  [...products].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

export const ProductProvider = ({ children }: { children: ReactNode }) => {
  const [products, setProducts] = useState<Product[]>(() =>
    sortProducts(readStoredProducts()),
  );
  const productsRef = useRef<Product[]>(products);

  const persistProducts = useCallback((nextProducts: Product[]) => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextProducts));
  }, []);

  const setAndPersistProducts = useCallback(
    (updater: (previous: Product[]) => Product[]) => {
      setProducts((previous) => {
        const next = sortProducts(updater(previous));
        productsRef.current = next;
        persistProducts(next);
        return next;
      });
    },
    [persistProducts],
  );

  // Live-sync the customer-facing gallery with admin edits made from
  // another tab or another device. Strategy:
  //   1. Initial fetch on mount.
  //   2. Refetch on tab refocus (`visibilitychange` -> "visible").
  //   3. Background poll every 30s while the tab is visible.
  //   4. Cross-tab `BroadcastChannel` so an admin POST in *this* browser
  //      immediately tells the customer tab to refetch (no 30s wait).
  const channelRef = useRef<BroadcastChannel | null>(null);

  const loadProducts = useCallback(async () => {
    try {
      const response = await fetch(PRODUCTS_API);
      if (!response.ok) throw new Error("Failed to load products");
      const data = await response.json();
      if (!Array.isArray(data.products)) return;
      const next = sortProducts(data.products);
      setProducts(next);
      productsRef.current = next;
      persistProducts(next);
    } catch {
      // Local development falls back to browser storage.
    }
  }, [persistProducts]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    void loadProducts();

    const POLL_MS = 30_000;
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      void loadProducts();
    };
    const timer = window.setInterval(poll, POLL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") void loadProducts();
    };
    const onOnline = () => {
      void loadProducts();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel("pintaterra_products");
      channelRef.current = channel;
      channel.addEventListener("message", (event: MessageEvent) => {
        if (event?.data?.type === "changed") void loadProducts();
      });
    }

    return () => {
      if (timer) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      if (channel) channel.close();
      channelRef.current = null;
    };
  }, [loadProducts]);

  // Tell other tabs (and our own next render cycle) that the products
  // list changed. Called by add/update/delete after the server confirms.
  const broadcastChange = useCallback(() => {
    try {
      channelRef.current?.postMessage({ type: "changed", at: Date.now() });
    } catch {
      /* channel may already be closed; safe to ignore */
    }
  }, []);

  const addProduct = useCallback(
    async (product: Omit<Product, "id" | "createdAt">) => {
      const nextProduct: Product = {
        ...product,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };

      setAndPersistProducts((previous) => [nextProduct, ...previous]);

      const rollback = () =>
        setAndPersistProducts((previous) =>
          previous.filter((p) => p.id !== nextProduct.id),
        );

      const token = getAdminToken();
      if (!token) {
        rollback();
        throw new Error("Not authenticated");
      }

      let response: Response;
      try {
        response = await fetch(PRODUCTS_API, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(nextProduct),
        });
      } catch (error) {
        rollback();
        throw error;
      }

      if (!response.ok) {
        rollback();
        throw new Error(
          response.status === 401
            ? "Session expired — please log in again"
            : "Could not save product",
        );
      }
      broadcastChange();
    },
    [setAndPersistProducts, broadcastChange],
  );

  const updateProduct = useCallback(
    async (id: string, updates: Partial<Product>) => {
      const existing = productsRef.current.find((product) => product.id === id);
      if (!existing) return;

      const nextProduct: Product = {
        ...existing,
        ...updates,
        id: existing.id,
        createdAt: existing.createdAt,
      };

      setAndPersistProducts((previous) =>
        previous.map((product) => (product.id === id ? nextProduct : product)),
      );

      const rollback = () =>
        setAndPersistProducts((previous) =>
          previous.map((product) => (product.id === id ? existing : product)),
        );

      const token = getAdminToken();
      if (!token) {
        rollback();
        throw new Error("Not authenticated");
      }

      let response: Response;
      try {
        response = await fetch(PRODUCTS_API, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(nextProduct),
        });
      } catch (error) {
        rollback();
        throw error;
      }

      if (!response.ok) {
        rollback();
        throw new Error(
          response.status === 401
            ? "Session expired — please log in again"
            : "Could not update product",
        );
      }
      broadcastChange();
    },
    [setAndPersistProducts, broadcastChange],
  );

  const deleteProduct = useCallback(
    async (id: string) => {
      const removed = productsRef.current.find((product) => product.id === id);
      if (!removed) return;

      setAndPersistProducts((previous) =>
        previous.filter((product) => product.id !== id),
      );

      const rollback = () =>
        setAndPersistProducts((previous) =>
          previous.some((product) => product.id === removed.id)
            ? previous
            : [removed, ...previous],
        );

      const token = getAdminToken();
      if (!token) {
        rollback();
        throw new Error("Not authenticated");
      }

      let response: Response;
      try {
        response = await fetch(PRODUCTS_API, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ id }),
        });
      } catch (error) {
        rollback();
        throw error;
      }

      if (!response.ok) {
        rollback();
        throw new Error(
          response.status === 401
            ? "Session expired — please log in again"
            : "Could not delete product",
        );
      }
      broadcastChange();
    },
    [setAndPersistProducts, broadcastChange],
  );

  return (
    <ProductContext.Provider
      value={{ products, addProduct, updateProduct, deleteProduct }}
    >
      {children}
    </ProductContext.Provider>
  );
};

export const useProducts = () => {
  const context = useContext(ProductContext);
  if (!context)
    throw new Error("useProducts must be used within ProductProvider");
  return context;
};
