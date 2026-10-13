import { api, ApiError, bodyJson, dbError, json, uuid } from "../../../lib/server/http";
import { PLAYLIST_SELECT, playlistMutation, playlistRow } from "../../../lib/server/playlists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return api(req, "read", false, async (auth) => {
    const query = new URL(req.url).searchParams;
    const offset = Number(query.get("offset") ?? 0);
    const limit = Number(query.get("limit") ?? 100);
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new ApiError(400, "Invalid pagination");
    const { data, error } = await auth.db.from("playlists").select(PLAYLIST_SELECT)
      .order("updated_at", { ascending: false }).order("id").order("position", { referencedTable: "playlist_tracks" })
      .range(offset, offset + limit - 1);
    dbError(error);
    return json({ playlists: (data ?? []).map(playlistRow), nextOffset: data?.length === limit ? offset + limit : null });
  });
}

export async function POST(req: Request) {
  return api(req, "write", false, async (auth) => json({
    playlist: await playlistMutation(auth, "create", null, await bodyJson(req)),
  }, 201));
}

/** Collection-level compatibility for the current playlist editor. */
export async function PATCH(req: Request) {
  return api(req, "write", false, async (auth) => {
    const body = await bodyJson(req);
    const action = body.action ?? "update";
    if (typeof action !== "string" || !["update", "add", "remove", "reorder", "share", "unshare"].includes(action)) throw new ApiError(400, "Invalid action");
    return json({ playlist: await playlistMutation(auth, action, uuid(body.id), body) });
  });
}

export async function DELETE(req: Request) {
  return api(req, "write", false, async (auth) => {
    const body = await bodyJson(req);
    await playlistMutation(auth, "delete", uuid(body.id));
    return json({ ok: true });
  });
}
