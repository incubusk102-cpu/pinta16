import { describe, it, expect, vi, beforeEach } from "vitest";
// @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
import { HERO_SLIDE_EVENT_TYPES } from "../../../functions/api/_lib/d1.js";

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

describe("HERO_SLIDE_EVENT_TYPES", () => {
  it("exposes exactly the impression / click event kinds", () => {
    expect(HERO_SLIDE_EVENT_TYPES.has("impression")).toBe(true);
    expect(HERO_SLIDE_EVENT_TYPES.has("click")).toBe(true);
    expect(HERO_SLIDE_EVENT_TYPES.has("hover")).toBe(false);
    expect(HERO_SLIDE_EVENT_TYPES.size).toBe(2);
  });
});

describe("recordHeroSlideEvent", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("is a no-op when env.DB is not bound", async () => {
    vi.doMock("../../../functions/api/_lib/context.js", () => ({
      getCloudflareEnv: () => ({}),
    }));
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.recordHeroSlideEvent({
      sessionId: "abcd-1234",
      slideId: "s_one",
      eventType: "impression",
    });
    expect(out).toBeNull();
  });

  it("rejects rows with missing required fields", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    const mod = await import("../../../functions/api/_lib/d1.js");

    const missingSession = await mod.recordHeroSlideEvent({
      sessionId: "",
      slideId: "s_one",
      eventType: "impression",
    });
    expect(missingSession).toBeNull();

    const missingSlide = await mod.recordHeroSlideEvent({
      sessionId: "abcd-1234",
      slideId: "",
      eventType: "impression",
    });
    expect(missingSlide).toBeNull();

    expect(db.__runs.length).toBe(0);
  });

  it("rejects rows with an unknown event_type", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.recordHeroSlideEvent({
      sessionId: "abcd-1234",
      slideId: "s_one",
      eventType: "purchase",
    });
    expect(out).toBeNull();
    expect(db.__runs.length).toBe(0);
  });

  it("rejects session ids that contain non [A-Za-z0-9_-] characters", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.recordHeroSlideEvent({
      sessionId: "drop table; --",
      slideId: "s_one",
      eventType: "impression",
    });
    expect(out).toBeNull();
    expect(db.__runs.length).toBe(0);
  });

  it("rejects slide ids with malformed characters", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.recordHeroSlideEvent({
      sessionId: "abcd-1234",
      slideId: "<script>",
      eventType: "click",
    });
    expect(out).toBeNull();
    expect(db.__runs.length).toBe(0);
  });

  it("inserts a valid impression event", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.recordHeroSlideEvent({
      id: "fixed-id",
      sessionId: "abcd-1234",
      slideId: "s_one",
      eventType: "impression",
      country: "PH",
      device: "mobile",
    });
    expect(out).toEqual({ recorded: true });
    expect(db.__runs).toHaveLength(1);
    expect(db.__runs[0].params).toEqual([
      "fixed-id",
      "abcd-1234",
      "s_one",
      "impression",
      "PH",
      "mobile",
      expect.any(String),
    ]);
  });

  it("nulls out an unrecognised device bucket", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    const mod = await import("../../../functions/api/_lib/d1.js");
    await mod.recordHeroSlideEvent({
      sessionId: "abcd-1234",
      slideId: "s_two",
      eventType: "click",
      device: "fridge",
    });
    expect(db.__runs).toHaveLength(1);
    expect(db.__runs[0].params).toContain(null);
  });

  it("generates an id when one is not supplied", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    const mod = await import("../../../functions/api/_lib/d1.js");
    await mod.recordHeroSlideEvent({
      sessionId: "abcd-1234",
      slideId: "s_three",
      eventType: "click",
    });
    expect(db.__runs).toHaveLength(1);
    const id = db.__runs[0].params[0];
    expect(typeof id).toBe("string");
    expect((id as string).startsWith("hs_")).toBe(true);
  });
});
