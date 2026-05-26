import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildFakeDb, mockEnv } from "./fake-d1";

// Covers the products-analytics helper extracted out of `admin/d1.js`
// as part of improvement.md item B9.

describe("topProductsByRevenue", () => {
  beforeEach(() => vi.resetModules());

  it("returns null when env.DB is unbound", async () => {
    mockEnv(null);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    await expect(mod.topProductsByRevenue()).resolves.toBeNull();
  });

  it("returns the result rows sorted by SUM(subtotal)", async () => {
    const db = buildFakeDb();
    db.__nextAll([
      {
        results: [
          {
            product_id: "p1",
            product_title: "A",
            total_revenue: 9000,
            total_qty: 6,
          },
          {
            product_id: "p2",
            product_title: "B",
            total_revenue: 4000,
            total_qty: 2,
          },
        ],
      },
    ]);
    mockEnv(db);

    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.topProductsByRevenue();
    expect(out).toEqual([
      {
        product_id: "p1",
        product_title: "A",
        total_revenue: 9000,
        total_qty: 6,
      },
      {
        product_id: "p2",
        product_title: "B",
        total_revenue: 4000,
        total_qty: 2,
      },
    ]);

    const run = db.__runs.find((r) => /FROM order_items/.test(r.sql));
    expect(run?.params).toEqual([10]);
    expect(run?.sql).toMatch(/ORDER BY total_revenue DESC LIMIT \?/);
  });

  it("clamps the limit into [1, 100]", async () => {
    const db = buildFakeDb();
    db.__nextAll([{ results: [] }, { results: [] }, { results: [] }]);
    mockEnv(db);

    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    await mod.topProductsByRevenue(0);
    await mod.topProductsByRevenue(99999);
    await mod.topProductsByRevenue(25);

    const limits = db.__runs
      .filter((r) => /FROM order_items/.test(r.sql))
      .map((r) => r.params[0]);
    expect(limits).toEqual([1, 100, 25]);
  });

  it("returns [] on an empty resultset", async () => {
    const db = buildFakeDb();
    db.__nextAll([{ results: [] }]);
    mockEnv(db);

    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    expect(await mod.topProductsByRevenue()).toEqual([]);
  });
});
