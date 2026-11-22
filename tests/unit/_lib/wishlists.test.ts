import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildFakeDb, mockEnv } from "./fake-d1";

// Covers `syncWishlistToD1` — the wishlist mirror that wipes a user's
// rows and reinserts them inside a single D1 batch. Idempotent on
// `(user_id, product_id)` via the synthetic `${userId}:${id}` row id.

describe("syncWishlistToD1", () => {
  beforeEach(() => vi.resetModules());

  it("returns null when env.DB is unbound", async () => {
    mockEnv(null);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.syncWishlistToD1("user_1", []);
    expect(out).toBeNull();
  });

  it("returns null for a missing or non-string userId", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    expect(await mod.syncWishlistToD1("", [])).toBeNull();
    expect(await mod.syncWishlistToD1(null, [])).toBeNull();
    expect(await mod.syncWishlistToD1(42, [])).toBeNull();
    expect(db.__runs).toHaveLength(0);
  });

  it("wipes the user's rows even when items is empty", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.syncWishlistToD1("user_1", []);
    expect(out).toEqual({ mirrored: true, count: 0 });
    expect(db.__runs).toHaveLength(1);
    expect(db.__runs[0].sql).toContain("DELETE FROM wishlist_items");
    expect(db.__runs[0].params).toEqual(["user_1"]);
  });

  it("inserts one row per valid item, skipping items without an id", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.syncWishlistToD1("user_1", [
      { id: "p1", title: "Painting 1", price: 1000 },
      { id: "", title: "no-id" },
      null,
      { id: "p2", title: "Painting 2", price: 2000 },
    ]);
    expect(out).toEqual({ mirrored: true, count: 4 });
    const inserts = db.__runs.filter((r) =>
      r.sql.includes("INSERT INTO wishlist_items"),
    );
    expect(inserts).toHaveLength(2);
    expect(inserts[0].params[0]).toBe("user_1:p1");
    expect(inserts[1].params[0]).toBe("user_1:p2");
  });

  it("preserves a caller-supplied addedAt timestamp", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    await mod.syncWishlistToD1("user_1", [
      { id: "p1", title: "Painting", addedAt: "2025-01-02T03:04:05Z" },
    ]);
    const insert = db.__runs.find((r) =>
      r.sql.includes("INSERT INTO wishlist_items"),
    );
    expect(insert?.params).toContain("2025-01-02T03:04:05Z");
  });

  it("returns {mirrored:false} when the batch throws", async () => {
    const db = buildFakeDb();
    db.__throwOnRun(
      (sql) => sql.includes("INSERT INTO wishlist_items"),
      new Error("constraint"),
    );
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.syncWishlistToD1("user_1", [
      { id: "p1", title: "Painting" },
    ]);
    expect(out.mirrored).toBe(false);
    expect(String(out.reason)).toContain("constraint");
  });
});
