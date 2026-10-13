import { describe, expect, it } from "vitest";
import { activationNotice, isDuplicateSignup, loginError, registrationNotice } from "../../components/private-library/authErrors";

describe("account errors", () => {
  it("does not assert that duplicate signups created an account or delivered mail", () => {
    for (const error of [{ code: "user_already_exists", message: "User already registered" }, { code: "email_exists" }, new Error("A user with this email address has already been registered")]) {
      expect(isDuplicateSignup(error)).toBe(true);
      expect(loginError(error, "register")).toBe(registrationNotice);
    }
    expect(registrationNotice).toMatch(/If this email can be registered/);
    expect(registrationNotice).not.toMatch(/account created|email sent/i);
  });
  it("explains rate limits, disabled signups, confirmation and password policy separately", () => {
    expect(loginError({ code: "signup_disabled" }, "register")).toMatch(/registration is currently disabled/);
    expect(loginError({ status: 429 }, "register")).toMatch(/Wait a minute/);
    expect(loginError({ code: "weak_password" }, "register")).toMatch(/stronger password/);
    expect(loginError({ code: "email_not_confirmed" }, "password")).toMatch(/Confirm your email/);
    expect(loginError({ code: "user_banned" }, "password")).toMatch(/account access/);
  });
  it("does not misdiagnose denied activation or a missing RPC as an unregistered account", () => {
    expect(loginError(new Error(activationNotice), "activate")).toBe(activationNotice);
    expect(activationNotice).toMatch(/already confirmed.*owner/);
    expect(loginError({ code: "PGRST202", message: "Could not find the function public.activate_account" }, "activate")).toMatch(/setup is temporarily unavailable/);
    expect(loginError(new TypeError("Failed to fetch"), "activate")).toMatch(/connection/);
  });
});
