import { describe, it, expect } from "vitest";
import {
  sanitizeText,
  isValidEmail,
  isValidPhone,
  enforceMaxLength,
  formatPhPhone,
} from "@/lib/sanitize";

describe("sanitizeText", () => {
  it("strips HTML tags (but keeps their text content) and trims whitespace", () => {
    // The current implementation removes only the angle-bracketed tag
    // tokens; inner text is preserved so a benign comment like
    // `<b>hello</b>` becomes `hello`. This documents that contract.
    expect(sanitizeText("  <script>alert(1)</script>hello  ")).toBe(
      "alert(1)hello",
    );
  });

  it("removes nested tags greedily within a single line", () => {
    expect(sanitizeText("<b>foo<i>bar</i></b>")).toBe("foobar");
  });

  it("leaves plain text unchanged after trim", () => {
    expect(sanitizeText("  plain text  ")).toBe("plain text");
  });
});

describe("isValidEmail", () => {
  it("accepts a normal email address", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("u.s+er@example.co.uk")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("no@domain")).toBe(false);
    expect(isValidEmail("a b@example.com")).toBe(false);
    expect(isValidEmail("@example.com")).toBe(false);
  });

  it("rejects addresses longer than 254 characters", () => {
    const local = "a".repeat(250);
    expect(isValidEmail(`${local}@x.io`)).toBe(false);
  });
});

describe("isValidPhone", () => {
  it("accepts common PH and international formats", () => {
    expect(isValidPhone("+63 917 123 4567")).toBe(true);
    expect(isValidPhone("0917-123-4567")).toBe(true);
    expect(isValidPhone("(02) 8123-4567")).toBe(true);
  });

  it("rejects too-short or alphabetic strings", () => {
    expect(isValidPhone("123")).toBe(false);
    expect(isValidPhone("abc1234567")).toBe(false);
  });
});

describe("enforceMaxLength", () => {
  it("returns the input untouched when shorter than max", () => {
    expect(enforceMaxLength("hi", 10)).toBe("hi");
  });

  it("truncates input longer than max", () => {
    expect(enforceMaxLength("0123456789", 5)).toBe("01234");
  });
});

describe("formatPhPhone", () => {
  it("returns empty string for empty input", () => {
    expect(formatPhPhone("")).toBe("");
  });

  it("formats a +63-prefixed full mobile number", () => {
    expect(formatPhPhone("+639171234567")).toBe("+63 917 123 4567");
  });

  it("formats a 0-prefixed full mobile number", () => {
    expect(formatPhPhone("09171234567")).toBe("0917 123 4567");
  });

  it("assumes a leading 0 when the input starts with 9", () => {
    expect(formatPhPhone("9171234567")).toBe("0917 123 4567");
  });

  it("groups progressively while the user is still typing", () => {
    expect(formatPhPhone("0917")).toBe("0917");
    expect(formatPhPhone("091712")).toBe("0917 12");
    expect(formatPhPhone("0917123")).toBe("0917 123");
    expect(formatPhPhone("09171234")).toBe("0917 123 4");
  });

  it("caps the mobile core at 10 digits", () => {
    expect(formatPhPhone("091712345671234")).toBe("0917 123 4567");
  });

  it("leaves non-PH-mobile international inputs in their raw shape", () => {
    // International number that isn't +63 9XX should not be reshaped.
    expect(formatPhPhone("+1 555 0100")).toBe("+1 555 0100");
  });

  it("returns empty string for input with no digits", () => {
    // The implementation strips non-digits first; if nothing's left,
    // it returns empty string (or just '+').
    expect(formatPhPhone("not a number")).toBe("");
  });
});
