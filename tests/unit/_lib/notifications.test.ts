import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildFakeDb, mockEnv } from "./fake-d1";

// Covers `recordNotification` + the NOTIFICATION_CHANNELS allow-list.
// The recorder is called from the send wrappers in `email.js` and
// `push.js` AFTER the provider returns, must never throw, and writes
// truncated `reason`/`error` strings to keep D1 cheap.

describe("NOTIFICATION_CHANNELS", () => {
  beforeEach(() => vi.resetModules());

  it("exposes only the two channels we actually send", async () => {
    mockEnv(buildFakeDb());
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    expect(mod.NOTIFICATION_CHANNELS.has("email")).toBe(true);
    expect(mod.NOTIFICATION_CHANNELS.has("push")).toBe(true);
    expect(mod.NOTIFICATION_CHANNELS.has("sms")).toBe(false);
  });
});

describe("recordNotification", () => {
  beforeEach(() => vi.resetModules());

  it("returns null when env.DB is unbound", async () => {
    mockEnv(null);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    expect(
      await mod.recordNotification({
        channel: "email",
        kind: "order-confirmation",
        result: { delivered: true },
      }),
    ).toBeNull();
  });

  it("rejects a non-allow-listed channel", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    expect(
      await mod.recordNotification({
        channel: "sms",
        kind: "order-confirmation",
        result: { delivered: true },
      }),
    ).toBeNull();
    expect(db.__runs).toHaveLength(0);
  });

  it("rejects a blank kind", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    expect(
      await mod.recordNotification({
        channel: "email",
        kind: "   ",
        result: { delivered: true },
      }),
    ).toBeNull();
    expect(db.__runs).toHaveLength(0);
  });

  it("normalises recipient + orderId and writes the row", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    await mod.recordNotification({
      channel: "email",
      kind: "order-confirmation",
      recipient: "  Buyer@Example.COM ",
      orderId: " ord_42 ",
      result: {
        delivered: true,
        provider: "resend",
        attempted: 1,
        successful: 1,
      },
    });
    const run = db.__runs[0];
    expect(run.sql).toContain("INSERT INTO notification_log");
    expect(run.params[1]).toBe("email");
    expect(run.params[2]).toBe("order-confirmation");
    expect(run.params[3]).toBe("buyer@example.com");
    expect(run.params[4]).toBe("ord_42");
    expect(run.params[5]).toBe(1); // delivered
    expect(run.params[6]).toBe(0); // skipped
    expect(run.params[7]).toBe("resend");
  });

  it("truncates an over-long reason/error to 200 chars", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    const big = "x".repeat(5000);
    await mod.recordNotification({
      channel: "push",
      kind: "delivery",
      result: { delivered: false, error: big },
    });
    const reason = db.__runs[0].params[8];
    expect(typeof reason).toBe("string");
    expect(String(reason).length).toBe(200);
  });

  it("falls back to `reason` when no `error` is present", async () => {
    const db = buildFakeDb();
    mockEnv(db);
    // @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
    const mod = await import("../../../functions/api/_lib/d1.js");
    await mod.recordNotification({
      channel: "email",
      kind: "delivery",
      result: { delivered: false, reason: "queued" },
    });
    expect(db.__runs[0].params[8]).toBe("queued");
  });
});
