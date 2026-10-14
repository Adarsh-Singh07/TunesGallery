import { bodyJson, json, text } from "../../../../lib/server/http";
import { verifyVerificationCode } from "../../../../lib/server/emailVerification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Verify the code entered after registration. On success the account becomes
// usable; activation + sign-in proceed on the next session check.
export async function POST(req: Request) {
  const body = await bodyJson(req);
  const email = text(body.email, 254, true).toLowerCase();
  const code = text(body.code, 10, true);
  const result = await verifyVerificationCode(email, code);
  if (!result.ok) {
    // Same shape whether the address exists or not, to avoid enumeration.
    return json({ ok: false, error: result.error }, 400);
  }
  return json({ ok: true });
}
