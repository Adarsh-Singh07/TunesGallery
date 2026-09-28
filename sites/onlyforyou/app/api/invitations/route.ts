// ─────────────────────────────────────────────────────────────────────────────
// /api/invitations — admin-only invitation management.
// Invitations create a join code + expiry; the invited person then signs in
// with an email OTP on /login. Invitation ≠ library access: tracks are still
// granted individually via /api/permissions.
// ─────────────────────────────────────────────────────────────────────────────

import { requireUser, unauthorized, forbidden } from "../../../lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return unauthorized();
  if (!auth.isAdmin) return forbidden();

  const { data, error } = await auth.db
    .from("invitations")
    .select("id, email, code, expires_at, accepted_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ invitations: data ?? [] });
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return unauthorized();
  if (!auth.isAdmin) return forbidden();

  let body: { email?: string; expiresInDays?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return Response.json({ error: "A valid email address is required" }, { status: 400 });
  }

  const days = Math.min(Math.max(body.expiresInDays ?? 14, 1), 30);
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await auth.db
    .from("invitations")
    .insert({ email, invited_by: auth.userId, expires_at: expiresAt })
    .select("id, email, code, expires_at")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ invitation: data }, { status: 201 });
}

export async function DELETE(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return unauthorized();
  if (!auth.isAdmin) return forbidden();

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") ?? "";
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(id)) return Response.json({ error: "id is required" }, { status: 400 });

  const { error } = await auth.db.from("invitations").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
