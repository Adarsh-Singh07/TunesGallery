import "server-only";
import type { AuthContext } from "./auth";
import { ApiError, dbError, text, uuid } from "./http";

export const PLAYLIST_SELECT = "*,playlist_tracks(track_id,position,tracks(id,title,artist,duration_seconds,status)),playlist_permissions(user_id,grant_tracks)";

export function playlistRow(row: Record<string, unknown>) { return { ...row, title: row.name }; }

export function playlistPayload(payload: Record<string, unknown>) {
  const result = { ...payload };
  if ("title" in payload && !("name" in payload)) result.name = payload.title;
  if ("name" in result) result.name = text(result.name, 200, true);
  if ("description" in result) result.description = text(result.description, 2000);
  if ("expectedRevision" in result && (typeof result.expectedRevision !== "number" || !Number.isSafeInteger(result.expectedRevision) || result.expectedRevision < 0)) throw new ApiError(400, "Invalid revision");
  if ("grantTracks" in result && typeof result.grantTracks !== "boolean") throw new ApiError(400, "Invalid grantTracks");
  for (const field of ["trackId", "userId"] as const) if (field in result) result[field] = uuid(result[field]);
  if ("trackIds" in result) {
    if (!Array.isArray(result.trackIds) || result.trackIds.length > 500) throw new ApiError(400, "Invalid trackIds");
    result.trackIds = result.trackIds.map(uuid);
  }
  return result;
}

export async function playlistMutation(auth: AuthContext, action: string, id: string | null, payload: Record<string, unknown> = {}) {
  const { data, error } = await auth.db.rpc("playlist_mutate", {
    p_action: action, p_playlist_id: id, p_payload: playlistPayload(payload),
  });
  dbError(error);
  return playlistRow(data);
}
