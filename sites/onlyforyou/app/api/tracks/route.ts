// ─────────────────────────────────────────────────────────────────────────────
// /api/tracks — private music library listing + track creation.
//
// GET  → every track the authenticated caller is allowed to see (RLS-enforced)
// POST → admin creates a track record and receives a presigned upload target;
//        the browser uploads bytes directly to R2, never through this server.
// ─────────────────────────────────────────────────────────────────────────────

import { requireUser, unauthorized, forbidden } from "../../../lib/server/auth";
import {
  isR2Configured,
  presignUpload,
  presignStream,
  audioKey,
  extFromMime,
  ALLOWED_AUDIO_MIME,
  MAX_AUDIO_BYTES,
} from "../../../lib/server/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return unauthorized();

  const { data, error } = await auth.db
    .from("tracks")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Artwork needs <img>-friendly access; presigned GETs double as the
  // authorization (short-lived, no headers possible on <img>). Audio URLs are
  // deliberately NOT presigned here — playback authorization happens per
  // stream request.
  let tracks = data ?? [];
  if (isR2Configured() && tracks.length > 0) {
    tracks = await Promise.all(
      tracks.map(async (t) => {
        if (t.status !== "ready" || !t.artwork_key) return { ...t, artworkUrl: null };
        try {
          const { url } = await presignStream(t.artwork_key);
          return { ...t, artworkUrl: url };
        } catch {
          return { ...t, artworkUrl: null };
        }
      }),
    );
  }

  return Response.json({ tracks });
}

interface CreateTrackBody {
  title?: string;
  artist?: string;
  album?: string;
  movie?: string;
  year?: string;
  tags?: string[];
  mimeType?: string;
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return unauthorized();
  if (!auth.isAdmin) return forbidden("Only the library owner can add tracks");
  if (!isR2Configured()) {
    return Response.json({ error: "R2 storage is not configured" }, { status: 503 });
  }

  let body: CreateTrackBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = (body.title ?? "").trim().slice(0, 300);
  if (!title) return Response.json({ error: "title is required" }, { status: 400 });

  const mime = (body.mimeType ?? "").toLowerCase();
  if (!ALLOWED_AUDIO_MIME.has(mime)) {
    return Response.json(
      { error: `Unsupported audio type "${mime || "(none)"}". Use MP3, M4A/AAC, OGG, WAV or FLAC.` },
      { status: 415 },
    );
  }

  // Duplicate detection: same title + artist among this owner's tracks
  const artist = (body.artist ?? "Unknown artist").trim().slice(0, 300);
  const { data: dupes } = await auth.db
    .from("tracks")
    .select("id, title, artist, status")
    .eq("owner_id", auth.userId)
    .ilike("title", title)
    .ilike("artist", artist);
  if (dupes && dupes.length > 0) {
    return Response.json(
      { error: "DUPLICATE", duplicateOf: dupes[0] },
      { status: 409 },
    );
  }

  const { data: track, error: insertError } = await auth.db
    .from("tracks")
    .insert({
      owner_id: auth.userId,
      title,
      artist,
      album: body.album?.trim().slice(0, 300) || null,
      movie: body.movie?.trim().slice(0, 300) || null,
      year: body.year?.trim().slice(0, 10) || null,
      tags: Array.isArray(body.tags) ? body.tags.slice(0, 20).map((t) => String(t).slice(0, 50)) : [],
      mime_type: mime,
      status: "pending",
    })
    .select()
    .single();
  if (insertError || !track) {
    return Response.json({ error: insertError?.message ?? "Insert failed" }, { status: 500 });
  }

  const key = audioKey(track.id, extFromMime(mime));
  const { error: keyError } = await auth.db
    .from("tracks")
    .update({ audio_key: key })
    .eq("id", track.id);
  if (keyError) {
    return Response.json({ error: keyError.message }, { status: 500 });
  }

  const upload = await presignUpload(key, mime, MAX_AUDIO_BYTES);
  return Response.json({ track: { ...track, audio_key: key }, upload }, { status: 201 });
}
