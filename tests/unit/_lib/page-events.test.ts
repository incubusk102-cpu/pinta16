import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildFakeDb, mockEnv } from "./fake-d1";

// Covers `recordPageEvent` + the PAGE_EVENT_KINDS allow-list. The
// recorder enforces a strict shape: 64-char session id, path that
// starts with `/`, a known `pathKind`, and an optional but
// allow-listed `device`.

describe("PAGE_EVENT_KINDS", () => {
  beforeEach(() => vi.resetModules());

  it("contains the known public-route buckets", async () => {
    mockEnv(buildFakeDb());
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    expect(mod.PAGE_EVENT_KINDS.has("home")).toBe(true);
    expect(mod.PAGE_EVENT_KINDS.has("gallery")).toBe(true);
    expect(mod.PAGE_EVENT_KINDS.has("product")).toBe(true);
    expect(mod.PAGE_EVENT_KINDS.has("checkout")).toBe(true);
    expect(mod.PAGE_EVENT_KINDS.has("not-a-kind")).toBe(false);
  });
});

describe("recordPageEvent", () => {
  beforeEach(() => vi.resetModules());

  const validEvent = {
    id: "evt_1",
    sessionId: "sess_1234",
    path: "/products/art-1",
    pathKind: "product",
    referrerHost: "google.com",
    country: "PH",
    device: "mobile",
  };

  it("returns null when env.DB is unbound", async () => {
    mockEnv(null);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    expect(await mod.recordPageEvent(validEvent)).toBeNull();
  });

  it("rejects events with a blank or unsafe sessionId", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    expect(
      await mod.recordPageEvent({ ...validEvent, sessionId: "" }),
    ).toBeNull();
    expect(
      await mod.recordPageEvent({ ...validEvent, sessionId: "bad session!" }),
    ).toBeNull();
    expect(db.__runs).toHaveLength(0);
  });

  it("rejects paths that don't start with /", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    expect(
      await mod.recordPageEvent({ ...validEvent, path: "products/x" }),
    ).toBeNull();
    expect(db.__runs).toHaveLength(0);
  });

  it("rejects unknown pathKind values", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    expect(
      await mod.recordPageEvent({ ...validEvent, pathKind: "purgatory" }),
    ).toBeNull();
    expect(db.__runs).toHaveLength(0);
  });

  it("drops a device value outside the allow-list", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    await mod.recordPageEvent({ ...validEvent, device: "smart-fridge" });
    // device is the 7th bind param (0-indexed: id, sessionId, path,
    // pathKind, referrerHost, country, device, ts).
    expect(db.__runs[0].params[6]).toBeNull();
  });

  it("writes the row with all valid params", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const out = await mod.recordPageEvent(validEvent);
    expect(out).toEqual({ recorded: true });
    const run = db.__runs[0];
    expect(run.sql).toContain("INSERT OR IGNORE INTO page_events");
    expect(run.params[0]).toBe("evt_1");
    expect(run.params[1]).toBe("sess_1234");
    expect(run.params[2]).toBe("/products/art-1");
    expect(run.params[3]).toBe("product");
    expect(run.params[4]).toBe("google.com");
    expect(run.params[5]).toBe("PH");
    expect(run.params[6]).toBe("mobile");
  });

  it("generates a synthetic id when none is supplied", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    await mod.recordPageEvent({ ...validEvent, id: undefined });
    const id = String(db.__runs[0].params[0]);
    expect(id).toMatch(/^pe_/);
  });
});
