import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildFakeDb, mockEnv } from "./fake-d1";

// Covers the returns/RMA helpers:
//   - mirrorReturnRequestToD1 — upserts a return request keyed on the
//     synthetic `${order.id}:return` id so repeated status writes
//     converge instead of inserting duplicates.
//   - listReturnRequests — paginated read with an optional status filter.

describe("mirrorReturnRequestToD1", () => {
  beforeEach(() => vi.resetModules());

  const validOrder = {
    id: "ord_1",
    orderInfo: { email: "Buyer@Example.COM" },
  };
  const validRequest = {
    id: "ord_1:return",
    status: "requested",
    reason: "damaged",
    description: "Frame arrived cracked",
    items: [{ productId: "art-1", quantity: 1 }],
    photoUrls: ["https://example.com/photo.jpg"],
    rmaNumber: "RMA-42",
    refundAmount: 1500,
    requestedAt: "2025-01-02T03:04:05Z",
  };

  it("returns null when env.DB is unbound", async () => {
    mockEnv(null);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.mirrorReturnRequestToD1({
      order: validOrder,
      request: validRequest,
      customerId: "cust_x",
    });
    expect(out).toBeNull();
  });

  it("returns null without a valid order id", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    expect(
      await mod.mirrorReturnRequestToD1({
        order: { orderInfo: { email: "a@b.com" } },
        request: validRequest,
        customerId: null,
      }),
    ).toBeNull();
    expect(db.__runs).toHaveLength(0);
  });

  it("returns null without a request id", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.mirrorReturnRequestToD1({
      order: validOrder,
      request: { ...validRequest, id: undefined },
      customerId: null,
    });
    expect(out).toBeNull();
    expect(db.__runs).toHaveLength(0);
  });

  it("returns null when the order has no email", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.mirrorReturnRequestToD1({
      order: { id: "ord_1", orderInfo: {} },
      request: validRequest,
      customerId: null,
    });
    expect(out).toBeNull();
  });

  it("upserts the row with lowercased email and serialised JSON", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.mirrorReturnRequestToD1({
      order: validOrder,
      request: validRequest,
      customerId: "cust_x",
    });
    expect(out).toEqual({ mirrored: true });
    const run = db.__runs[0];
    expect(run.sql).toContain("INSERT INTO return_requests");
    expect(run.sql).toContain("ON CONFLICT(id) DO UPDATE");
    expect(run.params[0]).toBe("ord_1:return");
    expect(run.params[1]).toBe("ord_1");
    expect(run.params[2]).toBe("cust_x");
    expect(run.params[3]).toBe("buyer@example.com");
    expect(run.params[4]).toBe("requested");
    expect(run.params[5]).toBe("damaged");
    expect(typeof run.params[7]).toBe("string"); // photo_urls_json
    expect(typeof run.params[8]).toBe("string"); // items_json
    expect(run.params[9]).toBe("RMA-42");
    expect(run.params[11]).toBe(1500); // refund_amount_cents
  });

  it("returns {mirrored:false} when D1 throws", async () => {
    const db = buildFakeDb();
    db.__throwOnRun(
      (sql) => sql.includes("INSERT INTO return_requests"),
      new Error("write failure"),
    );
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.mirrorReturnRequestToD1({
      order: validOrder,
      request: validRequest,
      customerId: null,
    });
    expect(out.mirrored).toBe(false);
    expect(String(out.reason)).toContain("write failure");
  });
});

describe("listReturnRequests", () => {
  beforeEach(() => vi.resetModules());

  it("returns null when env.DB is unbound", async () => {
    mockEnv(null);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    expect(await mod.listReturnRequests()).toBeNull();
  });

  it("queries without a status filter when none is provided", async () => {
    const db = buildFakeDb();
    db.__nextAll([{ results: [{ id: "ord_1:return", status: "requested" }] }]);
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const rows = await mod.listReturnRequests({ limit: 50 });
    expect(rows).toHaveLength(1);
    expect(db.__runs[0].sql).toContain("FROM return_requests");
    expect(db.__runs[0].sql).not.toContain("WHERE status");
    expect(db.__runs[0].params).toEqual([50]);
  });

  it("includes a status filter when one is provided", async () => {
    const db = buildFakeDb();
    db.__nextAll([{ results: [] }]);
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    await mod.listReturnRequests({ status: "approved", limit: 10 });
    expect(db.__runs[0].sql).toContain("WHERE status = ?");
    expect(db.__runs[0].params).toEqual(["approved", 10]);
  });

  it("caps the limit at 500", async () => {
    const db = buildFakeDb();
    db.__nextAll([{ results: [] }]);
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    await mod.listReturnRequests({ limit: 99999 });
    expect(db.__runs[0].params).toEqual([500]);
  });
});
