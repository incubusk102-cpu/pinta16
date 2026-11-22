import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildFakeDb, mockEnv } from "./fake-d1";

// Covers the orders-analytics helpers extracted out of `admin/d1.js` as
// part of improvement.md item B9:
//   - orderRevenueSummary — assembles thisMonth / lastMonth / allTime
//     figures plus a 6-month sparkline. LEFT-joins zero-order months in
//     JS so the trendline never visually skips a gap.

describe("orderRevenueSummary", () => {
  beforeEach(() => vi.resetModules());

  it("returns null when env.DB is unbound", async () => {
    mockEnv(null);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    await expect(mod.orderRevenueSummary()).resolves.toBeNull();
  });

  it("queries each window with the right month boundaries", async () => {
    const db = buildFakeDb();
    db.__nextFirst([
      { revenue: 1500, order_count: 3 }, // thisMonth
      { revenue: 800, order_count: 2 }, // lastMonth
      { revenue: 99999, order_count: 250 }, // allTime
    ]);
    db.__nextAll([{ results: [] }]); // monthlyRows
    mockEnv(db);

    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.orderRevenueSummary(new Date("2026-05-15T12:00:00Z"));

    expect(out).toEqual({
      thisMonth: { revenue: 1500, orders: 3 },
      lastMonth: { revenue: 800, orders: 2 },
      allTime: { revenue: 99999, orders: 250 },
      monthlyHistory: [
        { ym: "2025-12", revenue: 0, orders: 0 },
        { ym: "2026-01", revenue: 0, orders: 0 },
        { ym: "2026-02", revenue: 0, orders: 0 },
        { ym: "2026-03", revenue: 0, orders: 0 },
        { ym: "2026-04", revenue: 0, orders: 0 },
        { ym: "2026-05", revenue: 0, orders: 0 },
      ],
    });

    const thisMonthRun = db.__runs.find((r) =>
      /FROM orders WHERE created_at >= \? AND status NOT IN/.test(r.sql),
    );
    expect(thisMonthRun?.params).toEqual(["2026-05-01T00:00:00"]);

    const lastMonthRun = db.__runs.find((r) =>
      /created_at >= \? AND created_at < \? AND status NOT IN/.test(r.sql),
    );
    expect(lastMonthRun?.params).toEqual([
      "2026-04-01T00:00:00",
      "2026-05-01T00:00:00",
    ]);
  });

  it("LEFT-joins zero-order months into the sparkline", async () => {
    const db = buildFakeDb();
    db.__nextFirst([
      { revenue: 1000, order_count: 1 },
      { revenue: 0, order_count: 0 },
      { revenue: 5000, order_count: 4 },
    ]);
    db.__nextAll([
      {
        results: [
          { ym: "2026-03", revenue: 1234, order_count: 2 },
          { ym: "2026-05", revenue: 5678, order_count: 6 },
        ],
      },
    ]);
    mockEnv(db);

    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.orderRevenueSummary(new Date("2026-05-20T12:00:00Z"));

    expect(out?.monthlyHistory).toEqual([
      { ym: "2025-12", revenue: 0, orders: 0 },
      { ym: "2026-01", revenue: 0, orders: 0 },
      { ym: "2026-02", revenue: 0, orders: 0 },
      { ym: "2026-03", revenue: 1234, orders: 2 },
      { ym: "2026-04", revenue: 0, orders: 0 },
      { ym: "2026-05", revenue: 5678, orders: 6 },
    ]);
  });

  it("excludes cancelled and refunded orders in every window", async () => {
    const db = buildFakeDb();
    db.__nextFirst([null, null, null]);
    db.__nextAll([{ results: [] }]);
    mockEnv(db);

    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    await mod.orderRevenueSummary(new Date("2026-05-15T00:00:00Z"));

    for (const run of db.__runs) {
      expect(run.sql).toMatch(/status NOT IN \('cancelled','refunded'\)/);
    }
  });
});
