import { serviceClient } from "../../../../lib/server/auth";
import { api, dbError, json } from "../../../../lib/server/http";
import { storageRequired } from "../../../../lib/server/library";
import { deleteObject } from "../../../../lib/server/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return api(req, "write", true, async () => {
    storageRequired();
    const db = serviceClient();
    const { data, error } = await db.rpc("storage_gc_batch");
    dbError(error);
    let deleted = 0;
    let failed = 0;
    for (const row of data ?? []) {
      try {
        await deleteObject(row.object_key);
        const result = await db.rpc("storage_gc_ack", { p_key: row.object_key });
        dbError(result.error);
        deleted++;
      } catch { failed++; } // durable queue retains failed work for retry
    }
    return json({ deleted, failed });
  });
}
