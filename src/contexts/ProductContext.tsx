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
  /**
   * Lowercase hex SHA-256 of the compressed image bytes. Set by the
   * upload pipeline; absent on legacy entries (those fall back to
   * title-only dedupe). See `src/lib/imageHash.ts`.
   */
  hash?: string;
  /**
   * Multi-size variants (WebP) emitted by the upload pipeline.
   * `sm` ≈ 400 px wide (gallery thumbnails / cart rows),
   * `md` ≈ 800 px wide (rails + product detail on phones),
   * `lg` ≈ 1600 px wide (full-screen lightbox / zoom).
   * Absent on legacy entries — render sites fall back to `url`.
   * See `src/lib/productImage.ts`.
   */
  urls?: {
    sm?: string;
    md?: string;
    lg?: string;
  };
  /**
   * Intrinsic dimensions of the largest variant. Set on entries that
   * went through the multi-variant upload path. Used to set
   * `<img width height>` so the browser reserves the slot before the
   * bytes land (Cumulative Layout Shift fix).
   */
  dims?: {
    w: number;
    h: number;
  };
}

export const PRODUCT_MAX_IMAGES = 5;

/**
 * Optional process / studio video attached to a product. One per
 * product. The storefront viewer renders a "play" tile in the gallery
 * thumbnail strip when this is set; clicking it switches the hero slot
 * to a `<video controls>` player. `posterUrl` is shown on the tile and
 * as the video's `poster` attribute while it loads.
 *
 * Either uploaded directly to R2 via `/api/video-uploads` (in which
 * case `url` is `/api/r/products/videos/...`) or pasted as a public
 * https:// URL pointing at any external host (Mux, Cloudinary, etc.).
 */
export interface ProductVideo {
  url: string;
  posterUrl?: string;
  fileName?: string;
  bytes?: number;
  /**
   * Reported by the upload pipeline (e.g. "video/mp4"). Used to set the
   * `<source type>` so the browser doesn't have to sniff the bytes.
   * Absent on entries pasted as plain URLs — the browser still plays
   * those, it just has to detect the type itself.
   */
  mimeType?: string;
}

export type ProductAvailability =
  | "available"
  | "made-to-order"
  | "reserved"
  | "sold"
  | "draft";

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
  /**
   * Hex SHA-256 of the primary image bytes, mirrored from
   * `images[0].hash`. Stored at the top level so the dedupe check on
   * a new upload can compare without rehydrating each image entry.
   * Absent on legacy products that pre-date the hashing pipeline.
   */
  imageHash?: string;
  availability?: ProductAvailability;
  /**
   * When set, this custom product overrides a default (built-in) artwork with
   * the matching `defaultArtworks` id. The storefront replaces the default
   * with this product; in admin, the default shows as "Overridden" and can be
   * reverted by deleting this product.
   */
  replacesDefaultId?: string;
  /**
   * VIP-only embargo: ISO timestamp until which only customers with
   * `vipEarlyAccess` see this product. After the deadline the artwork
   * is visible to everyone like a normal listing.
   */
  embargoUntil?: string;
  /**
   * Optional studio / process video shown alongside the product photos
   * in the storefront viewer. See `ProductVideo`. Hidden by the viewer
   * when absent or when `url` is empty.
   */
  video?: ProductVideo;
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
  | "imageHash"
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
    imageHash: first?.hash,
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
  /**
   * `true` after the first `/api/products` GET resolves (success OR
   * failure). Pages that look up a product by id should treat
   * `undefined` artwork as "still loading" until this flips to true,
   * so a deep-linked detail page (or a phone with an empty local
   * cache) doesn't flash a 404 before the network response lands.
   */
  productsLoaded: boolean;
  addProduct: (product: Omit<Product, "id" | "createdAt">) => Promise<void>;
  updateProduct: (id: string, product: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  bulkUpdateProducts: (
    ids: string[],
    updates: Partial<
      Pick<
        Product,
        "price" | "salePrice" | "availability" | "category" | "medium"
      >
    >,
  ) => Promise<void>;
}

const ProductContext = createContext<ProductContextType | undefined>(undefined);
const STORAGE_KEY = "canvhub_products";
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
  // `productsLoaded` flips to true once the first `/api/products`
  // response (success or failure) lands, so consumers can tell the
  // difference between "still fetching" and "fetched, no match".
  const [productsLoaded, setProductsLoaded] = useState(false);

  const persistProducts = useCallback((nextProducts: Product[]) => {
    if (typeof window === "undefined") return;
    // The cache is purely an offline accelerator — KV is the source of
    // truth and a fresh `/api/products` fetch happens on every page
    // load. So a quota error must never surface; just degrade
    // gracefully. A few uploads with R2 unavailable produce ~2 MB of
    // base64 each, which blows past the ~5 MB localStorage cap on most
    // browsers and used to crash the admin page on the next render.
    const writeOrIgnore = (payload: string): boolean => {
      try {
        localStorage.setItem(STORAGE_KEY, payload);
        return true;
      } catch {
        return false;
      }
    };
    if (writeOrIgnore(JSON.stringify(nextProducts))) return;
    // Quota exceeded — try again with embedded base64 image data
    // stripped, so at least metadata + http(s) URLs still survive a
    // page reload while we wait for the next /api/products fetch.
    const stripped = nextProducts.map((p) => {
      const out: Product = { ...p };
      if (out.image && out.image.startsWith("data:")) out.image = "";
      if (out.mockup && out.mockup.startsWith("data:")) out.mockup = undefined;
      if (out.images) {
        out.images = out.images
          .map((img) =>
            img.url && img.url.startsWith("data:") ? { ...img, url: "" } : img,
          )
          .filter((img) => img.url);
      }
      return out;
    });
    if (writeOrIgnore(JSON.stringify(stripped))) return;
    // Still too big — clear the key entirely. Next /api/products
    // response will repopulate it (or the next persist will fit).
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing more we can do here.
    }
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
  // AbortController tied to the most recent in-flight loadProducts call.
  // Mutations (add/update/delete) abort it just before applying their
  // optimistic update so that a poll/visibility/broadcast-triggered fetch
  // started moments earlier can't overwrite the optimistic state with
  // stale server data once it resolves.
  const loadAbortRef = useRef<AbortController | null>(null);

  const loadProducts = useCallback(async () => {
    // Replace any earlier in-flight controller so we never have two
    // concurrent loads racing each other.
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    try {
      const response = await fetch(PRODUCTS_API, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Failed to load products");
      const data = await response.json();
      if (!Array.isArray(data.products) || controller.signal.aborted) return;
      const next = sortProducts(data.products);
      setProducts(next);
      productsRef.current = next;
      persistProducts(next);
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      // Local development falls back to browser storage.
    } finally {
      if (loadAbortRef.current === controller) loadAbortRef.current = null;
      // Either way, the first attempt has completed — flip
      // `productsLoaded` so consumers stop showing a loading state.
      // Aborts (a newer load superseded us) don't count as a
      // completed load, so check the controller is still ours.
      if (!controller.signal.aborted) {
        setProductsLoaded(true);
      }
    }
  }, [persistProducts]);

  // Mutations call this immediately before their optimistic update so any
  // already-in-flight load can't race them. After abort, loadAbortRef is
  // null and the next scheduled load (poll / visibility / broadcast) will
  // create a fresh controller.
  const cancelInFlightLoad = useCallback(() => {
    loadAbortRef.current?.abort();
    loadAbortRef.current = null;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    void loadProducts();

    // 5 min cadence — at 30s, every poll round-trips ~5–10 MB of base64-
    // encoded product images (because R2 isn't configured yet, so images
    // ride inline in the products payload), which on a phone on cellular
    // burns ~600 MB/hour per active tab and stutters the main thread.
    // Mutations broadcast via `canvhub_products` BroadcastChannel and the
    // visibility/online listeners below already trigger a refetch, so a
    // long base poll is purely belt-and-braces against missed broadcasts
    // (e.g. another admin in a different browser).
    const POLL_MS = 300_000;
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
      channel = new BroadcastChannel("canvhub_products");
      channelRef.current = channel;
      channel.addEventListener("message", (event: MessageEvent) => {
        if (event?.data?.type === "changed") void loadProducts();
      });
    }

    return () => {
      // Abort any in-flight load so it can't write stale data into
      // localStorage / productsRef after unmount.
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
      window.clearInterval(timer);
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

      cancelInFlightLoad();
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
    [setAndPersistProducts, broadcastChange, cancelInFlightLoad],
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

      cancelInFlightLoad();
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
    [setAndPersistProducts, broadcastChange, cancelInFlightLoad],
  );

  const deleteProduct = useCallback(
    async (id: string) => {
      const removed = productsRef.current.find((product) => product.id === id);
      if (!removed) return;

      cancelInFlightLoad();
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
    [setAndPersistProducts, broadcastChange, cancelInFlightLoad],
  );

  const bulkUpdateProducts = useCallback(
    async (
      ids: string[],
      updates: Partial<
        Pick<
          Product,
          "price" | "salePrice" | "availability" | "category" | "medium"
        >
      >,
    ) => {
      if (!ids.length) return;
      const idSet = new Set(ids);
      const snapshots = productsRef.current.filter((p) => idSet.has(p.id));
      if (!snapshots.length) return;

      cancelInFlightLoad();
      setAndPersistProducts((prev) =>
        prev.map((p) => (idSet.has(p.id) ? { ...p, ...updates } : p)),
      );

      const rollback = () =>
        setAndPersistProducts((prev) =>
          prev.map((p) => {
            const snap = snapshots.find((s) => s.id === p.id);
            return snap ?? p;
          }),
        );

      const token = getAdminToken();
      if (!token) {
        rollback();
        throw new Error("Not authenticated");
      }

      let response: Response;
      try {
        response = await fetch(PRODUCTS_API, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ ids, updates }),
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
            : "Could not bulk-update products",
        );
      }
      broadcastChange();
    },
    [setAndPersistProducts, broadcastChange, cancelInFlightLoad],
  );

  return (
    <ProductContext.Provider
      value={{
        products,
        productsLoaded,
        addProduct,
        updateProduct,
        deleteProduct,
        bulkUpdateProducts,
      }}
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
