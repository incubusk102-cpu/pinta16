import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildFakeDb, mockEnv } from "./fake-d1";

// Covers the orders-domain helpers exported from `_lib/d1.js`:
//   - upsertCustomerFromOrder — derives customer id from email, returns
//     null when env.DB is unbound or the email is missing.
//   - mirrorOrderToD1 — fire-and-forget D1 mirror that returns a
//     `{ mirrored, reason? }` summary and never throws.

describe("upsertCustomerFromOrder", () => {
  beforeEach(() => vi.resetModules());

  it("returns null when env.DB is unbound", async () => {
    mockEnv(null);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.upsertCustomerFromOrder({
      id: "ord_1",
      orderInfo: { email: "buyer@example.com" },
      total: 1000,
    });
    expect(out).toBeNull();
  });

  it("returns null when the order has no email", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    expect(await mod.upsertCustomerFromOrder({ id: "ord" })).toBeNull();
    expect(await mod.upsertCustomerFromOrder({ orderInfo: {} })).toBeNull();
    expect(db.__runs).toHaveLength(0);
  });

  it("normalises the email and derives a stable id", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const id = await mod.upsertCustomerFromOrder({
      id: "ord_1",
      orderInfo: { email: "  BUYER@Example.COM  ", fullName: "Pat" },
      total: 1500,
    });
    expect(id).toBe("cust_buyer_example_com");
    expect(db.__runs).toHaveLength(1);
    const run = db.__runs[0];
    expect(run.sql).toContain("INSERT INTO customers");
    expect(run.params[0]).toBe("cust_buyer_example_com");
    expect(run.params[1]).toBe("buyer@example.com");
    expect(run.params[2]).toBe("Pat");
  });

  it("rounds the order total and falls back to 0 for garbage", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    await mod.upsertCustomerFromOrder({
      id: "ord_1",
      orderInfo: { email: "a@b.com" },
      total: "not-a-number",
    });
    // total_spent is the 9th-indexed bind param (see the helper).
    expect(db.__runs[0].params[8]).toBe(0);
  });
});

describe("mirrorOrderToD1", () => {
  beforeEach(() => vi.resetModules());

  it("returns {mirrored:false, reason:'no-binding'} when env.DB is unbound", async () => {
    mockEnv(null);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.mirrorOrderToD1({
      id: "ord_1",
      orderInfo: { email: "a@b.com" },
      items: [],
    });
    expect(out).toEqual({ mirrored: false, reason: "no-binding" });
  });

  it("inserts the customer + order + one row per item", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.mirrorOrderToD1({
      id: "ord_42",
      orderInfo: {
        email: "buyer@example.com",
        city: "Quezon City",
        region: "NCR",
        courier: "j&t",
      },
      status: "confirmed",
      subtotal: 1000,
      shippingFee: 100,
      discount: 0,
      total: 1100,
      createdAt: "2025-01-02T03:04:05Z",
      items: [
        { id: "art-1", title: "Painting A", price: 600, quantity: 1 },
        { id: "art-2", title: "Painting B", price: 250, quantity: 2 },
      ],
    });
    expect(out).toEqual({ mirrored: true });

    const sqls = db.__runs.map((r) => r.sql);
    expect(sqls.some((s) => s.includes("INSERT INTO customers"))).toBe(true);
    expect(sqls.some((s) => s.includes("INSERT OR REPLACE INTO orders"))).toBe(
      true,
    );
    expect(sqls.some((s) => s.includes("DELETE FROM order_items"))).toBe(true);
    const itemInserts = sqls.filter((s) =>
      s.includes("INSERT INTO order_items"),
    );
    expect(itemInserts).toHaveLength(2);
  });

  it("returns {mirrored:false} with the underlying error when D1 throws", async () => {
    const db = buildFakeDb();
    db.__throwOnRun(
      (sql) => sql.includes("INSERT OR REPLACE INTO orders"),
      new Error("disk full"),
    );
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.mirrorOrderToD1({
      id: "ord_1",
      orderInfo: { email: "a@b.com" },
      total: 100,
      items: [],
    });
    expect(out.mirrored).toBe(false);
    expect(String(out.reason)).toContain("disk full");
  });

  it("treats a missing items array as empty", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    await mod.mirrorOrderToD1({
      id: "ord_x",
      orderInfo: { email: "a@b.com" },
      total: 1,
    });
    const itemInserts = db.__runs.filter((r) =>
      r.sql.includes("INSERT INTO order_items"),
    );
    expect(itemInserts).toHaveLength(0);
  });
});
