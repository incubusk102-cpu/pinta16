import { describe, it, expect } from "vitest";
// @ts-expect-error — Pages Functions are plain JS modules and have no .d.ts.
import {
  parseCookies,
  readCookie,
  serializeCookie,
  clearCookieHeader,
} from "../../../functions/api/_lib/cookies.js";

const eventWith = (cookie: string | undefined) => ({
  headers: cookie === undefined ? {} : { cookie },
});

describe("parseCookies", () => {
  it("returns an empty object when no Cookie header is present", () => {
    expect(parseCookies({})).toEqual({});
    expect(parseCookies({ headers: {} })).toEqual({});
    expect(parseCookies(eventWith(""))).toEqual({});
  });

  it("parses a single name=value pair", () => {
    expect(parseCookies(eventWith("session=abc123"))).toEqual({
      session: "abc123",
    });
  });

  it("parses multiple pairs separated by ; or , and trims whitespace", () => {
    expect(parseCookies(eventWith("a=1; b=2;c=3"))).toEqual({
      a: "1",
      b: "2",
      c: "3",
    });
  });

  it("URI-decodes the value when possible", () => {
    expect(parseCookies(eventWith("greeting=hello%20world"))).toEqual({
      greeting: "hello world",
    });
  });

  it("falls back to the raw value when decodeURIComponent throws", () => {
    // %ZZ is not a valid escape; decodeURIComponent will throw.
    expect(parseCookies(eventWith("broken=%ZZ"))).toEqual({ broken: "%ZZ" });
  });

  it("keeps the first occurrence when a cookie is duplicated", () => {
    expect(parseCookies(eventWith("dup=first; dup=second"))).toEqual({
      dup: "first",
    });
  });

  it("supports capital-cased 'Cookie' header (defence in depth)", () => {
    expect(parseCookies({ headers: { Cookie: "x=y" } })).toEqual({ x: "y" });
  });
});

describe("readCookie", () => {
  it("returns the named cookie's value", () => {
    expect(readCookie(eventWith("session=abc; csrf=def"), "csrf")).toBe("def");
  });

  it("returns null when the cookie is missing", () => {
    expect(readCookie(eventWith("session=abc"), "missing")).toBeNull();
  });
});

describe("serializeCookie", () => {
  it("emits HttpOnly, Secure, SameSite=Strict, Path=/ by default", () => {
    const header = serializeCookie("session", "abc");
    expect(header).toContain("session=abc");
    expect(header).toContain("Path=/");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Strict");
  });

  it("URI-encodes the value", () => {
    expect(serializeCookie("data", "hello world")).toContain(
      "data=hello%20world",
    );
  });

  it("honours maxAgeSeconds with both Max-Age and Expires", () => {
    const header = serializeCookie("s", "v", { maxAgeSeconds: 3600 });
    expect(header).toMatch(/Max-Age=3600/);
    expect(header).toMatch(/Expires=/);
  });

  it("normalises sameSite to capitalised forms", () => {
    expect(serializeCookie("s", "v", { sameSite: "lax" })).toContain(
      "SameSite=Lax",
    );
    expect(serializeCookie("s", "v", { sameSite: "none" })).toContain(
      "SameSite=None",
    );
  });

  it("omits SameSite when explicitly set to false", () => {
    const header = serializeCookie("s", "v", { sameSite: false });
    expect(header).not.toMatch(/SameSite=/);
  });

  it("respects httpOnly: false and secure: false overrides (e.g. CSRF cookie)", () => {
    const header = serializeCookie("cv_csrf", "tok", {
      httpOnly: false,
      secure: false,
    });
    expect(header).not.toContain("HttpOnly");
    expect(header).not.toContain("Secure");
  });

  it("throws when name is missing or not a string", () => {
    // @ts-expect-error — testing runtime guard.
    expect(() => serializeCookie(undefined, "v")).toThrow(/name is required/);
    // @ts-expect-error — testing runtime guard.
    expect(() => serializeCookie(123, "v")).toThrow(/name is required/);
  });
});

describe("clearCookieHeader", () => {
  it("returns a Max-Age=0 cookie that browsers treat as deletion", () => {
    const header = clearCookieHeader("session");
    expect(header).toContain("session=");
    expect(header).toContain("Max-Age=0");
    // Expires should be the Unix epoch (1970).
    expect(header).toMatch(/Expires=.*1970/);
  });
});
