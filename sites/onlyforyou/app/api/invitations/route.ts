import { serviceClient } from "../../../lib/server/auth";
import { api, ApiError, bodyJson, dbError, json, text, uuid } from "../../../lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return api(req, "read", true, async (auth) => {
    const { data, error } = await auth.db.from("invitations")
      .select("id,email,code,expires_at,accepted_at,accepted_user_id,revoked_at,created_at")
      .order("created_at", { ascending: false }).limit(100);
    dbError(error);
    return json({ invitations: data ?? [] });
  });
}

export async function POST(req: Request) {
  return api(req, "invitation", true, async (auth) => {
    const body = await bodyJson(req);
    const email = text(body.email, 254, true).toLowerCase();
    const days = body.expiresInDays ?? 14;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > 30) {
      throw new ApiError(400, "Invalid invitation");
    }
    const { data, error } = await auth.db.rpc("manage_invitation", { p_action: "create", p_email: email, p_days: days });
    dbError(error);
    // DB invitation is authoritative. Auth's email delivery is a separate
    // service; keep the record retryable and accurately report delivery status.
    let delivery: "sent" | "existing_account" | "pending" = "pending";
    try {
      const result = await serviceClient().auth.admin.inviteUserByEmail(email);
      delivery = !result.error ? "sent" : result.error.code === "email_exists" || result.error.code === "user_already_exists" ? "existing_account" : "pending";
    } catch { /* no provider diagnostics or credentials in the response */ }
    return json({ invitation: data, delivery }, 201);
  });
}

export async function DELETE(req: Request) {
  return api(req, "invitation", true, async (auth) => {
    const { error } = await auth.db.rpc("manage_invitation", {
      p_action: "revoke", p_id: uuid(new URL(req.url).searchParams.get("id")),
    });
    dbError(error);
    return json({ ok: true });
  });
}
