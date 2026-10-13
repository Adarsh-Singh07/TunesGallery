import "server-only";
import { requireUser, type AuthContext } from "./auth";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: {
    "Cache-Control": "private, no-store, max-age=0",
    "Pragma": "no-cache",
    "Vary": "Authorization",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  } });
}

const DB_ERRORS: Record<string, number> = {
  FORBIDDEN: 403, NOT_FOUND: 404, INVALID_INPUT: 400, TRACK_ACCESS_DENIED: 403,
  STALE_REVISION: 409, STALE_UPLOAD: 409, ALREADY_READY: 409, DUPLICATE: 409,
  UPLOAD_EXPIRED: 410, INVALID_UPLOAD: 422, RATE_LIMITED: 429, PLAYLIST_FULL: 409,
};
export function dbError(error: { message?: string } | null): void {
  if (!error) return;
  const code = error.message ?? "";
  if (Object.hasOwn(DB_ERRORS, code)) throw new ApiError(DB_ERRORS[code], code);
  // Never return PostgREST diagnostics, storage endpoints or provider errors.
  throw new ApiError(503, "Service temporarily unavailable");
}

export async function api(
  req: Request,
  bucket: "read" | "write" | "upload" | "stream" | "invitation" | "chat",
  admin: boolean,
  handler: (auth: AuthContext) => Promise<Response>,
): Promise<Response> {
  try {
    const auth = await requireUser(req);
    if (!auth) throw new ApiError(401, "Sign in with an active invited account");
    if (admin && !auth.isAdmin) throw new ApiError(403, "Administrator access required");
    const { data: allowed, error } = await auth.db.rpc("consume_rate_limit", { p_bucket: bucket });
    dbError(error);
    if (allowed !== true) throw new ApiError(429, "RATE_LIMITED");
    return await handler(auth);
  } catch (error) {
    const known = error instanceof ApiError;
    const response = json({ error: known ? error.message : "Service temporarily unavailable" }, known ? error.status : 503);
    if (known && error.status === 429) response.headers.set("Retry-After", "60");
    return response;
  }
}

/** Bound the actual stream too; Content-Length is not a trustworthy limit. */
export async function bodyJson(req: Request, optional = false): Promise<Record<string, unknown>> {
  if (!req.body) {
    if (optional) return {};
    throw new ApiError(400, "JSON body required");
  }
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 32768) { await reader.cancel(); throw new ApiError(413, "Request too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!bytes && optional) return {};
  try {
    const raw = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { raw.set(chunk, offset); offset += chunk.length; }
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch { throw new ApiError(400, "Invalid JSON body"); }
}

export function uuid(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError(400, "A valid UUID is required");
  }
  return value;
}

export function text(value: unknown, max: number, required = false): string {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) {
    throw new ApiError(400, "Invalid text field");
  }
  return value.trim();
}

export function duration(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 86400) {
    throw new ApiError(400, "Invalid duration");
  }
  return value;
}

export function trackMetadata(body: Record<string, unknown>, creating = false): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of ["title", "artist", "album", "movie", "year"] as const) {
    if (!(field in body)) continue;
    const required = field === "title" || field === "artist";
    patch[field] = body[field] === null && !required ? null : text(body[field], field === "year" ? 10 : 300, required) || null;
  }
  if (creating && !patch.title) throw new ApiError(400, "title is required");
  if ("tags" in body) {
    if (!Array.isArray(body.tags) || body.tags.length > 20) throw new ApiError(400, "Invalid tags");
    patch.tags = [...new Set(body.tags.map((tag) => text(tag, 50, true)))];
  }
  if ("duration_seconds" in body) patch.duration_seconds = duration(body.duration_seconds);
  return patch;
}
