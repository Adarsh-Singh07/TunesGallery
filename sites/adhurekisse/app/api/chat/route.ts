import { api, ApiError, bodyJson, dbError, json, text } from "../../../lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return api(req, "read", false, async (auth) => {
    const { data, error } = await auth.db.from("messages").select("id,user_id,sender,text,created_at")
      .order("created_at", { ascending: false }).limit(50);
    dbError(error);
    return json({ messages: (data ?? []).reverse().map((m) => ({ ...m, timestamp: m.created_at })), listeners: null });
  });
}

export async function POST(req: Request) {
  return api(req, "chat", false, async (auth) => {
    const body = await bodyJson(req);
    if (body.type === "ping") return json({ success: true, listeners: null });
    if (body.type !== undefined && body.type !== "message") throw new ApiError(400, "Invalid message type");
    const { data, error } = await auth.db.rpc("send_chat_message", { p_text: text(body.text, 500, true) });
    dbError(error);
    return json({ success: true, message: { ...data, timestamp: data.created_at } }, 201);
  });
}
