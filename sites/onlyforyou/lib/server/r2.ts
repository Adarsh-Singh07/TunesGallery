// ─────────────────────────────────────────────────────────────────────────────
// Server-only Cloudflare R2 integration (S3-compatible API).
//
// The bucket is PRIVATE. The browser never sees credentials — it only ever
// receives short-lived presigned URLs minted by these helpers, and only after
// authorization has run. URLs are never logged.
//
// NEVER import this module from client code.
// ─────────────────────────────────────────────────────────────────────────────

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const R2_CONFIG = {
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
export const STREAM_URL_TTL_SECONDS = 60 * 60; // 1 hour
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
  return `audio/${trackId}/original.${safeExt}`;
}

export function artworkKey(trackId: string, ext: string): string {
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  return `artwork/${trackId}/cover.${safeExt}`;
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
 * file straight to R2 (XHR PUT reports upload progress); no audio bytes ever
 * pass through the serverless function. Size is enforced at finalize time via
 * a HEAD request before the track is marked ready.
 */
export async function presignUpload(
  key: string,
  contentType: string,
  _maxBytes: number,
): Promise<{ url: string; method: "PUT"; headers: Record<string, string> }> {
  void _maxBytes; // enforced at finalize
  const url = await getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: R2_CONFIG.bucket, Key: key, ContentType: contentType }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS },
  );
  return { url, method: "PUT", headers: { "Content-Type": contentType } };
}

/** Presigned GET for playback. Short-lived; refresh before expiry. */
export async function presignStream(key: string): Promise<{ url: string; expiresAt: number }> {
  const url = await getSignedUrl(
    r2(),
    new GetObjectCommand({ Bucket: R2_CONFIG.bucket, Key: key }),
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
