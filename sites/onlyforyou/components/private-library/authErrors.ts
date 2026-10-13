import { errorMessage } from "./api";

export const registrationNotice = "If this email can be registered, check your inbox for a confirmation link. If you already have an account, sign in instead.";
export const activationNotice = "Your account can’t enter yet. Confirm your email, then try again. If you’ve already confirmed, ask the owner to check your account access.";

export function isDuplicateSignup(error: unknown): boolean {
  const record = error as { message?: string; code?: string } | null;
  return /already (?:been )?registered|already exists|user_already_exists|email_exists/i.test(`${record?.code} ${record?.message}`);
}

export function loginError(error: unknown, mode: "otp" | "password" | "verify" | "register" | "activate"): string {
  const record = error as { message?: string; code?: string; status?: number };
  const text = record?.message ?? "";
  if (record?.status === 429 || /rate.limit|too many|security purposes/i.test(text)) return "Too many attempts. Wait a minute before trying again.";
  if (error instanceof TypeError || /fetch|network/i.test(text)) return "Could not connect. Check your connection and try again.";
  if (mode === "activate") return text === activationNotice ? text : "Account setup is temporarily unavailable. Please try again, or ask the owner to check account registration.";
  if (isDuplicateSignup(error)) return registrationNotice;
  if (/signup_disabled|signups?[_ ](?:disabled|not allowed)/i.test(`${record?.code} ${text}`)) return "Account registration is currently disabled. Ask the owner to enable email sign-ups.";
  if (/email_not_confirmed|email not confirmed/i.test(`${record?.code} ${text}`)) return "Confirm your email using the link in your inbox, then sign in again.";
  if (/user_banned|account.*disabled/i.test(`${record?.code} ${text}`)) return "Your account is unavailable. Ask the owner to check your account access.";
  if (/not allowed|not found|user_not_found/i.test(`${record?.code} ${text}`)) return "We couldn’t find that account. Check your email or create an account first.";
  if (mode === "register" && /password/i.test(`${record?.code} ${text}`)) return "Choose a stronger password with at least 8 characters. Avoid common or compromised passwords.";
  if (mode === "password" && /invalid.*credentials|invalid.*login/i.test(`${record?.code} ${text}`)) return "Email or password didn’t match. Try again, or use an email sign-in code.";
  if (mode === "verify" && /expired|invalid|otp/i.test(`${record?.code} ${text}`)) return "That code is invalid or has expired. Request a fresh code and try again.";
  return text || errorMessage(error);
}
