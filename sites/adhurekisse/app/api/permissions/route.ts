import { api, bodyJson, dbError, json, uuid } from "../../../lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return api(req, "read", true, async (auth) => {
    const { data, error } = await auth.db.from("track_permissions")
      .select("track_id,user_id,granted_by,created_at,profiles!track_permissions_user_id_fkey(display_name,email)")
      .order("created_at", { ascending: false }).limit(500);
    dbError(error);
    return json({ permissions: data ?? [] });
  });
}

export async function POST(req: Request) {
  return api(req, "write", true, async (auth) => {
    const body = await bodyJson(req);
    const { error } = await auth.db.rpc("manage_track_permission", {
      p_track_id: uuid(body.trackId), p_user_id: uuid(body.userId), p_grant: true,
    });
    dbError(error);
    return json({ ok: true });
  });
}

export async function DELETE(req: Request) {
  return api(req, "write", true, async (auth) => {
    const query = new URL(req.url).searchParams;
    const { error } = await auth.db.rpc("manage_track_permission", {
      p_track_id: uuid(query.get("trackId")), p_user_id: uuid(query.get("userId")), p_grant: false,
    });
    dbError(error);
    return json({ ok: true });
  });
}
