import { bodyJson, json, ApiError, text } from "../../../../lib/server/http";
import { isResendConfigured } from "../../../../lib/server/resend";
import { clientKeyFromRequest, requestVerificationCode } from "../../../../lib/server/emailVerification";
import { site } from "../../../../data/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resend an account-verification code. Returns one generic success response so
// callers cannot enumerate which addresses already have accounts.
export async function POST(req: Request) {
  if (!isResendConfigured()) throw new ApiError(503, "Email verification is not available yet.");
  const body = await bodyJson(req);
  const email = text(body.email, 254, true).toLowerCase();
  const clientKey = clientKeyFromRequest(req);

  const result = await requestVerificationCode(email, clientKey, site.name);
  if (!result.ok) {
    // Enumerably safe: only the reason is logged, never returned.
    console.error("email-code: not delivered", result.reason);
  }
  return json({ ok: true });
}
