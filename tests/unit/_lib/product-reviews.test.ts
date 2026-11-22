import { describe, it, expect, beforeEach, vi } from "vitest";
// @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
import {
  getProductReviewSummary,
  __test__,
} from "../../../functions/api/_lib/product-reviews.js";

interface RawReview {
  rating: number;
  text: string;
  submittedAt: string;
  customerName: string;
}
interface Internals {
  collectReviewsForProduct: (orders: unknown, productId: string) => RawReview[];
  buildSummary: (reviews: RawReview[]) => {
    count: number;
    average: number;
    recent: RawReview[];
  } | null;
  truncate: (s: string, max: number) => string;
  REVIEW_TEXT_LIMIT: number;
  MAX_REVIEWS_IN_LD: number;
}
const internals = __test__ as Internals;

// ----- collectReviewsForProduct -------------------------------------------------

describe("collectReviewsForProduct", () => {
  it("returns [] when orders is not an array", () => {
    expect(internals.collectReviewsForProduct(null, "p1")).toEqual([]);
    expect(internals.collectReviewsForProduct(undefined, "p1")).toEqual([]);
    expect(internals.collectReviewsForProduct({}, "p1")).toEqual([]);
  });

  it("ignores orders with no reviews", () => {
    const out = internals.collectReviewsForProduct(
      [{ id: "o1", orderInfo: { fullName: "Alice" } }],
      "p1",
    );
    expect(out).toEqual([]);
  });

  it("respects publishedToHomepage and productId filters", () => {
    const orders = [
      {
        id: "o1",
        orderInfo: { fullName: "Alice Mendoza" },
        reviews: [
          {
            rating: 5,
            text: "love it",
            productId: "p1",
            publishedToHomepage: true,
            submittedAt: "2025-01-01T00:00:00Z",
          },
          {
            rating: 4,
            text: "private",
            productId: "p1",
            publishedToHomepage: false,
            submittedAt: "2025-01-02T00:00:00Z",
          },
          {
            rating: 3,
            text: "different",
            productId: "p2",
            publishedToHomepage: true,
            submittedAt: "2025-01-03T00:00:00Z",
          },
        ],
      },
    ];
    const out = internals.collectReviewsForProduct(orders, "p1");
    expect(out).toHaveLength(1);
    expect(out[0].rating).toBe(5);
    expect(out[0].customerName).toBe("Alice");
  });

  it("supports the legacy single-review shape", () => {
    const out = internals.collectReviewsForProduct(
      [
        {
          orderInfo: { fullName: "Bob Tan" },
          review: {
            rating: 4,
            text: "ok",
            productId: "p1",
            publishedToHomepage: true,
            submittedAt: "2025-02-02T00:00:00Z",
          },
        },
      ],
      "p1",
    );
    expect(out).toHaveLength(1);
    expect(out[0].customerName).toBe("Bob");
  });

  it("skips reviews with non-numeric rating", () => {
    const out = internals.collectReviewsForProduct(
      [
        {
          orderInfo: { fullName: "Bad Data" },
          reviews: [
            {
              rating: "five",
              text: "x",
              productId: "p1",
              publishedToHomepage: true,
              submittedAt: "2025-01-01T00:00:00Z",
            },
          ],
        },
      ],
      "p1",
    );
    expect(out).toEqual([]);
  });

  it('falls back to "Customer" when no full name is set', () => {
    const out = internals.collectReviewsForProduct(
      [
        {
          orderInfo: {},
          reviews: [
            {
              rating: 5,
              text: "anonymous",
              productId: "p1",
              publishedToHomepage: true,
              submittedAt: "2025-01-01T00:00:00Z",
            },
          ],
        },
      ],
      "p1",
    );
    expect(out[0].customerName).toBe("Customer");
  });
});

// ----- buildSummary -------------------------------------------------------------

describe("buildSummary", () => {
  it("returns null when no reviews", () => {
    expect(internals.buildSummary([])).toBeNull();
  });

  it("computes count, rounded average and recent slice", () => {
    const reviews: RawReview[] = [
      {
        rating: 5,
        text: "a",
        submittedAt: "2025-01-01T00:00:00Z",
        customerName: "A",
      },
      {
        rating: 4,
        text: "b",
        submittedAt: "2025-01-02T00:00:00Z",
        customerName: "B",
      },
      {
        rating: 3,
        text: "c",
        submittedAt: "2025-01-03T00:00:00Z",
        customerName: "C",
      },
    ];
    const summary = internals.buildSummary(reviews);
    expect(summary).not.toBeNull();
    expect(summary!.count).toBe(3);
    expect(summary!.average).toBeCloseTo(4, 2);
    // Most-recent first ordering.
    expect(summary!.recent.map((r) => r.customerName)).toEqual(["C", "B", "A"]);
  });

  it("caps recent reviews at MAX_REVIEWS_IN_LD", () => {
    const reviews: RawReview[] = Array.from({ length: 10 }, (_, i) => ({
      rating: 5,
      text: `r${i}`,
      submittedAt: `2025-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      customerName: `c${i}`,
    }));
    const summary = internals.buildSummary(reviews);
    expect(summary!.recent.length).toBe(internals.MAX_REVIEWS_IN_LD);
    expect(summary!.count).toBe(10);
  });

  it("truncates long review text", () => {
    const longText = "x".repeat(internals.REVIEW_TEXT_LIMIT + 50);
    const summary = internals.buildSummary([
      {
        rating: 5,
        text: longText,
        submittedAt: "2025-01-01T00:00:00Z",
        customerName: "A",
      },
    ]);
    expect(summary!.recent[0].text.length).toBeLessThanOrEqual(
      internals.REVIEW_TEXT_LIMIT,
    );
    expect(summary!.recent[0].text.endsWith("…")).toBe(true);
  });

  it("rounds average to two decimals", () => {
    const summary = internals.buildSummary([
      {
        rating: 5,
        text: "",
        submittedAt: "2025-01-01T00:00:00Z",
        customerName: "A",
      },
      {
        rating: 4,
        text: "",
        submittedAt: "2025-01-02T00:00:00Z",
        customerName: "B",
      },
      {
        rating: 4,
        text: "",
        submittedAt: "2025-01-03T00:00:00Z",
        customerName: "C",
      },
    ]);
    expect(summary!.average).toBe(4.33);
  });
});

// ----- truncate ----------------------------------------------------------------

describe("truncate", () => {
  it("returns the string unchanged when shorter than max", () => {
    expect(internals.truncate("hello", 10)).toBe("hello");
  });
  it("collapses internal whitespace before length check", () => {
    expect(internals.truncate("a    b\n\nc", 10)).toBe("a b c");
  });
  it("adds an ellipsis when truncating", () => {
    expect(internals.truncate("aaaaaaaaaa", 5)).toBe("aaaa…");
  });
  it("handles empty / nullish input safely", () => {
    expect(internals.truncate("", 10)).toBe("");
    // @ts-expect-error — exercising the runtime guard.
    expect(internals.truncate(null, 10)).toBe("");
  });
});

// ----- getProductReviewSummary -------------------------------------------------

interface FakeCache {
  match: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  __store: Map<string, unknown>;
}
const makeFakeCache = (): FakeCache => {
  const store = new Map<string, unknown>();
  return {
    __store: store,
    match: vi.fn(async (req: Request) => {
      const key = req.url;
      const value = store.get(key);
      if (!value) return undefined;
      return new Response(JSON.stringify(value), {
        headers: { "Content-Type": "application/json" },
      });
    }),
    put: vi.fn(async (req: Request, res: Response) => {
      const key = req.url;
      const body = await res.json();
      store.set(key, body);
    }),
  };
};

// Mimics the Cloudflare KV namespace shape that makeStore() wraps:
// `kv.get(key, "text")` returns the raw string body (or null), and
// makeStore({type:"json"}) then JSON.parse's the result. Pre-serialise
// here so the parse path matches production.
const makeOrdersBinding = (orders: unknown) => ({
  get: vi.fn(async (_key: string, _type?: string) =>
    orders == null ? null : JSON.stringify(orders),
  ),
});

describe("getProductReviewSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when ORDERS binding is missing", async () => {
    const result = await getProductReviewSummary({}, "p1", {
      cache: makeFakeCache(),
    });
    expect(result).toBeNull();
  });

  it("returns null when productId is empty", async () => {
    const result = await getProductReviewSummary(
      { ORDERS: makeOrdersBinding([]) },
      "",
      { cache: makeFakeCache() },
    );
    expect(result).toBeNull();
  });

  it("returns null when no reviews match", async () => {
    const orders = [
      {
        orderInfo: { fullName: "Alice" },
        reviews: [
          {
            rating: 5,
            text: "x",
            productId: "other",
            publishedToHomepage: true,
            submittedAt: "2025-01-01T00:00:00Z",
          },
        ],
      },
    ];
    const env = { ORDERS: makeOrdersBinding(orders) };
    const result = await getProductReviewSummary(env, "p1", {
      cache: makeFakeCache(),
    });
    expect(result).toBeNull();
  });

  it("returns aggregate + recent reviews when matches exist", async () => {
    const orders = [
      {
        orderInfo: { fullName: "Alice Cruz" },
        reviews: [
          {
            rating: 5,
            text: "stunning piece",
            productId: "p1",
            publishedToHomepage: true,
            submittedAt: "2025-02-01T00:00:00Z",
          },
        ],
      },
      {
        orderInfo: { fullName: "Bob Tan" },
        reviews: [
          {
            rating: 4,
            text: "nice work",
            productId: "p1",
            publishedToHomepage: true,
            submittedAt: "2025-02-10T00:00:00Z",
          },
        ],
      },
    ];
    const env = { ORDERS: makeOrdersBinding(orders) };
    const result = await getProductReviewSummary(env, "p1", {
      cache: makeFakeCache(),
    });
    expect(result).not.toBeNull();
    expect(result.count).toBe(2);
    expect(result.average).toBeCloseTo(4.5, 2);
    expect(result.recent[0].customerName).toBe("Bob");
  });

  it("caches the result on first call and re-reads on second", async () => {
    const orders = [
      {
        orderInfo: { fullName: "Alice Cruz" },
        reviews: [
          {
            rating: 5,
            text: "x",
            productId: "p1",
            publishedToHomepage: true,
            submittedAt: "2025-02-01T00:00:00Z",
          },
        ],
      },
    ];
    const binding = makeOrdersBinding(orders);
    const env = { ORDERS: binding };
    const cache = makeFakeCache();
    const first = await getProductReviewSummary(env, "p1", { cache });
    const second = await getProductReviewSummary(env, "p1", { cache });
    expect(first!.count).toBe(1);
    expect(second!.count).toBe(1);
    // ORDERS.get only hit once because the second call read the cache.
    expect(binding.get).toHaveBeenCalledTimes(1);
    expect(cache.put).toHaveBeenCalledTimes(1);
  });

  it("caches zero-review results to avoid scanning ORDERS on every miss", async () => {
    const binding = makeOrdersBinding([]);
    const env = { ORDERS: binding };
    const cache = makeFakeCache();
    await getProductReviewSummary(env, "p1", { cache });
    await getProductReviewSummary(env, "p1", { cache });
    expect(binding.get).toHaveBeenCalledTimes(1);
    expect(cache.put).toHaveBeenCalledTimes(1);
  });

  it("returns null when the KV read throws", async () => {
    const env = {
      ORDERS: {
        get: vi.fn(async () => {
          throw new Error("kv down");
        }),
      },
    };
    const result = await getProductReviewSummary(env, "p1", {
      cache: makeFakeCache(),
    });
    expect(result).toBeNull();
  });
});
