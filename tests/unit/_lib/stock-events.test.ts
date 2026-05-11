import { describe, it, expect, vi, beforeEach } from "vitest";
// @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
import {
  recordStockEvent,
  STOCK_STATES,
  STOCK_SOURCES,
} from "../../../functions/api/_lib/d1.js";

interface PreparedStatement {
  bind: (...args: unknown[]) => PreparedStatement;
  run: () => Promise<unknown>;
  all: () => Promise<unknown>;
  first: () => Promise<unknown>;
}

interface FakeDb {
  prepare: ReturnType<typeof vi.fn>;
  __runs: Array<{ sql: string; params: unknown[] }>;
}

const buildFakeDb = (): FakeDb => {
  const runs: Array<{ sql: string; params: unknown[] }> = [];
  const fake: FakeDb = {
    __runs: runs,
    prepare: vi.fn((sql: string) => {
      const stmt: PreparedStatement = {
        bind: (...params: unknown[]) => {
          runs.push({ sql, params });
          return stmt;
        },
        run: async () => ({ success: true }),
        all: async () => ({ results: [] }),
        first: async () => null,
      };
      return stmt;
    }),
  };
  return fake;
};

const mockEnv = (db: FakeDb | null) => {
  vi.doMock("../../../functions/api/_lib/context.js", () => ({
    getCloudflareEnv: () => (db ? { DB: db } : {}),
  }));
};

describe("STOCK_STATES / STOCK_SOURCES", () => {
  it("exports the canvhub availability enum", () => {
    expect(STOCK_STATES.has("available")).toBe(true);
    expect(STOCK_STATES.has("reserved")).toBe(true);
    expect(STOCK_STATES.has("sold")).toBe(true);
    expect(STOCK_STATES.has("draft")).toBe(true);
    expect(STOCK_STATES.has("anything-else")).toBe(false);
  });

  it("exports the known stock-event sources", () => {
    expect(STOCK_SOURCES.has("admin-create")).toBe(true);
    expect(STOCK_SOURCES.has("admin-edit")).toBe(true);
    expect(STOCK_SOURCES.has("admin-bulk")).toBe(true);
    expect(STOCK_SOURCES.has("admin-delete")).toBe(true);
    expect(STOCK_SOURCES.has("checkout")).toBe(true);
    expect(STOCK_SOURCES.has("system")).toBe(true);
    expect(STOCK_SOURCES.has("not-a-source")).toBe(false);
  });
});

describe("recordStockEvent", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("is a no-op when env.DB is not bound", async () => {
    vi.doMock("../../../functions/api/_lib/context.js", () => ({
      getCloudflareEnv: () => ({}),
    }));
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.recordStockEvent({
      productId: "p1",
      toState: "sold",
      source: "admin-edit",
    });
    expect(out).toBeNull();
  });

  it("rejects rows with no productId", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.recordStockEvent({
      productId: "",
      toState: "sold",
      source: "admin-edit",
    });
    expect(out).toBeNull();
    expect(db.__runs.length).toBe(0);
  });

  it("rejects rows with an unknown to_state", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.recordStockEvent({
      productId: "p1",
      toState: "purgatory",
      source: "admin-edit",
    });
    expect(out).toBeNull();
    expect(db.__runs.length).toBe(0);
  });

  it("accepts to_state='deleted' as a synthetic terminal marker", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.recordStockEvent({
      productId: "p1",
      toState: "deleted",
      source: "admin-delete",
    });
    expect(out).toEqual({ recorded: true });
    expect(db.__runs[0].params).toContain("deleted");
  });

  it("defaults an unknown source to 'system'", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    const mod = await import("../../../functions/api/_lib/d1.js");
    await mod.recordStockEvent({
      productId: "p1",
      toState: "sold",
      source: "drive-by-write",
    });
    expect(db.__runs[0].params).toContain("system");
  });

  it("lower-cases and truncates the actor", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    const mod = await import("../../../functions/api/_lib/d1.js");
    await mod.recordStockEvent({
      productId: "p1",
      toState: "sold",
      source: "admin-edit",
      actor: "  ADMIN@CANVHUB.COM  ",
    });
    expect(db.__runs[0].params).toContain("admin@canvhub.com");
  });

  it("persists from_state when supplied", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    const mod = await import("../../../functions/api/_lib/d1.js");
    await mod.recordStockEvent({
      productId: "p1",
      productTitle: "Sunset over Manila Bay",
      category: "landscape",
      fromState: "available",
      toState: "sold",
      source: "admin-edit",
    });
    const params = db.__runs[0].params;
    expect(params).toContain("available");
    expect(params).toContain("sold");
    expect(params).toContain("landscape");
    expect(params).toContain("Sunset over Manila Bay");
  });

  it("swallows a thrown DB error and returns a falsy recorded flag", async () => {
    const db: FakeDb = {
      __runs: [],
      prepare: vi.fn(() => {
        const stmt = {
          bind: () => stmt,
          run: async () => {
            throw new Error("DB unreachable");
          },
          all: async () => ({ results: [] }),
          first: async () => null,
        };
        return stmt;
      }),
    };
    mockEnv(db);
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.recordStockEvent({
      productId: "p1",
      toState: "sold",
      source: "admin-edit",
    });
    expect(out?.recorded).toBe(false);
    expect(out?.reason).toContain("DB unreachable");
  });
});
