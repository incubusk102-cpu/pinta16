import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildFakeDb, mockEnv } from "./fake-d1";

// Exercises the null-safe contract every domain module builds on:
// when `env.DB` is missing, the bare helpers in `queries/core.js`
// resolve to `null` instead of throwing, and `isD1Available()`
// returns false. The constants (`ALLOWED_DEVICES`, `sinceFromDays`,
// `isBenignSchemaError`) also live here.

describe("core helpers — env.DB unbound", () => {
  beforeEach(() => {
    vi.resetModules();
    mockEnv(null);
  });

  it("getD1 returns null", async () => {
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    expect(mod.getD1()).toBeNull();
  });

  it("isD1Available returns false", async () => {
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    expect(mod.isD1Available()).toBe(false);
  });

  it("d1Run resolves to null without throwing", async () => {
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    await expect(mod.d1Run("SELECT 1")).resolves.toBeNull();
  });

  it("d1All resolves to null without throwing", async () => {
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    await expect(mod.d1All("SELECT 1")).resolves.toBeNull();
  });

  it("d1First resolves to null without throwing", async () => {
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    await expect(mod.d1First("SELECT 1")).resolves.toBeNull();
  });

  it("d1Batch resolves to null without throwing", async () => {
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    await expect(mod.d1Batch([])).resolves.toBeNull();
  });
});

describe("core helpers — env.DB bound", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("getD1 returns the bound DB", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    expect(mod.getD1()).toBe(db);
  });

  it("isD1Available returns true", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    expect(mod.isD1Available()).toBe(true);
  });

  it("d1Run binds parameters and calls run", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    await mod.d1Run("INSERT INTO t VALUES (?)", ["x"]);
    expect(db.__runs).toHaveLength(1);
    expect(db.__runs[0].sql).toContain("INSERT INTO t");
    expect(db.__runs[0].params).toEqual(["x"]);
  });

  it("d1First returns the first row from the prepared statement", async () => {
    const db = buildFakeDb();
    db.__nextFirst([{ n: 7 }]);
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const row = await mod.d1First("SELECT COUNT(*) AS n FROM t");
    expect(row).toEqual({ n: 7 });
  });

  it("d1All returns the results array from the prepared statement", async () => {
    const db = buildFakeDb();
    db.__nextAll([{ results: [{ id: "a" }, { id: "b" }] }]);
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const result = await mod.d1All("SELECT id FROM t");
    expect(result).toEqual({ results: [{ id: "a" }, { id: "b" }] });
  });
});

describe("ALLOWED_DEVICES", () => {
  beforeEach(() => vi.resetModules());

  it("contains the four known device buckets", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    expect(mod.ALLOWED_DEVICES.has("mobile")).toBe(true);
    expect(mod.ALLOWED_DEVICES.has("tablet")).toBe(true);
    expect(mod.ALLOWED_DEVICES.has("desktop")).toBe(true);
    expect(mod.ALLOWED_DEVICES.has("unknown")).toBe(true);
    expect(mod.ALLOWED_DEVICES.has("smart-fridge")).toBe(false);
  });
});

describe("sinceFromDays", () => {
  beforeEach(() => vi.resetModules());

  it("returns an ISO timestamp `days` whole days before now", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const now = Date.now();
    const iso = mod.sinceFromDays(7);
    const ts = new Date(iso).getTime();
    const diffDays = Math.round((now - ts) / 86400_000);
    expect(diffDays).toBe(7);
  });

  it("defaults to 30 days when given garbage", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const now = Date.now();
    const iso = mod.sinceFromDays("not-a-number");
    const diffDays = Math.round((now - new Date(iso).getTime()) / 86400_000);
    expect(diffDays).toBe(30);
  });

  it("clamps to a minimum of 1 day for negative inputs", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const now = Date.now();
    const iso = mod.sinceFromDays(-5);
    const diffDays = Math.round((now - new Date(iso).getTime()) / 86400_000);
    expect(diffDays).toBe(1);
  });
});

describe("isBenignSchemaError", () => {
  beforeEach(() => vi.resetModules());

  it("returns true for `duplicate column name` errors (case-insensitive)", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    expect(
      mod.isBenignSchemaError(new Error("duplicate column name: view_count")),
    ).toBe(true);
    expect(
      mod.isBenignSchemaError(new Error("DUPLICATE COLUMN NAME: foo")),
    ).toBe(true);
  });

  it("returns true for plain string errors too", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    expect(mod.isBenignSchemaError("duplicate column name: x")).toBe(true);
  });

  it("returns false for unrelated errors", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    expect(mod.isBenignSchemaError(new Error("no such table: t"))).toBe(false);
    expect(mod.isBenignSchemaError(null)).toBe(false);
    expect(mod.isBenignSchemaError(undefined)).toBe(false);
  });
});
