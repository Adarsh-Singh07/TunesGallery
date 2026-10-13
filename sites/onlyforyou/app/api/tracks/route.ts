import { randomUUID } from "node:crypto";
import { api, bodyJson, dbError, json, trackMetadata, ApiError } from "../../../lib/server/http";
import { mutateTrack, reserveUpload, storageRequired, uploadSpec } from "../../../lib/server/library";
import { isR2Configured, presignStream } from "../../../lib/server/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return api(req, "read", false, async (auth) => {
    const query = new URL(req.url).searchParams;
    const offset = Number(query.get("offset") ?? 0);
    const limit = Number(query.get("limit") ?? 200);
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      throw new ApiError(400, "Invalid pagination");
    }
    const { data, error } = await auth.db.from("tracks").select("*")
      .order("created_at", { ascending: true }).order("id").range(offset, offset + limit - 1);
    dbError(error);
    const tracks = await Promise.all((data ?? []).map(async (track) => ({
      ...track,
      artworkUrl: track.status === "ready" && track.artwork_key && isR2Configured()
        ? (await presignStream(track.artwork_key)).url : null,
    })));
    return json({ tracks, nextOffset: tracks.length === limit ? offset + limit : null });
  });
}

export async function POST(req: Request) {
  return api(req, "upload", true, async (auth) => {
    storageRequired();
    const body = await bodyJson(req);
    const metadata = trackMetadata(body, true);
    uploadSpec(body, "audio"); // reject malformed media metadata before inserting
    const id = randomUUID();
    const track = await mutateTrack(auth, "create", id, metadata);
    const target = await reserveUpload(auth, id, body, "audio");
    return json({ track, ...target }, 201);
  });
}
