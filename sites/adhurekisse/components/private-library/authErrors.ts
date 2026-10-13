import { errorMessage } from "./api";

export function loginError(error: unknown, mode: "otp" | "password" | "verify"): string {
  const record = error as { message?: string; code?: string; status?: number };
  const text = record?.message ?? "";
  if (record?.status === 429 || /rate.limit|too many|security purposes/i.test(text)) return "Too many attempts. Wait a minute before trying again.";
  if (/not allowed|not found|signups? disabled|user_not_found/i.test(`${record?.code} ${text}`)) return "This email hasn’t been invited yet. Ask the room’s owner to set up your invitation.";
  if (mode === "password" && /invalid.*credentials|invalid.*login/i.test(`${record?.code} ${text}`)) return "Email or password didn’t match. Try again, or use an email sign-in code.";
  if (mode === "verify" && /expired|invalid|otp/i.test(`${record?.code} ${text}`)) return "That code is invalid or has expired. Request a fresh code and try again.";
  if (error instanceof TypeError || /fetch|network/i.test(text)) return "Could not connect. Check your connection and try again.";
  return text || errorMessage(error);
}
