import { api, ApiError, bodyJson, dbError, json, uuid } from "../../../../lib/server/http";
import { PLAYLIST_SELECT, playlistMutation, playlistRow } from "../../../../lib/server/playlists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  return api(req, "read", false, async (auth) => {
    const { data, error } = await auth.db.from("playlists").select(PLAYLIST_SELECT)
      .eq("id", uuid((await params).id)).order("position", { referencedTable: "playlist_tracks" }).maybeSingle();
    dbError(error);
    if (!data) throw new ApiError(404, "Playlist not found");
    return json({ playlist: playlistRow(data) });
  });
}

export async function PATCH(req: Request, { params }: Params) {
  return api(req, "write", false, async (auth) => json({
    playlist: await playlistMutation(auth, "update", uuid((await params).id), await bodyJson(req)),
  }));
}

export async function DELETE(req: Request, { params }: Params) {
  return api(req, "write", false, async (auth) => {
    await playlistMutation(auth, "delete", uuid((await params).id));
    return json({ ok: true });
  });
}
