import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildFakeDb, mockEnv } from "./fake-d1";

// Covers the customers-summary helper extracted out of `admin/d1.js`
// as part of improvement.md item B9.

describe("customersSummary", () => {
  beforeEach(() => vi.resetModules());

  it("returns null when env.DB is unbound", async () => {
    mockEnv(null);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    await expect(mod.customersSummary()).resolves.toBeNull();
  });

  it("aggregates totals, average LTV (rounded), and repeat-customer count", async () => {
    const db = buildFakeDb();
    db.__nextFirst([{ total_customers: 42, avg_ltv: 1234.7 }, { cnt: 9 }]);
    mockEnv(db);

    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.customersSummary();

    expect(out).toEqual({
      totalCustomers: 42,
      avgLtv: 1235,
      repeatCustomers: 9,
    });

    // customersSummary is a pure aggregate — neither statement takes a
    // parameter, so the prepare()/first() chain skips .bind() and the
    // fake DB's __runs ledger stays empty. Inspect the prepare() call
    // sequence instead.
    const prepared = db.prepare.mock.calls.map((c) => c[0] as string);
    expect(
      prepared.some((sql) => /SELECT COUNT\(\*\) as total_customers/.test(sql)),
    ).toBe(true);
    expect(prepared.some((sql) => /WHERE total_orders >= 2/.test(sql))).toBe(
      true,
    );
  });

  it("treats empty resultsets as zeros", async () => {
    const db = buildFakeDb();
    db.__nextFirst([null, null]);
    mockEnv(db);

    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    expect(await mod.customersSummary()).toEqual({
      totalCustomers: 0,
      avgLtv: 0,
      repeatCustomers: 0,
    });
  });
});
