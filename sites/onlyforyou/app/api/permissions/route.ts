// ─────────────────────────────────────────────────────────────────────────────
// /api/permissions — admin-only per-user track access grants.
// A jam invitation never opens the whole library; grants live here.
// ─────────────────────────────────────────────────────────────────────────────

import { requireUser, unauthorized, forbidden } from "../../../lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return unauthorized();
  if (!auth.isAdmin) return forbidden();

  const { data, error } = await auth.db
    .from("track_permissions")
    .select("track_id, user_id, granted_by, created_at, profiles(display_name, email)")
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ permissions: data ?? [] });
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return unauthorized();
  if (!auth.isAdmin) return forbidden();

  let body: { trackId?: string; userId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { trackId, userId } = body;
  if (!trackId || !userId || !UUID_RE.test(trackId) || !UUID_RE.test(userId)) {
    return Response.json({ error: "trackId and userId (UUIDs) are required" }, { status: 400 });
  }

  const { error } = await auth.db
    .from("track_permissions")
    .upsert(
      { track_id: trackId, user_id: userId, granted_by: auth.userId },
      { onConflict: "track_id,user_id" },
    );
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return unauthorized();
  if (!auth.isAdmin) return forbidden();

  const { searchParams } = new URL(req.url);
  const trackId = searchParams.get("trackId") ?? "";
  const userId = searchParams.get("userId") ?? "";
  if (!UUID_RE.test(trackId) || !UUID_RE.test(userId)) {
    return Response.json({ error: "trackId and userId (UUIDs) are required" }, { status: 400 });
  }

  const { error } = await auth.db
    .from("track_permissions")
    .delete()
    .eq("track_id", trackId)
    .eq("user_id", userId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
