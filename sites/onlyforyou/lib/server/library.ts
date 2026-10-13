import "server-only";
import { serviceClient, type AuthContext } from "./auth";
import { ApiError, dbError, text } from "./http";
import { ALLOWED_AUDIO_MIME, ALLOWED_ARTWORK_MIME, MAX_AUDIO_BYTES, MAX_ARTWORK_BYTES,
  audioKey, artworkKey, extFromMime, isR2Configured, presignUpload } from "./r2";

export function storageRequired(): void {
  if (!isR2Configured()) throw new ApiError(503, "Storage temporarily unavailable");
}

export async function mutateTrack(auth: AuthContext, action: string, id: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await serviceClient().rpc("library_mutate", {
    p_actor: auth.userId, p_action: action, p_track_id: id, p_payload: payload,
  });
  dbError(error);
  return data;
}

export function uploadSpec(body: Record<string, unknown>, kind: "audio" | "artwork") {
  const mimeType = text(body.mimeType, 80, true).toLowerCase();
  const allowed = kind === "audio" ? ALLOWED_AUDIO_MIME : ALLOWED_ARTWORK_MIME;
  const max = kind === "audio" ? MAX_AUDIO_BYTES : MAX_ARTWORK_BYTES;
  if (!allowed.has(mimeType)) throw new ApiError(415, "Unsupported media type");
  const sizeBytes = body.sizeBytes;
  if (sizeBytes !== undefined && (typeof sizeBytes !== "number" || !Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > max)) {
    throw new ApiError(400, "Invalid upload size");
  }
  const checksumMd5 = body.checksumMd5;
  if (checksumMd5 !== undefined && (typeof checksumMd5 !== "string" || !/^[a-f0-9]{32}$/i.test(checksumMd5))) {
    throw new ApiError(400, "checksumMd5 must be a 32-character hex checksum");
  }
  return { mimeType, sizeBytes: sizeBytes as number | undefined, checksumMd5: (checksumMd5 as string | undefined)?.toLowerCase(), max };
}

export async function reserveUpload(auth: AuthContext, id: string, body: Record<string, unknown>, kind: "audio" | "artwork") {
  const spec = uploadSpec(body, kind);
  const key = (kind === "audio" ? audioKey : artworkKey)(id, extFromMime(spec.mimeType));
  const intent = await mutateTrack(auth, "reserve_upload", id, { ...spec, kind, key });
  const upload = await presignUpload(key, spec.mimeType, spec.max, spec.sizeBytes, spec.checksumMd5);
  return { key, uploadId: intent.id as string, expiresAt: intent.expires_at as string, upload };
}
