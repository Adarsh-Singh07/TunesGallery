// ─────────────────────────────────────────────────────────────────────────────
// /api/tracks/[id]/finalize — verify the object really exists in R2 (HEAD)
// and mark the track ready. Duration (client-extracted) may be supplied.
// ─────────────────────────────────────────────────────────────────────────────

import { requireUser, unauthorized, forbidden } from "../../../../../lib/server/auth";
import { isR2Configured, objectExists, MAX_AUDIO_BYTES, MAX_ARTWORK_BYTES } from "../../../../../lib/server/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, { params }: Params) {
  const auth = await requireUser(req);
  if (!auth) return unauthorized();
  if (!auth.isAdmin) return forbidden("Only the library owner can finalize uploads");
  if (!isR2Configured()) {
    return Response.json({ error: "R2 storage is not configured" }, { status: 503 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) return Response.json({ error: "Invalid id" }, { status: 400 });

  let body: { kind?: string; durationSeconds?: number } = {};
  try {
    body = await req.json();
  } catch {
    // body optional
  }
  const kind = body.kind === "artwork" ? "artwork" : "audio";

  const { data: track } = await auth.db
    .from("tracks")
    .select("id, audio_key, artwork_key, status")
    .eq("id", id)
    .single();
  if (!track) return Response.json({ error: "Track not found" }, { status: 404 });

  if (kind === "audio") {
    if (!track.audio_key) return Response.json({ error: "Track has no audio key" }, { status: 409 });

    const head = await objectExists(track.audio_key);
    if (!head.exists) {
      await auth.db.from("tracks").update({ status: "failed" }).eq("id", id);
      return Response.json({ error: "Audio object not found in storage" }, { status: 412 });
    }
    if ((head.size ?? 0) > MAX_AUDIO_BYTES) {
      await auth.db.from("tracks").update({ status: "failed" }).eq("id", id);
      return Response.json({ error: "Audio object exceeds size limit" }, { status: 413 });
    }

    const patch: Record<string, unknown> = {
      status: "ready",
      size_bytes: head.size ?? null,
    };
    if (typeof body.durationSeconds === "number" && body.durationSeconds > 0) {
      patch.duration_seconds = body.durationSeconds;
    }
    const { data: updated, error } = await auth.db
      .from("tracks")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ track: updated });
  }

  // artwork finalize
  if (!track.artwork_key) return Response.json({ error: "Track has no artwork key" }, { status: 409 });
  const head = await objectExists(track.artwork_key);
  if (!head.exists) return Response.json({ error: "Artwork object not found in storage" }, { status: 412 });
  if ((head.size ?? 0) > MAX_ARTWORK_BYTES) {
    return Response.json({ error: "Artwork object exceeds size limit" }, { status: 413 });
  }

  const { data: updated, error } = await auth.db
    .from("tracks")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ track: updated });
}
