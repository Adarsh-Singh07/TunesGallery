import { bodyJson, json, ApiError, text } from "../../../../lib/server/http";
import { serviceClient } from "../../../../lib/server/auth";
import { isResendConfigured, sendVerificationCodeEmail } from "../../../../lib/server/resend";
import { clientKeyFromRequest, mintVerificationCode } from "../../../../lib/server/emailVerification";
import { site } from "../../../../data/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Registration runs through the server so the rate limits are authoritative and
// the created account starts unconfirmed (locked until its code is verified).
export async function POST(req: Request) {
  if (!isResendConfigured()) {
    throw new ApiError(503, "Email verification is not available yet. Try again soon.");
  }
  const body = await bodyJson(req);
  const email = text(body.email, 254, true).toLowerCase();
  const password = text(body.password, 128, true);
  const displayName = "display_name" in body ? text(body.display_name, 80) : "";
  if (password.length < 8) throw new ApiError(400, "Password must be at least 8 characters.");

  const clientKey = clientKeyFromRequest(req);
  const minted = await mintVerificationCode(email, clientKey);
  if (!minted.ok) {
    if (minted.reason === "throttled") throw new ApiError(429, "Too many accounts from this address. Try again later.");
    if (minted.reason === "unavailable") throw new ApiError(503, "Could not create the account right now. Try again.");
    throw new ApiError(400, "Enter a valid email and password.");
  }

  const db = serviceClient();
  const { error: createError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: displayName ? { display_name: displayName } : {},
  });
  if (createError) {
    if (/already.*registered|duplicate/i.test(createError.message ?? "")) {
      throw new ApiError(409, "An account already exists for this email. Sign in instead.");
    }
    throw new ApiError(503, "Could not create the account. Try again.");
  }

  const delivered = await sendVerificationCodeEmail(email, minted.code, site.name);
  return json({ ok: true, delivered }, 201);
}
