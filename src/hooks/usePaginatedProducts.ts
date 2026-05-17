import { useInfiniteQuery } from "@tanstack/react-query";
import type { Product } from "@/contexts/ProductContext";

// Sort key vocabulary the server understands. Kept in sync with
// `functions/api/_lib/product-filter.js → sortProducts`.
export type PaginatedSort =
  | "newest"
  | "oldest"
  | "price-asc"
  | "price-desc"
  | "title-az"
  | "title-za";

export interface PaginatedProductsFilters {
  search?: string;
  /** Single category name or comma-separated list. */
  category?: string;
  /** Single availability token (`in-stock`, `sold`, …) or comma-separated list. */
  availability?: string;
  priceMin?: number;
  priceMax?: number;
  /**
   * Storefront price-band chip ids (`lt-3000`, `3000-3500`, …,
   * `gt-4500`). Multiple buckets union, matching the multi-select
   * UI. The server owns the actual numeric thresholds so both ends
   * can't drift apart.
   */
  priceBuckets?: string[];
}

export interface PaginatedProductsOptions extends PaginatedProductsFilters {
  sort?: PaginatedSort;
  /** Page size for each fetch. Server caps this at 100. */
  limit?: number;
  /** When false, skip the network entirely (e.g. during SSR). */
  enabled?: boolean;
}

interface ProductsPage {
  products: Product[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

const PRODUCTS_API = "/api/products";

// Serialises filter + sort state into URL search params. We treat
// undefined / empty-string / NaN as "not set" so the resulting URL
// stays tidy and the server falls back to its default for that key.
const buildSearchParams = (
  options: PaginatedProductsOptions,
  cursor: string | null,
): URLSearchParams => {
  const params = new URLSearchParams();
  if (options.search?.trim()) params.set("search", options.search.trim());
  if (options.category?.trim()) params.set("category", options.category.trim());
  if (options.availability?.trim()) {
    params.set("availability", options.availability.trim());
  }
  if (
    typeof options.priceMin === "number" &&
    Number.isFinite(options.priceMin)
  ) {
    params.set("priceMin", String(options.priceMin));
  }
  if (
    typeof options.priceMax === "number" &&
    Number.isFinite(options.priceMax)
  ) {
    params.set("priceMax", String(options.priceMax));
  }
  if (options.priceBuckets && options.priceBuckets.length > 0) {
    for (const bucket of options.priceBuckets) {
      if (bucket) params.append("priceBuckets", bucket);
    }
  }
  if (options.sort) params.set("sort", options.sort);
  if (typeof options.limit === "number" && Number.isFinite(options.limit)) {
    params.set("limit", String(options.limit));
  }
  if (cursor) params.set("cursor", cursor);
  return params;
};

const fetchProductsPage = async (
  options: PaginatedProductsOptions,
  cursor: string | null,
  signal: AbortSignal | undefined,
): Promise<ProductsPage> => {
  const params = buildSearchParams(options, cursor);
  const url = params.toString()
    ? `${PRODUCTS_API}?${params.toString()}`
    : PRODUCTS_API;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Failed to load products (${response.status})`);
  }
  const data: unknown = await response.json();
  if (!data || typeof data !== "object") {
    throw new Error("Malformed products response");
  }
  const payload = data as Partial<ProductsPage>;
  return {
    products: Array.isArray(payload.products) ? payload.products : [],
    nextCursor:
      typeof payload.nextCursor === "string" ? payload.nextCursor : null,
    hasMore: Boolean(payload.hasMore),
    total: typeof payload.total === "number" ? payload.total : 0,
  };
};

// Stable, cache-friendly query key. Anything that affects the server
// response goes in here so TanStack Query knows to refetch when the
// shopper flips a filter or sort. We deliberately omit `limit` from
// the key because adjusting the page size shouldn't invalidate
// pages we've already loaded.
const buildQueryKey = (options: PaginatedProductsOptions) =>
  [
    "products",
    "paginated",
    {
      search: options.search?.trim() || "",
      category: options.category?.trim() || "",
      availability: options.availability?.trim() || "",
      priceMin:
        typeof options.priceMin === "number" &&
        Number.isFinite(options.priceMin)
          ? options.priceMin
          : null,
      priceMax:
        typeof options.priceMax === "number" &&
        Number.isFinite(options.priceMax)
          ? options.priceMax
          : null,
      // Sort the bucket list so the cache key is stable regardless
      // of the order the UI happens to hand them to us.
      priceBuckets:
        options.priceBuckets && options.priceBuckets.length > 0
          ? [...options.priceBuckets].sort().join(",")
          : "",
      sort: options.sort || "newest",
    },
  ] as const;

export interface UsePaginatedProductsResult {
  products: Product[];
  hasMore: boolean;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  fetchNextPage: () => void;
  total: number;
  refetch: () => void;
}

/**
 * Cursor-paginated read of `/api/products`. Backed by TanStack
 * Query's `useInfiniteQuery` so changing any filter / sort param
 * resets to page 1, and successive "Load more" clicks append onto
 * the same query cache without a full refetch.
 *
 * Admin and detail pages should continue to use `useProducts()` —
 * that path goes through `ProductContext` which hits `?all=true`
 * to bypass pagination.
 */
export const usePaginatedProducts = (
  options: PaginatedProductsOptions = {},
): UsePaginatedProductsResult => {
  const enabled = options.enabled !== false;
  const query = useInfiniteQuery({
    queryKey: buildQueryKey(options),
    queryFn: ({ pageParam, signal }) =>
      fetchProductsPage(options, pageParam ?? null, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    enabled,
    // Keep the previous pages visible while a new filter is loading
    // so the gallery doesn't flash empty on every keystroke.
    placeholderData: (previous) => previous,
  });

  const pages = query.data?.pages ?? [];
  const products = pages.flatMap((page) => page.products);
  const total = pages[pages.length - 1]?.total ?? 0;
  const hasMore = pages[pages.length - 1]?.hasMore ?? false;

  return {
    products,
    hasMore,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error instanceof Error ? query.error : null,
    fetchNextPage: () => {
      // `fetchNextPage` is a no-op when `hasNextPage` is false —
      // guard anyway so callers can wire it directly to a button's
      // onClick without their own conditional.
      if (query.hasNextPage && !query.isFetchingNextPage) {
        void query.fetchNextPage();
      }
    },
    total,
    refetch: () => {
      void query.refetch();
    },
  };
};
