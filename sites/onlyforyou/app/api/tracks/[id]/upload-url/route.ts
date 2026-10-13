import { api, ApiError, bodyJson, json, uuid } from "../../../../../lib/server/http";
import { reserveUpload, storageRequired } from "../../../../../lib/server/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  return api(req, "upload", true, async (auth) => {
    storageRequired();
    const id = uuid((await params).id);
    const body = await bodyJson(req);
    if (body.kind !== undefined && body.kind !== "audio" && body.kind !== "artwork") throw new ApiError(400, "Invalid upload kind");
    return json(await reserveUpload(auth, id, body, body.kind === "artwork" ? "artwork" : "audio"));
  });
}
