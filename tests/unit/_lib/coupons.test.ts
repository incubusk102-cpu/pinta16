import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildFakeDb, mockEnv } from "./fake-d1";

// Covers the coupon ledger:
//   - recordCouponRedemption — idempotent on (order_id, code).
//   - customerCouponRedemptionCount — used to enforce per-customer caps.

describe("recordCouponRedemption", () => {
  beforeEach(() => vi.resetModules());

  it("returns null when env.DB is unbound", async () => {
    mockEnv(null);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.recordCouponRedemption({
      code: "VIP10",
      order: { id: "ord_1", orderInfo: { email: "a@b.com" } },
    });
    expect(out).toBeNull();
  });

  it("returns null when the code is blank", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.recordCouponRedemption({
      code: "   ",
      order: { id: "ord_1", orderInfo: { email: "a@b.com" } },
    });
    expect(out).toBeNull();
    expect(db.__runs).toHaveLength(0);
  });

  it("returns null when the order has no id or email", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    expect(
      await mod.recordCouponRedemption({
        code: "X",
        order: { orderInfo: { email: "a@b.com" } },
      }),
    ).toBeNull();
    expect(
      await mod.recordCouponRedemption({
        code: "X",
        order: { id: "ord_1", orderInfo: {} },
      }),
    ).toBeNull();
    expect(db.__runs).toHaveLength(0);
  });

  it("uppercases the code, lowercases the email, and uses the synthetic id", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.recordCouponRedemption({
      code: "  vip10  ",
      order: {
        id: "ord_42",
        orderInfo: { email: "  Buyer@Example.COM " },
        subtotal: 1200,
        discount: 200,
        total: 1000,
      },
      customerId: "cust_x",
    });
    expect(out).toEqual({ mirrored: true });
    expect(db.__runs).toHaveLength(1);
    const run = db.__runs[0];
    expect(run.sql).toContain("INSERT OR IGNORE INTO coupon_redemptions");
    expect(run.params[0]).toBe("ord_42:VIP10");
    expect(run.params[1]).toBe("VIP10");
    expect(run.params[2]).toBe("ord_42");
    expect(run.params[3]).toBe("cust_x");
    expect(run.params[4]).toBe("buyer@example.com");
    expect(run.params[5]).toBe(200); // discount cents
    expect(run.params[6]).toBe(1200); // subtotal cents
    expect(run.params[7]).toBe(1000); // total cents
    expect(run.params[8]).toBe("PHP");
  });

  it("returns {mirrored:false} with a reason when D1 throws", async () => {
    const db = buildFakeDb();
    db.__throwOnRun(
      (sql) => sql.includes("INSERT OR IGNORE INTO coupon_redemptions"),
      new Error("nope"),
    );
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.recordCouponRedemption({
      code: "X",
      order: { id: "ord_1", orderInfo: { email: "a@b.com" } },
    });
    expect(out.mirrored).toBe(false);
    expect(String(out.reason)).toContain("nope");
  });
});

describe("customerCouponRedemptionCount", () => {
  beforeEach(() => vi.resetModules());

  it("returns null when env.DB is unbound (so caller can fall back)", async () => {
    mockEnv(null);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const n = await mod.customerCouponRedemptionCount("a@b.com", "X");
    expect(n).toBeNull();
  });

  it("returns 0 for a blank email or code", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    expect(await mod.customerCouponRedemptionCount("", "X")).toBe(0);
    expect(await mod.customerCouponRedemptionCount("a@b.com", "")).toBe(0);
    expect(db.__runs).toHaveLength(0);
  });

  it("normalises email + code and returns the row count", async () => {
    const db = buildFakeDb();
    db.__nextFirst([{ n: 3 }]);
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const n = await mod.customerCouponRedemptionCount(
      "  Buyer@Example.COM ",
      "  vip10  ",
    );
    expect(n).toBe(3);
    expect(db.__runs[0].params).toEqual(["buyer@example.com", "VIP10"]);
  });

  it("floors a non-integer row count to 0 minimum", async () => {
    const db = buildFakeDb();
    db.__nextFirst([{ n: -1 }]);
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const n = await mod.customerCouponRedemptionCount("a@b.com", "X");
    expect(n).toBe(0);
  });
});
