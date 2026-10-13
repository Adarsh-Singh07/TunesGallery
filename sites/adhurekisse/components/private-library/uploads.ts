import { api, json } from "./api";
import type { TrackRow } from "../../lib/auth";

export const AUDIO_ACCEPT = ".mp3,.m4a,.aac,.ogg,.wav,.flac,audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/wav,audio/flac";
export const ARTWORK_ACCEPT = "image/jpeg,image/png,image/webp,image/avif";
export interface UploadTarget { url: string; headers: Record<string, string> }
interface UploadReservation { upload: UploadTarget; uploadId?: string }
export type UploadStatus = "queued" | "creating" | "uploading" | "finalizing" | "artwork" | "ready" | "error" | "cancelled" | "duplicate";
export interface UploadJob {
  id: string; file: File; title: string; artist: string; album: string; movie: string; year: string;
  artwork: File | null; status: UploadStatus; progress: number; message: string;
  trackId?: string; durationSeconds?: number | null; audioUploaded?: boolean; audioVerified?: boolean;
  audioUploadId?: string;
}
export const isActiveUpload = (status: UploadStatus) => ["creating", "uploading", "finalizing", "artwork"].includes(status);

export function audioMime(file: Pick<File, "name" | "type">): string {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const byExtension: Record<string, string> = { mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", wav: "audio/wav", flac: "audio/flac" };
  return byExtension[extension] ?? file.type;
}
export function validateAudio(file: Pick<File, "name" | "type" | "size">): string | null {
  if (!file.size) return "This file is empty.";
  if (file.size > 200 * 1024 * 1024) return "Audio must be 200 MB or smaller.";
  if (!["audio/mpeg", "audio/mp4", "audio/aac", "audio/ogg", "audio/wav", "audio/x-wav", "audio/flac", "audio/x-flac", "audio/x-m4a"].includes(audioMime(file))) return "Choose MP3, M4A/AAC, OGG, WAV or FLAC audio.";
  return null;
}
export function validateArtwork(file: Pick<File, "type" | "size">): string | null {
  if (!file.size) return "This image is empty.";
  if (file.size > 10 * 1024 * 1024) return "Artwork must be 10 MB or smaller.";
  return ["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type) ? null : "Choose a JPEG, PNG, WebP or AVIF image.";
}
// Mobile pickers can assign a new lastModified timestamp on each selection.
// Treat the same name/size as a likely duplicate; storage verifies content later.
export function sameFile(a: File, b: File): boolean { return a.name === b.name && a.size === b.size; }

export function probeDuration(file: File, signal?: AbortSignal): Promise<number | null> {
  return new Promise((resolve) => {
    if (signal?.aborted) { resolve(null); return; }
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    let finished = false;
    const done = (value: number | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      audio.onloadedmetadata = null; audio.onerror = null;
      audio.removeAttribute("src"); audio.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const abort = () => done(null);
    const timer = setTimeout(() => done(null), 8000);
    signal?.addEventListener("abort", abort, { once: true });
    audio.preload = "metadata";
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}

export function putFile(target: UploadTarget, file: File, signal: AbortSignal, progress: (value: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Upload cancelled", "AbortError")); return; }
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const finish = (error?: Error) => { signal.removeEventListener("abort", abort); error ? reject(error) : resolve(); };
    xhr.open("PUT", target.url);
    xhr.timeout = 15 * 60 * 1000;
    Object.entries(target.headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) progress(Math.round(event.loaded / event.total * 100)); };
    xhr.onload = () => finish(xhr.status >= 200 && xhr.status < 300 ? undefined : new Error(`Storage could not accept this file (${xhr.status}). Retry the upload.`));
    xhr.onerror = () => finish(new Error("Upload interrupted. Check your connection, then retry."));
    xhr.ontimeout = () => finish(new Error("Upload timed out. Check your connection, then retry."));
    xhr.onabort = () => finish(new DOMException("Upload cancelled", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    xhr.send(file);
  });
}

export async function replaceArtwork(trackId: string, file: File, signal: AbortSignal, progress: (value: number) => void) {
  const invalid = validateArtwork(file);
  if (invalid) throw new Error(invalid);
  const { upload, uploadId } = await api<UploadReservation>(`/api/tracks/${trackId}/upload-url`, { ...json("POST", { kind: "artwork", mimeType: file.type, sizeBytes: file.size }), signal });
  await putFile(upload, file, signal, progress);
  signal.throwIfAborted();
  await api(`/api/tracks/${trackId}/finalize`, json("POST", { kind: "artwork", uploadId }));
}

/** Checkpoint updates are synchronous in the queue, so retry resumes this row. */
export async function runUpload(job: UploadJob, signal: AbortSignal, update: (patch: Partial<UploadJob>) => void) {
  const patch = (value: Partial<UploadJob>) => { Object.assign(job, value); update(value); };
  signal.throwIfAborted();
  const invalid = validateAudio(job.file);
  if (invalid) throw new Error(invalid);
  if (!job.title.trim()) throw new Error("Give this track a title before uploading.");
  patch({ status: "creating", message: "Reading audio details…", progress: 0 });
  const duration = job.durationSeconds ?? await probeDuration(job.file, signal);
  patch({ durationSeconds: duration });
  signal.throwIfAborted();
  let target: UploadTarget | undefined;
  if (!job.trackId) {
    // Retain the returned row even if cancelled while the server is creating it.
    const created = await api<{ track: TrackRow } & UploadReservation>("/api/tracks", json("POST", {
      title: job.title.trim(), artist: job.artist.trim() || "Unknown artist", album: job.album.trim(), movie: job.movie.trim(), year: job.year.trim(), mimeType: audioMime(job.file), sizeBytes: job.file.size,
    }));
    patch({ trackId: created.track.id, audioUploadId: created.uploadId });
    target = created.upload;
  }
  signal.throwIfAborted();
  if (!job.audioUploaded && !job.audioVerified) {
    if (!target) {
      const reserved = await api<UploadReservation>(`/api/tracks/${job.trackId}/upload-url`, { ...json("POST", { kind: "audio", mimeType: audioMime(job.file), sizeBytes: job.file.size }), signal });
      target = reserved.upload; patch({ audioUploadId: reserved.uploadId });
    }
    patch({ status: "uploading", message: "Uploading audio…" });
    await putFile(target, job.file, signal, (progress) => patch({ progress }));
    patch({ audioUploaded: true });
  }
  signal.throwIfAborted();
  if (!job.audioVerified) {
    patch({ status: "finalizing", progress: 100, message: "Verifying audio in storage…" });
    await api(`/api/tracks/${job.trackId}/finalize`, json("POST", { kind: "audio", ...(duration != null ? { durationSeconds: duration } : {}), uploadId: job.audioUploadId }));
    patch({ audioVerified: true });
  }
  signal.throwIfAborted();
  if (job.artwork) {
    patch({ status: "artwork", progress: 0, message: "Uploading artwork…" });
    await replaceArtwork(job.trackId!, job.artwork, signal, (progress) => patch({ progress }));
  }
  patch({ status: "ready", progress: 100, message: "Ready to play. Audio verified in storage." });
}
