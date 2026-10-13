import { api, bodyJson, json, uuid } from "../../../../../lib/server/http";
import { playlistMutation } from "../../../../../lib/server/playlists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  return api(req, "write", false, async (auth) => json({
    playlist: await playlistMutation(auth, "share", uuid((await params).id), await bodyJson(req)),
  }));
}

export async function DELETE(req: Request, { params }: Params) {
  return api(req, "write", false, async (auth) => json({
    playlist: await playlistMutation(auth, "unshare", uuid((await params).id), {
      userId: uuid(new URL(req.url).searchParams.get("userId")),
    }),
  }));
}
