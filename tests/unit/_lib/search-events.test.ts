import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildFakeDb, mockEnv } from "./fake-d1";

// Covers `recordSearchEvent` — debounced storefront search query
// recorder. INSERT OR IGNORE on client-supplied id; normalises the
// raw query to a lowercased trimmed `query_lc` for grouping.

describe("recordSearchEvent", () => {
  beforeEach(() => vi.resetModules());

  it("returns null when env.DB is unbound", async () => {
    mockEnv(null);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    expect(await mod.recordSearchEvent({ query: "x" })).toBeNull();
  });

  it("rejects an empty or whitespace-only query", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    expect(await mod.recordSearchEvent({ query: "" })).toBeNull();
    expect(await mod.recordSearchEvent({ query: "   " })).toBeNull();
    expect(db.__runs).toHaveLength(0);
  });

  it("writes both raw and lowercased query columns", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.recordSearchEvent({
      id: "se_1",
      query: "  Dela Rosa  ",
      resultsCount: 7,
      filterCategory: "abstract",
      filterAvailability: "available",
      filterPrice: "0-1000",
      country: "PH",
    });
    expect(out).toEqual({ recorded: true });
    const run = db.__runs[0];
    expect(run.sql).toContain("INSERT OR IGNORE INTO search_events");
    expect(run.params[0]).toBe("se_1");
    expect(run.params[1]).toBe("  Dela Rosa  "); // raw is sliced but otherwise untouched
    expect(run.params[2]).toBe("dela rosa"); // query_lc
    expect(run.params[3]).toBe(7); // results_count
    expect(run.params[4]).toBe("abstract");
    expect(run.params[5]).toBe("available");
    expect(run.params[6]).toBe("0-1000");
    expect(run.params[7]).toBe("PH");
  });

  it("floors negative results counts to 0", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    await mod.recordSearchEvent({ query: "x", resultsCount: -1 });
    expect(db.__runs[0].params[3]).toBe(0);
  });

  it("generates a synthetic id when none is supplied", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    await mod.recordSearchEvent({ query: "x" });
    const id = String(db.__runs[0].params[0]);
    expect(id).toMatch(/^se_/);
  });
});
