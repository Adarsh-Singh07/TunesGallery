import { api, ApiError, bodyJson, json, trackMetadata, uuid } from "../../../../lib/server/http";
import { mutateTrack } from "../../../../lib/server/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  return api(req, "write", true, async (auth) => {
    const id = uuid((await params).id);
    const patch = trackMetadata(await bodyJson(req));
    if (!Object.keys(patch).length) throw new ApiError(400, "Nothing to update");
    return json({ track: await mutateTrack(auth, "update", id, patch) });
  });
}

export async function DELETE(req: Request, { params }: Params) {
  return api(req, "write", true, async (auth) => {
    // Transactionally removes access and enqueues durable, delayed object GC.
    await mutateTrack(auth, "delete", uuid((await params).id));
    return json({ ok: true });
  });
}
