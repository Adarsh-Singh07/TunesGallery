import { api, bodyJson, json, uuid } from "../../../../../lib/server/http";
import { playlistMutation } from "../../../../../lib/server/playlists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  return api(req, "write", false, async (auth) => json({
    playlist: await playlistMutation(auth, "add", uuid((await params).id), await bodyJson(req)),
  }));
}

export async function PATCH(req: Request, { params }: Params) {
  return api(req, "write", false, async (auth) => json({
    playlist: await playlistMutation(auth, "reorder", uuid((await params).id), await bodyJson(req)),
  }));
}

export async function DELETE(req: Request, { params }: Params) {
  return api(req, "write", false, async (auth) => json({
    playlist: await playlistMutation(auth, "remove", uuid((await params).id), {
      trackId: uuid(new URL(req.url).searchParams.get("trackId")),
    }),
  }));
}
