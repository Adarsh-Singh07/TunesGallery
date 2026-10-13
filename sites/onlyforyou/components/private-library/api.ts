import { authedFetch } from "../../lib/auth";
import { supabase } from "../../lib/supabase";

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof TypeError) return "Could not connect. Check your connection and try again.";
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try { response = await authedFetch(url, init); }
  catch (err) {
    if (err instanceof Error && /please sign in again/i.test(err.message)) {
      if (typeof window !== "undefined") window.dispatchEvent(new Event("library:session-expired"));
      throw new ApiError("Your session has expired. Sign in again to continue.", 401);
    }
    throw err;
  }
  if (response.status === 401 && supabase) {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data.session && !init.signal?.aborted) response = await authedFetch(url, init);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event("library:session-expired"));
    const codes: Record<string, string> = {
      DUPLICATE: "This recording is already in the library. Check existing tracks before retrying.",
      RATE_LIMITED: "You’re moving a little quickly. Wait a minute, then try again.",
      UPLOAD_EXPIRED: "This upload link expired. Retry to get a fresh upload link.",
      STALE_UPLOAD: "This upload was replaced by a newer attempt. Retry to continue.",
      INVALID_UPLOAD: "The file could not be verified. Check its format and retry.",
      ALREADY_READY: "This track is already uploaded. Refresh your library to find it.",
      TRACK_ACCESS_DENIED: "A track in this selection is not shared with you. Ask the owner for access.",
      NOT_FOUND: "This item is no longer available. Refresh your library.",
      PLAYLIST_FULL: "This playlist has reached its track limit. Remove a track before adding more.",
      STALE_REVISION: "This playlist changed in another session. Close this dialog, refresh the playlists, and try again.",
    };
    const message = response.status === 401
      ? "Your session has expired. Sign in again to continue."
      : response.status === 403
        ? "You do not have permission for this action. Ask the library owner for access."
        : typeof body.error === "string" ? codes[body.error] ?? body.error : `Request failed (${response.status}). Please try again.`;
    throw new ApiError(message, response.status, body);
  }
  return body as T;
}

export const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export async function collection<T>(url: string, field: string, signal?: AbortSignal): Promise<T[]> {
  const rows: T[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const page: Record<string, unknown> = await api(`${url}${url.includes("?") ? "&" : "?"}offset=${offset}`, { signal });
    const items = page[field];
    if (!Array.isArray(items)) throw new Error("The library returned an unexpected response. Try again.");
    rows.push(...items as T[]);
    const next = page.nextOffset;
    if (typeof next === "number" && next <= offset) throw new Error("The library could not load its next page. Try again.");
    offset = typeof next === "number" ? next : null;
  }
  return rows;
}
