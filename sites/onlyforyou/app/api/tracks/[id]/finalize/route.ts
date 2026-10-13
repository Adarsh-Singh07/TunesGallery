import { serviceClient } from "../../../../../lib/server/auth";
import { api, ApiError, bodyJson, dbError, duration, json, uuid } from "../../../../../lib/server/http";
import { mutateTrack, storageRequired } from "../../../../../lib/server/library";
import { verifyUpload } from "../../../../../lib/server/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  return api(req, "upload", true, async (auth) => {
    storageRequired();
    const id = uuid((await params).id);
    const body = await bodyJson(req, true);
    if (body.kind !== undefined && body.kind !== "audio" && body.kind !== "artwork") throw new ApiError(400, "Invalid upload kind");
    const kind = body.kind === "artwork" ? "artwork" : "audio";
    const durationSeconds = body.durationSeconds == null ? undefined : duration(body.durationSeconds);
    // uploadId identifies retries exactly. Older clients may finalize their
    // latest intent of this kind; never accept an object key from the browser.
    let query = serviceClient().from("upload_intents").select("*").eq("track_id", id).eq("kind", kind);
    if (body.uploadId !== undefined) query = query.eq("id", uuid(body.uploadId));
    const { data: intent, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
    dbError(error);
    if (!intent) throw new ApiError(404, "Upload not found");
    if (intent.finalized_at) {
      return json({ track: await mutateTrack(auth, "finalize", id, { uploadId: intent.id }) });
    }
    if (Date.parse(intent.expires_at) < Date.now()) throw new ApiError(410, "UPLOAD_EXPIRED");
    const verified = await verifyUpload(intent);
    const track = await mutateTrack(auth, "finalize", id, { uploadId: intent.id, ...verified, durationSeconds });
    return json({ track });
  });
}
