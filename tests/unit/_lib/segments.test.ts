import { describe, it, expect } from "vitest";
// @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
import {
  classifySegment,
  getDefaultSegments,
  sanitizeSegments,
  SEGMENT_CONSTANTS,
} from "../../../functions/api/_lib/segments.js";

const customer = (overrides: Record<string, unknown> = {}) => ({
  netSpend: 0,
  grossSpend: 0,
  ordersCount: 0,
  daysSinceOrder: null,
  registered: false,
  ...overrides,
});

describe("classifySegment with defaults", () => {
  const defaults = getDefaultSegments();

  it("classifies a high-LTV customer as vip", () => {
    expect(
      classifySegment(
        customer({ netSpend: 12000, ordersCount: 3, daysSinceOrder: 5 }),
        defaults,
      ),
    ).toBe("vip");
  });

  it("classifies 2+ orders as repeat", () => {
    expect(
      classifySegment(
        customer({ netSpend: 4000, ordersCount: 3, daysSinceOrder: 5 }),
        defaults,
      ),
    ).toBe("repeat");
  });

  it("classifies a 60+ day lapsed buyer as at_risk before repeat", () => {
    // ordersCount = 3 also qualifies for "repeat"; at_risk has higher priority.
    expect(
      classifySegment(
        customer({ netSpend: 4000, ordersCount: 3, daysSinceOrder: 90 }),
        defaults,
      ),
    ).toBe("at_risk");
  });

  it("classifies a single order under the LTV threshold as one_time", () => {
    expect(
      classifySegment(
        customer({ netSpend: 1500, ordersCount: 1, daysSinceOrder: 10 }),
        defaults,
      ),
    ).toBe("one_time");
  });

  it("classifies never-ordered customers as the lead catch-all", () => {
    expect(
      classifySegment(
        customer({ netSpend: 0, ordersCount: 0, daysSinceOrder: null }),
        defaults,
      ),
    ).toBe("lead");
  });

  it("does NOT treat a never-ordered customer as at_risk", () => {
    // Regression: original code required ordersCount > 0 before at_risk.
    expect(
      classifySegment(
        customer({ netSpend: 0, ordersCount: 0, daysSinceOrder: null }),
        defaults,
      ),
    ).not.toBe("at_risk");
  });

  it("falls back to defaults when called with an empty rule list", () => {
    expect(classifySegment(customer({ netSpend: 99999 }), [])).toBe("vip");
  });
});

describe("classifySegment with custom rules", () => {
  it("respects priority order (higher number wins)", () => {
    const rules = [
      {
        id: "small",
        label: "Small",
        color: "muted",
        priority: 10,
        conditions: [{ field: "ordersCount", op: "gte", value: 1 }],
      },
      {
        id: "big",
        label: "Big",
        color: "amber",
        priority: 100,
        conditions: [{ field: "ordersCount", op: "gte", value: 1 }],
      },
    ];
    expect(classifySegment(customer({ ordersCount: 5 }), rules)).toBe("big");
  });

  it("returns the fallback id when no rule matches", () => {
    const rules = [
      {
        id: "whales",
        label: "Whales",
        color: "amber",
        priority: 100,
        conditions: [{ field: "netSpend", op: "gte", value: 100_000 }],
      },
    ];
    expect(classifySegment(customer({ netSpend: 50 }), rules)).toBe(
      SEGMENT_CONSTANTS.FALLBACK_SEGMENT_ID,
    );
  });

  it("supports the registered boolean field", () => {
    const rules = [
      {
        id: "subscribers",
        label: "Subscribers",
        color: "sky",
        priority: 50,
        conditions: [{ field: "registered", op: "eq", value: true }],
      },
    ];
    expect(classifySegment(customer({ registered: true }), rules)).toBe(
      "subscribers",
    );
    expect(classifySegment(customer({ registered: false }), rules)).toBe(
      SEGMENT_CONSTANTS.FALLBACK_SEGMENT_ID,
    );
  });
});

describe("sanitizeSegments", () => {
  it("strips unknown fields and ops", () => {
    const sanitized = sanitizeSegments([
      {
        id: "vip",
        label: "VIP",
        color: "amber",
        priority: 100,
        conditions: [
          { field: "netSpend", op: "gte", value: 10000 },
          { field: "bogusField", op: "gte", value: 1 },
          { field: "ordersCount", op: "garbage", value: 1 },
        ],
      },
    ]);
    expect(sanitized).toHaveLength(1);
    expect(sanitized[0].conditions).toEqual([
      { field: "netSpend", op: "gte", value: 10000 },
    ]);
  });

  it("normalizes ids to lowercase and rejects those that don't match the slug pattern", () => {
    const sanitized = sanitizeSegments([
      // Mixed case is lowercased.
      { id: "VIP", label: "VIP", color: "amber", priority: 0, conditions: [] },
      // Starts with digit — invalid, dropped.
      { id: "1bad", label: "Bad", color: "amber", priority: 0, conditions: [] },
      // Contains spaces — invalid, dropped.
      {
        id: "has space",
        label: "X",
        color: "amber",
        priority: 0,
        conditions: [],
      },
    ]);
    expect(sanitized.map((s: { id: string }) => s.id)).toEqual(["vip"]);
  });

  it("dedupes by id (first occurrence wins)", () => {
    const sanitized = sanitizeSegments([
      { id: "a", label: "A1", color: "amber", priority: 1, conditions: [] },
      { id: "a", label: "A2", color: "sky", priority: 2, conditions: [] },
    ]);
    expect(sanitized).toHaveLength(1);
    expect(sanitized[0].label).toBe("A1");
  });

  it("throws when the result would be empty", () => {
    expect(() => sanitizeSegments([])).toThrow();
    expect(() =>
      // Missing label — segment is invalid and gets dropped, leaving 0 valid.
      sanitizeSegments([
        { id: "bad", label: "", color: "amber", priority: 0, conditions: [] },
      ]),
    ).toThrow();
  });

  it("clamps priority into the supported range", () => {
    const sanitized = sanitizeSegments([
      {
        id: "a",
        label: "A",
        color: "amber",
        priority: 99999,
        conditions: [],
      },
      {
        id: "b",
        label: "B",
        color: "amber",
        priority: -50,
        conditions: [],
      },
    ]);
    expect(sanitized[0].priority).toBe(1000);
    expect(sanitized[1].priority).toBe(0);
  });
});
