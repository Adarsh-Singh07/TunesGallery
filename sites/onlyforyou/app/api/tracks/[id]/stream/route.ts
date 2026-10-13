import { api, ApiError, dbError, json, uuid } from "../../../../../lib/server/http";
import { storageRequired } from "../../../../../lib/server/library";
import { presignStream } from "../../../../../lib/server/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  return api(req, "stream", false, async (auth) => {
    storageRequired();
    const id = uuid((await params).id);
    const { data: track, error } = await auth.db.from("tracks").select("id,audio_key,status,mime_type").eq("id", id).maybeSingle();
    dbError(error);
    if (!track) throw new ApiError(404, "Track not found or access denied");
    if (track.status !== "ready" || !track.audio_key) throw new ApiError(409, "Audio not available");
    return json({ ...await presignStream(track.audio_key), mimeType: track.mime_type });
  });
}
