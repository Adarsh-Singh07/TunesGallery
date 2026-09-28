// ─────────────────────────────────────────────────────────────────────────────
// /api/tracks/[id] — metadata edit (PATCH) and removal (DELETE).
// DELETE also removes the R2 audio + artwork objects.
// ─────────────────────────────────────────────────────────────────────────────

import { requireUser, unauthorized, forbidden } from "../../../../lib/server/auth";
import { isR2Configured, deleteObjects } from "../../../../lib/server/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireUser(req);
  if (!auth) return unauthorized();

  const { id } = await params;
  if (!UUID_RE.test(id)) return Response.json({ error: "Invalid id" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  for (const field of ["title", "artist", "album", "movie", "year"] as const) {
    if (field in body) {
      const value = String(body[field] ?? "").trim().slice(0, 300);
      patch[field] = value || null;
    }
  }
  if (Array.isArray(body.tags)) {
    patch.tags = body.tags.slice(0, 20).map((t) => String(t).slice(0, 50));
  }
  if ("duration_seconds" in body && typeof body.duration_seconds === "number") {
    patch.duration_seconds = Math.max(0, body.duration_seconds);
  }
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await auth.db
    .from("tracks")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116" || error.message.includes("0 rows")) {
      return Response.json({ error: "Track not found" }, { status: 404 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ track: data });
}

export async function DELETE(req: Request, { params }: Params) {
  const auth = await requireUser(req);
  if (!auth) return unauthorized();
  if (!auth.isAdmin) return forbidden("Only the library owner can delete tracks");

  const { id } = await params;
  if (!UUID_RE.test(id)) return Response.json({ error: "Invalid id" }, { status: 400 });

  const { data: track } = await auth.db
    .from("tracks")
    .select("id, audio_key, artwork_key")
    .eq("id", id)
    .single();
  if (!track) return Response.json({ error: "Track not found" }, { status: 404 });

  const { error: dbError } = await auth.db.from("tracks").delete().eq("id", id);
  if (dbError) return Response.json({ error: dbError.message }, { status: 500 });

  // Storage cleanup is best-effort after the DB row is gone — the object key
  // is unreachable without the row, so a failed delete only orphans bytes.
  if (isR2Configured()) {
    await deleteObjects([track.audio_key, track.artwork_key].filter(Boolean) as string[])
      .catch(() => {});
  }

  return Response.json({ ok: true });
}
