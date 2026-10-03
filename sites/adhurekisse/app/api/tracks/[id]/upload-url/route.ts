// ─────────────────────────────────────────────────────────────────────────────
// /api/tracks/[id]/upload-url — (re)issue a presigned upload for a pending
// track's audio, or for its artwork. Used for retries and artwork replacement.
// ─────────────────────────────────────────────────────────────────────────────

import { requireUser, unauthorized, forbidden } from "../../../../../lib/server/auth";
import {
  isR2Configured,
  presignUpload,
  audioKey,
  artworkKey,
  extFromMime,
  ALLOWED_AUDIO_MIME,
  ALLOWED_ARTWORK_MIME,
  MAX_AUDIO_BYTES,
  MAX_ARTWORK_BYTES,
} from "../../../../../lib/server/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, { params }: Params) {
  const auth = await requireUser(req);
  if (!auth) return unauthorized();
  if (!auth.isAdmin) return forbidden("Only the library owner can upload tracks");
  if (!isR2Configured()) {
    return Response.json({ error: "R2 storage is not configured" }, { status: 503 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) return Response.json({ error: "Invalid id" }, { status: 400 });

  let body: { kind?: string; mimeType?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data: track } = await auth.db
    .from("tracks")
    .select("id, owner_id, mime_type, status")
    .eq("id", id)
    .single();
  if (!track) return Response.json({ error: "Track not found" }, { status: 404 });

  const kind = body.kind === "artwork" ? "artwork" : "audio";

  if (kind === "audio" && track.status === "ready") {
    return Response.json({ error: "Audio already uploaded" }, { status: 409 });
  }

  const mime = (body.mimeType ?? "").toLowerCase();
  const allowed = kind === "audio" ? ALLOWED_AUDIO_MIME : ALLOWED_ARTWORK_MIME;
  const maxBytes = kind === "audio" ? MAX_AUDIO_BYTES : MAX_ARTWORK_BYTES;
  if (!allowed.has(mime)) {
    return Response.json({ error: `Unsupported ${kind} type "${mime || "(none)"}"` }, { status: 415 });
  }

  const key =
    kind === "audio"
      ? audioKey(track.id, extFromMime(mime))
      : artworkKey(track.id, extFromMime(mime));

  const upload = await presignUpload(key, mime, maxBytes);

  // Record the artwork key up front so finalize can find it
  if (kind === "artwork") {
    await auth.db.from("tracks").update({ artwork_key: key }).eq("id", track.id);
  }

  return Response.json({ key, upload });
}
