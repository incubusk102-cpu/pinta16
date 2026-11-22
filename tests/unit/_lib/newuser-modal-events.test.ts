import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
// @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
import {
  NEWUSER_MODAL_VARIANT_RE,
  NEWUSER_MODAL_EVENT_TYPES,
  recordNewUserModalEvent,
} from "../../../functions/api/_lib/d1.js";
// @ts-expect-error — see above.
import { setCloudflareContext } from "../../../functions/api/_lib/context.js";

type RunCall = {
  sql: string;
  binds: unknown[];
};

const makeFakeD1 = () => {
  const calls: RunCall[] = [];
  let nextRunResult: { success: boolean } | Error = { success: true };
  const fake = {
    prepare: (sql: string) => ({
      bind: (...binds: unknown[]) => ({
        run: async () => {
          calls.push({ sql, binds });
          if (nextRunResult instanceof Error) {
            throw nextRunResult;
          }
          return nextRunResult;
        },
      }),
    }),
  };
  return {
    db: fake,
    calls,
    setRunResult: (result: { success: boolean } | Error) => {
      nextRunResult = result;
    },
  };
};

describe("NEWUSER_MODAL_* exports", () => {
  it("exposes a variant-id allow-list regex", () => {
    expect(NEWUSER_MODAL_VARIANT_RE).toBeInstanceOf(RegExp);
    // Allows legacy A/B + arbitrary slugs.
    expect(NEWUSER_MODAL_VARIANT_RE.test("a")).toBe(true);
    expect(NEWUSER_MODAL_VARIANT_RE.test("b")).toBe(true);
    expect(NEWUSER_MODAL_VARIANT_RE.test("control")).toBe(true);
    expect(NEWUSER_MODAL_VARIANT_RE.test("v2-bigger-cta")).toBe(true);
    // Rejects bad input.
    expect(NEWUSER_MODAL_VARIANT_RE.test("")).toBe(false);
    expect(NEWUSER_MODAL_VARIANT_RE.test("A")).toBe(false);
    expect(NEWUSER_MODAL_VARIANT_RE.test("too space")).toBe(false);
    expect(NEWUSER_MODAL_VARIANT_RE.test("x".repeat(33))).toBe(false);
  });

  it("exposes the expected event-type allow-list", () => {
    expect(NEWUSER_MODAL_EVENT_TYPES instanceof Set).toBe(true);
    expect(NEWUSER_MODAL_EVENT_TYPES.has("impression")).toBe(true);
    expect(NEWUSER_MODAL_EVENT_TYPES.has("copy")).toBe(true);
    expect(NEWUSER_MODAL_EVENT_TYPES.has("submit")).toBe(true);
    expect(NEWUSER_MODAL_EVENT_TYPES.size).toBe(3);
  });
});

describe("recordNewUserModalEvent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T10:00:00.000Z"));
  });

  afterEach(() => {
    setCloudflareContext(null);
    vi.useRealTimers();
  });

  it("returns null when D1 is not bound", async () => {
    setCloudflareContext({});
    const result = await recordNewUserModalEvent({
      sessionId: "abc123",
      variant: "a",
      eventType: "impression",
    });
    expect(result).toBeNull();
  });

  it("rejects a missing session id", async () => {
    const fake = makeFakeD1();
    setCloudflareContext({ DB: fake.db });
    const result = await recordNewUserModalEvent({
      sessionId: "",
      variant: "a",
      eventType: "impression",
    });
    expect(result).toEqual({ recorded: false, reason: "invalid session_id" });
    expect(fake.calls).toHaveLength(0);
  });

  it("rejects a session id with disallowed characters", async () => {
    const fake = makeFakeD1();
    setCloudflareContext({ DB: fake.db });
    const result = await recordNewUserModalEvent({
      sessionId: "abc; DROP TABLE x",
      variant: "a",
      eventType: "impression",
    });
    expect(result).toEqual({ recorded: false, reason: "invalid session_id" });
    expect(fake.calls).toHaveLength(0);
  });

  it("rejects a malformed variant id", async () => {
    const fake = makeFakeD1();
    setCloudflareContext({ DB: fake.db });
    const result = await recordNewUserModalEvent({
      sessionId: "abc123",
      // Spaces are disallowed by the variant-id regex.
      variant: "bad variant",
      eventType: "impression",
    });
    expect(result).toEqual({ recorded: false, reason: "invalid variant" });
    expect(fake.calls).toHaveLength(0);
  });

  it("accepts arbitrary slug-shaped variants", async () => {
    const fake = makeFakeD1();
    setCloudflareContext({ DB: fake.db });
    const result = await recordNewUserModalEvent({
      sessionId: "abc123",
      variant: "v2-bigger-cta",
      eventType: "impression",
    });
    expect(result).toEqual({ recorded: true });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].binds[2]).toBe("v2-bigger-cta");
  });

  it("rejects an unknown event type", async () => {
    const fake = makeFakeD1();
    setCloudflareContext({ DB: fake.db });
    const result = await recordNewUserModalEvent({
      sessionId: "abc123",
      variant: "a",
      eventType: "click",
    });
    expect(result).toEqual({ recorded: false, reason: "invalid event_type" });
    expect(fake.calls).toHaveLength(0);
  });

  it("inserts a row with the provided id", async () => {
    const fake = makeFakeD1();
    setCloudflareContext({ DB: fake.db });
    const result = await recordNewUserModalEvent({
      id: "nm_explicit_id",
      sessionId: "session_abc",
      variant: "b",
      eventType: "submit",
      country: "PH",
    });
    expect(result).toEqual({ recorded: true });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].sql).toContain(
      "INSERT OR IGNORE INTO newuser_modal_events",
    );
    expect(fake.calls[0].binds).toEqual([
      "nm_explicit_id",
      "session_abc",
      "b",
      "submit",
      "PH",
      "2026-05-15T10:00:00.000Z",
    ]);
  });

  it("generates a fresh id when none is provided", async () => {
    const fake = makeFakeD1();
    setCloudflareContext({ DB: fake.db });
    const result = await recordNewUserModalEvent({
      sessionId: "session_abc",
      variant: "a",
      eventType: "impression",
    });
    expect(result).toEqual({ recorded: true });
    expect(fake.calls).toHaveLength(1);
    const generatedId = fake.calls[0].binds[0] as string;
    expect(generatedId).toMatch(/^nm_\d+_[a-z0-9]+$/);
  });

  it("normalises country to null when falsy", async () => {
    const fake = makeFakeD1();
    setCloudflareContext({ DB: fake.db });
    await recordNewUserModalEvent({
      id: "nm_no_country",
      sessionId: "session_abc",
      variant: "a",
      eventType: "copy",
      country: "",
    });
    expect(fake.calls[0].binds[4]).toBeNull();
  });

  it("surfaces DB errors as { recorded: false, reason }", async () => {
    const fake = makeFakeD1();
    fake.setRunResult(new Error("constraint failed"));
    setCloudflareContext({ DB: fake.db });
    const result = await recordNewUserModalEvent({
      sessionId: "session_abc",
      variant: "a",
      eventType: "impression",
    });
    expect(result).toEqual({
      recorded: false,
      reason: "constraint failed",
    });
  });
});
