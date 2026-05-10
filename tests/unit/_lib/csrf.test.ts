import { describe, it, expect } from "vitest";
// @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  STATE_CHANGING_METHODS,
  generateCsrfToken,
  verifyCsrf,
} from "../../../functions/api/_lib/csrf.js";

describe("constants", () => {
  it("exposes the expected cookie / header names", () => {
    expect(CSRF_COOKIE_NAME).toBe("cv_csrf");
    expect(CSRF_HEADER_NAME).toBe("x-csrf-token");
  });

  it("treats POST / PUT / PATCH / DELETE as state-changing", () => {
    expect(STATE_CHANGING_METHODS.has("POST")).toBe(true);
    expect(STATE_CHANGING_METHODS.has("PUT")).toBe(true);
    expect(STATE_CHANGING_METHODS.has("PATCH")).toBe(true);
    expect(STATE_CHANGING_METHODS.has("DELETE")).toBe(true);
    expect(STATE_CHANGING_METHODS.has("GET")).toBe(false);
    expect(STATE_CHANGING_METHODS.has("HEAD")).toBe(false);
    expect(STATE_CHANGING_METHODS.has("OPTIONS")).toBe(false);
  });
});

describe("generateCsrfToken", () => {
  it("returns 64 lowercase hex characters (32 random bytes)", () => {
    const tok = generateCsrfToken();
    expect(tok).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns a different value on each call (entropy sanity check)", () => {
    const samples = new Set(
      Array.from({ length: 64 }, () => generateCsrfToken()),
    );
    // All 64 calls should return distinct tokens with 256 bits of entropy.
    expect(samples.size).toBe(64);
  });
});

describe("verifyCsrf", () => {
  const buildEvent = (cookieValue?: string, headerValue?: string) => ({
    headers: {
      ...(cookieValue !== undefined
        ? { cookie: `cv_csrf=${cookieValue}` }
        : {}),
      ...(headerValue !== undefined ? { "x-csrf-token": headerValue } : {}),
    },
  });

  it("passes when usingCookieAuth is false (e.g. Bearer header auth)", () => {
    expect(
      verifyCsrf(buildEvent(), { method: "POST", usingCookieAuth: false }),
    ).toBe(true);
  });

  it("passes for safe methods regardless of token presence", () => {
    expect(
      verifyCsrf(buildEvent(), { method: "GET", usingCookieAuth: true }),
    ).toBe(true);
    expect(
      verifyCsrf(buildEvent(), { method: "HEAD", usingCookieAuth: true }),
    ).toBe(true);
  });

  it("passes when cookie and header match exactly", () => {
    const tok = generateCsrfToken();
    expect(
      verifyCsrf(buildEvent(tok, tok), {
        method: "POST",
        usingCookieAuth: true,
      }),
    ).toBe(true);
  });

  it("fails when the cookie is missing on a state-changing cookie-auth request", () => {
    expect(
      verifyCsrf(buildEvent(undefined, "anything"), {
        method: "POST",
        usingCookieAuth: true,
      }),
    ).toBe(false);
  });

  it("fails when the header is missing on a state-changing cookie-auth request", () => {
    const tok = generateCsrfToken();
    expect(
      verifyCsrf(buildEvent(tok, undefined), {
        method: "POST",
        usingCookieAuth: true,
      }),
    ).toBe(false);
  });

  it("fails when cookie and header do not match", () => {
    const tokA = generateCsrfToken();
    const tokB = generateCsrfToken();
    expect(
      verifyCsrf(buildEvent(tokA, tokB), {
        method: "POST",
        usingCookieAuth: true,
      }),
    ).toBe(false);
  });

  it("compares case-sensitively (constant-time byte equality)", () => {
    const tok = "a".repeat(64);
    expect(
      verifyCsrf(buildEvent(tok, tok.toUpperCase()), {
        method: "POST",
        usingCookieAuth: true,
      }),
    ).toBe(false);
  });
});
