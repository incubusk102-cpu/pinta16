import { describe, it, expect, vi, afterEach } from "vitest";
// @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
import {
  redactPII,
  logError,
  logWarn,
} from "../../../functions/api/_lib/redact.js";

describe("redactPII", () => {
  it("returns the literal 'null' / 'undefined' for nullish input", () => {
    expect(redactPII(null)).toBe("null");
    expect(redactPII(undefined)).toBe("undefined");
  });

  it("masks an email address while preserving its first character and domain", () => {
    const out = redactPII("contact buyer at jane.doe@example.com please");
    expect(out).toContain("j***@example.com");
    expect(out).not.toContain("jane.doe");
  });

  it("masks multiple email addresses in one message", () => {
    const out = redactPII("from a@example.com to b@example.com");
    expect(out).toMatch(/a\*\*\*@example\.com/);
    expect(out).toMatch(/b\*\*\*@example\.com/);
  });

  it("redacts IPv4 addresses", () => {
    const out = redactPII("blocked 192.168.1.42 for abuse");
    expect(out).toContain("[REDACTED_IP]");
    expect(out).not.toContain("192.168.1.42");
  });

  it("redacts IPv6 addresses including shortened forms", () => {
    const out = redactPII("origin 2001:db8::1 reached us");
    expect(out).toContain("[REDACTED_IP]");
    expect(out).not.toContain("2001:db8::1");
  });

  it("redacts Philippine mobile numbers", () => {
    const out = redactPII("call +63 917 123 4567 for follow up");
    expect(out).toMatch(/\[REDACTED_PHONE_\d+\]/);
    expect(out).not.toContain("917 123 4567");
  });

  it("handles Error instances and includes the stack", () => {
    const err = new Error("payment failed for jane@example.com");
    const out = redactPII(err);
    expect(out).toContain("payment failed");
    expect(out).not.toContain("jane@example.com");
    expect(out).toContain("j***@example.com");
  });

  it("serialises non-Error objects to JSON first", () => {
    const out = redactPII({ email: "jane@example.com", note: "hi" });
    expect(out).toContain("j***@example.com");
    expect(out).toContain('"note":"hi"');
  });

  it("falls back to String() when JSON.stringify throws (cyclic ref)", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    // Cyclic objects cause JSON.stringify to throw; redactPII catches and
    // falls back to String(value) which is "[object Object]".
    expect(() => redactPII(cyclic)).not.toThrow();
  });
});

describe("logError / logWarn", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes through plain strings without scrubbing when no PII markers are present", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logError("clean message with no markers");
    expect(spy).toHaveBeenCalledWith("clean message with no markers");
  });

  it("scrubs string arguments that contain digits or @", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logError("user", "jane@example.com tried to log in");
    expect(spy).toHaveBeenCalled();
    const args = spy.mock.calls[0];
    expect(args[1]).toContain("j***@example.com");
  });

  it("forwards Error arguments through redactPII", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logWarn("oops", new Error("blocked 10.0.0.1"));
    expect(spy).toHaveBeenCalled();
    const args = spy.mock.calls[0];
    expect(String(args[1])).toContain("[REDACTED_IP]");
  });
});
