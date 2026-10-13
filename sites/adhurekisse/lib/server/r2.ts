// ─────────────────────────────────────────────────────────────────────────────
// Server-only Cloudflare R2 integration (S3-compatible API).
//
// The bucket is PRIVATE. The browser never sees credentials — it only ever
// receives short-lived presigned URLs minted by these helpers, and only after
// authorization has run. URLs are never logged.
//
// NEVER import this module from client code.
// ─────────────────────────────────────────────────────────────────────────────

import "server-only";
import { randomUUID } from "node:crypto";
import { matchesMagic } from "./media";
import { ApiError } from "./http";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const R2_CONFIG = {
  accountId: process.env.R2_ACCOUNT_ID ?? "",
  accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  bucket: process.env.R2_BUCKET_NAME ?? "",
};

/** Max audio upload size — 200 MB comfortably covers long MP3/M4A tracks. */
export const MAX_AUDIO_BYTES = 200 * 1024 * 1024;
/** Max artwork upload size — 10 MB. */
export const MAX_ARTWORK_BYTES = 10 * 1024 * 1024;

/** Short-lived playback authorization. Refresh happens client-side on expiry. */
export const STREAM_URL_TTL_SECONDS = 60 * 5;
/** Upload authorization lifetime. */
export const UPLOAD_URL_TTL_SECONDS = 60 * 15; // 15 minutes

export const ALLOWED_AUDIO_MIME = new Set([
  "audio/mpeg",      // mp3
  "audio/mp4",       // m4a
  "audio/aac",
  "audio/x-m4a",
  "audio/ogg",       // opus/vorbis — broadly supported on Android
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
  "audio/x-flac",
]);

export const ALLOWED_ARTWORK_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

export function isR2Configured(): boolean {
  return !!(
    R2_CONFIG.accountId &&
    R2_CONFIG.accessKeyId &&
    R2_CONFIG.secretAccessKey &&
    R2_CONFIG.bucket
  );
}

let client: S3Client | null = null;

function r2(): S3Client {
  if (!isR2Configured()) {
    throw new Error("R2 is not configured (missing R2_* environment variables)");
  }
  if (!client) {
    client = new S3Client({
      region: "auto",
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      endpoint: `https://${R2_CONFIG.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_CONFIG.accessKeyId,
        secretAccessKey: R2_CONFIG.secretAccessKey,
      },
    });
  }
  return client;
}

// ── Structured, non-guessable object keys ────────────────────────────────────
// User-supplied filenames are NEVER part of a storage path.

export function audioKey(trackId: string, ext: string): string {
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  return `audio/${trackId}/${randomUUID()}.${safeExt}`;
}

export function artworkKey(trackId: string, ext: string): string {
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  return `artwork/${trackId}/${randomUUID()}.${safeExt}`;
}

export function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/aac": "aac",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/flac": "flac",
    "audio/x-flac": "flac",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
  };
  return map[mime] ?? "bin";
}

// ── Presigning ───────────────────────────────────────────────────────────────

/**
 * Presigned PUT for a direct browser → R2 upload. The browser streams the
 * file straight to R2 (XHR PUT reports upload progress). Finalization reads
 * HEAD plus at most a 4 KiB Range prefix, never the full media file. Optional
 * exact size/checksum are bound to the signature; all limits are checked again
 * before database publication. If-None-Match makes the capability write-once.
 */
export async function presignUpload(
  key: string,
  contentType: string,
  maxBytes: number,
  sizeBytes?: number,
  checksumMd5?: string,
): Promise<{ url: string; method: "PUT"; headers: Record<string, string> }> {
  if (sizeBytes !== undefined && (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > maxBytes)) {
    throw new ApiError(400, "Invalid upload size");
  }
  if (checksumMd5 !== undefined && !/^[a-f0-9]{32}$/.test(checksumMd5)) throw new ApiError(400, "Invalid MD5 checksum");
  const md5 = checksumMd5 ? Buffer.from(checksumMd5, "hex").toString("base64") : undefined;
  const headers: Record<string, string> = {
    "Content-Type": contentType, "If-None-Match": "*", "Cache-Control": "private, no-store",
  };
  if (md5) headers["Content-MD5"] = md5;
  const url = await getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: R2_CONFIG.bucket, Key: key, ContentType: contentType,
      ContentLength: sizeBytes, ContentMD5: md5, IfNoneMatch: "*", CacheControl: "private, no-store" }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS,
      signableHeaders: new Set(["content-type", "content-length", "content-md5", "if-none-match", "cache-control"]) },
  );
  return { url, method: "PUT", headers };
}

/** Presigned GET for playback. Short-lived; refresh before expiry. */
export async function presignStream(key: string): Promise<{ url: string; expiresAt: number }> {
  const url = await getSignedUrl(
    r2(),
    new GetObjectCommand({ Bucket: R2_CONFIG.bucket, Key: key, ResponseCacheControl: "private, no-store" }),
    { expiresIn: STREAM_URL_TTL_SECONDS },
  );
  return { url, expiresAt: Date.now() + STREAM_URL_TTL_SECONDS * 1000 };
}

/** Verify an object actually landed in the bucket (upload finalization). */
export async function objectExists(
  key: string,
): Promise<{ exists: boolean; size?: number; contentType?: string }> {
  try {
    const head = await r2().send(new HeadObjectCommand({ Bucket: R2_CONFIG.bucket, Key: key }));
    return { exists: true, size: head.ContentLength, contentType: head.ContentType };
  } catch (err: unknown) {
    const name = (err as { name?: string })?.name ?? "";
    if (name === "NotFound" || name === "404") return { exists: false };
    throw err;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await r2().send(new DeleteObjectCommand({ Bucket: R2_CONFIG.bucket, Key: key }));
}

export async function deleteObjects(keys: string[]): Promise<void> {
  await Promise.all(keys.filter(Boolean).map((k) => deleteObject(k)));
}

/** Only single-PUT server-issued immutable keys are finalized. Never read the
 * full media file through the function; cap the verification GET at 4 KiB. */
export async function verifyUpload(intent: {
  object_key: string; mime_type: string; kind: "audio" | "artwork";
  expected_bytes: number | null; expected_md5: string | null;
}): Promise<{ sizeBytes: number; checksumMd5: string }> {
  const head = await r2().send(new HeadObjectCommand({ Bucket: R2_CONFIG.bucket, Key: intent.object_key }));
  const size = head.ContentLength;
  const max = intent.kind === "audio" ? MAX_AUDIO_BYTES : MAX_ARTWORK_BYTES;
  if (!size || !Number.isSafeInteger(size) || size > max) throw new ApiError(422, "Invalid object size");
  if (intent.expected_bytes !== null && Number(intent.expected_bytes) !== size) throw new ApiError(422, "Upload size mismatch");
  if (head.ContentType?.toLowerCase() !== intent.mime_type) throw new ApiError(422, "Upload type mismatch");
  // Multipart ETags are deliberately refused; our PUT capability cannot create
  // multipart objects. R2 single-PUT ETags identify the complete object's MD5.
  const md5 = head.ETag?.replace(/^"|"$/g, "").toLowerCase();
  if (!md5 || !/^[a-f0-9]{32}$/.test(md5)) throw new ApiError(422, "Invalid object checksum");
  if (intent.expected_md5 && md5 !== intent.expected_md5) throw new ApiError(422, "Upload checksum mismatch");
  const length = Math.min(size, 4096);
  const part = await r2().send(new GetObjectCommand({ Bucket: R2_CONFIG.bucket, Key: intent.object_key,
    Range: `bytes=0-${length - 1}`, IfMatch: head.ETag }));
  if (part.ContentLength !== length || part.ContentRange !== `bytes 0-${length - 1}/${size}` || !part.Body) {
    (part.Body as { destroy?: () => void } | undefined)?.destroy?.();
    throw new ApiError(422, "Unable to verify object range");
  }
  const bytes = await part.Body.transformToByteArray();
  if (bytes.length !== length || !matchesMagic(bytes, intent.mime_type)) throw new ApiError(422, "File signature does not match its type");
  return { sizeBytes: size, checksumMd5: md5 };
}
