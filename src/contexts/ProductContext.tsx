import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface Product {
  id: string;
  image: string;
  mockup?: string;
  title: string;
  medium: string;
  year: string;
  price: number;
  description: string;
  createdAt: string;
}

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

  const persistProducts = useCallback((nextProducts: Product[]) => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextProducts));
  }, []);

  const setAndPersistProducts = useCallback(
    (updater: (previous: Product[]) => Product[]) => {
      setProducts((previous) => {
        const next = sortProducts(updater(previous));
        persistProducts(next);
        return next;
      });
    },
    [persistProducts],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    let isCancelled = false;

    const loadProducts = async () => {
      try {
        const response = await fetch(PRODUCTS_API);
        if (!response.ok) throw new Error("Failed to load products");

        const data = await response.json();
        if (!Array.isArray(data.products) || isCancelled) return;

        const next = sortProducts(data.products);
        setProducts(next);
        persistProducts(next);
      } catch {
        // Local development falls back to browser storage.
      }
    };

    void loadProducts();

    return () => {
      isCancelled = true;
    };
  }, [persistProducts]);

  const addProduct = useCallback(
    async (product: Omit<Product, "id" | "createdAt">) => {
      const nextProduct: Product = {
        ...product,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };

      setAndPersistProducts((previous) => [nextProduct, ...previous]);

      try {
        const response = await fetch(PRODUCTS_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nextProduct),
        });

        if (!response.ok) {
          throw new Error("Could not save product");
        }
      } catch {
        // Browser storage remains as the local fallback.
      }
    },
    [setAndPersistProducts],
  );

  const updateProduct = useCallback(
    async (id: string, updates: Partial<Product>) => {
      let nextProduct: Product | null = null;

      setAndPersistProducts((previous) => {
        const existing = previous.find((product) => product.id === id);
        if (!existing) return previous;

        nextProduct = {
          ...existing,
          ...updates,
          id: existing.id,
          createdAt: existing.createdAt,
        };

        return previous.map((product) =>
          product.id === id ? (nextProduct as Product) : product,
        );
      });

      if (!nextProduct) return;

      try {
        const response = await fetch(PRODUCTS_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nextProduct),
        });

        if (!response.ok) {
          throw new Error("Could not update product");
        }
      } catch {
        // Browser storage remains as the local fallback.
      }
    },
    [setAndPersistProducts],
  );

  const deleteProduct = useCallback(
    async (id: string) => {
      setAndPersistProducts((previous) =>
        previous.filter((product) => product.id !== id),
      );

      try {
        const response = await fetch(PRODUCTS_API, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });

        if (!response.ok) {
          throw new Error("Could not delete product");
        }
      } catch {
        // Browser storage remains as the local fallback.
      }
    },
    [setAndPersistProducts],
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
