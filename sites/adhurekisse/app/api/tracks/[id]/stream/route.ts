// ─────────────────────────────────────────────────────────────────────────────
// /api/tracks/[id]/stream — short-lived presigned playback URL.
//
// Authorization is central here: knowing the track id grants nothing. RLS
// (has_track_access) covers owner / admin / explicit grant / active jam
// participant. Without permission we return 403 — never a URL.
//
// The signed URL is returned only in the JSON response body; it is never
// logged and no analytics see it.
// ─────────────────────────────────────────────────────────────────────────────

import { requireUser, unauthorized } from "../../../../../lib/server/auth";
import { isR2Configured, presignStream } from "../../../../../lib/server/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, { params }: Params) {
  const auth = await requireUser(req);
  if (!auth) return unauthorized("Sign in to stream this track");
  if (!isR2Configured()) {
    return Response.json({ error: "Streaming is not configured" }, { status: 503 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) return Response.json({ error: "Invalid id" }, { status: 400 });

  // RLS-filtered select: returns the row only when the caller has access.
  const { data: track, error } = await auth.db
    .from("tracks")
    .select("id, audio_key, status, mime_type")
    .eq("id", id)
    .single();

  if (error || !track) {
    return Response.json({ error: "Track not found or access denied" }, { status: 404 });
  }
  if (track.status !== "ready" || !track.audio_key) {
    return Response.json({ error: "Track audio is not available yet" }, { status: 409 });
  }

  try {
    const { url, expiresAt } = await presignStream(track.audio_key);
    return Response.json(
      { url, expiresAt, mimeType: track.mime_type ?? "audio/mpeg" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    // Never include the URL or credentials in an error path
    console.error("stream presign failed for track", id, err instanceof Error ? err.name : err);
    return Response.json({ error: "Failed to authorize streaming" }, { status: 500 });
  }
}
