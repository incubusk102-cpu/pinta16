import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildFakeDb, mockEnv } from "./fake-d1";

// Covers `mirrorProductToD1` — the queryable D1 mirror of the
// PRODUCTS KV namespace. Idempotent INSERT OR REPLACE on `id`.

describe("mirrorProductToD1", () => {
  beforeEach(() => vi.resetModules());

  it("returns null when env.DB is unbound", async () => {
    mockEnv(null);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.mirrorProductToD1({ id: "p1", title: "X" });
    expect(out).toBeNull();
  });

  it("upserts the basic product fields", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    await mod.mirrorProductToD1({
      id: "p1",
      title: "Painting A",
      category: "abstract",
      price: 1500,
      salePrice: 1200,
      stockCount: 3,
      lowStockThreshold: 1,
      createdAt: "2025-01-01T00:00:00Z",
    });
    expect(db.__runs).toHaveLength(1);
    const run = db.__runs[0];
    expect(run.sql).toContain("INSERT OR REPLACE INTO products");
    expect(run.params[0]).toBe("p1");
    expect(run.params[1]).toBe("Painting A");
    expect(run.params[2]).toBe("abstract");
    expect(run.params[3]).toBe(1500);
    expect(run.params[4]).toBe(1200); // sale_price
    expect(run.params[5]).toBe(0); // is_default false by default
    expect(run.params[7]).toBe(3); // stock_count
  });

  it("marks the row as default when isDefault=true", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    await mod.mirrorProductToD1({ id: "p1", title: "X" }, true);
    expect(db.__runs[0].params[5]).toBe(1);
  });

  it("flags is_sold for products marked sold in the KV blob", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    await mod.mirrorProductToD1({ id: "p1", title: "X", availability: "sold" });
    expect(db.__runs[0].params[6]).toBe(1);
    await mod.mirrorProductToD1({ id: "p2", title: "Y", sold: true });
    expect(db.__runs[1].params[6]).toBe(1);
  });

  it("falls back to name when title is missing", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    await mod.mirrorProductToD1({ id: "p1", name: "Legacy Name" });
    expect(db.__runs[0].params[1]).toBe("Legacy Name");
  });

  it("clamps negative stock counts to 0", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    await mod.mirrorProductToD1({ id: "p1", title: "X", stockCount: -3 });
    expect(db.__runs[0].params[7]).toBe(0);
  });
});
