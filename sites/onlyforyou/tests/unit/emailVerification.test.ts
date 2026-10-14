import { describe, expect, it } from "vitest";
import { isValidEmail, isValidCode } from "../../lib/emailValidation";

describe("email verification input guards", () => {
  it("accepts well-formed addresses and rejects malformed ones", () => {
    expect(isValidEmail("ada@example.com")).toBe(true);
    expect(isValidEmail("a.b+c@sub.domain.co")).toBe(true);
    expect(isValidEmail("missing-at-sign.com")).toBe(false);
    expect(isValidEmail("no-tld@localhost")).toBe(false);
    expect(isValidEmail("a b@c.com")).toBe(false);
    expect(isValidEmail(123)).toBe(false);
    expect(isValidEmail("".padEnd(255, "a") + "@x.com")).toBe(false);
  });

  it("accepts exactly a six-digit code and nothing else", () => {
    expect(isValidCode("123456")).toBe(true);
    expect(isValidCode("000000")).toBe(true);
    expect(isValidCode("12345")).toBe(false);
    expect(isValidCode("1234567")).toBe(false);
    expect(isValidCode("abc123")).toBe(false);
    expect(isValidCode(" 123456")).toBe(false);
    expect(isValidCode(123456)).toBe(false);
  });
});
