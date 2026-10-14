// ─────────────────────────────────────────────────────────────────────────────
// Server-only email-verification orchestration.
//
// Codes are minted and checked in Postgres (0005) so the rate limits are
// authoritative and survive across serverless instances; this module only
// validates input, drives the RPCs and hands the code to Resend.
// ─────────────────────────────────────────────────────────────────────────────
import "server-only";
import { serviceClient } from "./auth";
import { sendVerificationCodeEmail } from "./resend";
import { isValidEmail, isValidCode } from "../emailValidation";

export { isValidEmail, isValidCode };

export const CODE_TTL_SECONDS = 15 * 60;
export const CODE_LENGTH = 6;

/** Client-side limiter key: the first X-Forwarded-For hop (Vercel/edge). */
export function clientKeyFromRequest(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return `ip:${fwd.split(",")[0]!.trim() || "unknown"}`;
  return "ip:unknown";
}

export type MintResult =
  | { ok: true; code: string }
  | { ok: false; reason: "throttled" | "invalid" | "unavailable" };

/**
 * Ask Postgres to mint + store a code (enforcing all windows). Returns the
 * plaintext code when a code was stored, otherwise the failure reason. The
 * caller is responsible for delivery, so registration can decide to create the
 * user only after the limiter lets a code through.
 */
export async function mintVerificationCode(email: string, clientKey: string): Promise<MintResult> {
  if (!isValidEmail(email)) return { ok: false, reason: "invalid" };
  const db = serviceClient();
  const { data, error } = await db.rpc("request_email_code", {
    p_email: email,
    p_ttl_seconds: CODE_TTL_SECONDS,
    p_rate_key: clientKey,
  });
  if (error) return { ok: false, reason: "unavailable" };
  if (typeof data === "string" && /^[0-9]{6}$/.test(data)) return { ok: true, code: data };
  return { ok: false, reason: "throttled" };
}

/** Mint a code and deliver it via Resend in one call (resend path). */
export async function requestVerificationCode(
  email: string,
  clientKey: string,
  brandName: string,
): Promise<{ ok: boolean; reason?: "throttled" | "invalid" | "unavailable" | "notdelivered" }> {
  const minted = await mintVerificationCode(email, clientKey);
  if (!minted.ok) return { ok: false, reason: minted.reason };
  const delivered = await sendVerificationCodeEmail(email, minted.code, brandName);
  return delivered ? { ok: true } : { ok: false, reason: "notdelivered" };
}

export type VerifyResult = { ok: true } | { ok: false; error: string };

/** Verify an entered code and mark the account verified + confirmed. */
export async function verifyVerificationCode(email: string, code: string): Promise<VerifyResult> {
  if (!isValidEmail(email) || !isValidCode(code)) {
    return { ok: false, error: "Enter the 6-digit code we emailed you." };
  }
  const db = serviceClient();
  const { data, error } = await db.rpc("verify_email_code", { p_email: email, p_code: code });
  if (error) return { ok: false, error: "Verification is unavailable right now." };
  if (data !== true) return { ok: false, error: "That code is invalid or expired. Request a new one." };
  return { ok: true };
}
