import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { filterTracks, formatDuration, jamCodeFromPath, safeReturnPath, trackToSong } from "../../components/private-library/helpers";
import { audioMime, probeDuration, runUpload, validateArtwork, validateAudio, type UploadJob } from "../../components/private-library/uploads";
import type { TrackRow } from "../../lib/auth";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../../components/private-library/api", () => ({ api: mocks.api, json: (method: string, body: unknown) => ({ method, body: JSON.stringify(body) }) }));

const file = { name: "Moonlight.m4a", type: "", size: 100, lastModified: 1 } as File;
const track = { id: "track-1", title: "Moonlight", artist: "An Artist", tags: ["late night"], album: "Home", movie: null, year: "2026", artworkUrl: null, duration_seconds: 123, status: "ready" } as TrackRow;
const job = (patch: Partial<UploadJob> = {}): UploadJob => ({ id: "job-1", file, title: "Moonlight", artist: "An Artist", album: "Home", movie: "", year: "2026", artwork: null, status: "queued", progress: 0, message: "", ...patch });

class FakeAudio {
  duration = 183.5;
  preload = "";
  onloadedmetadata: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) { queueMicrotask(() => this.onloadedmetadata?.()); }
  removeAttribute() {}
  load() {}
}
class FakeXHR {
  upload: { onprogress?: (event: { lengthComputable: boolean; loaded: number; total: number }) => void } = {};
  status = 200;
  timeout = 0;
  onload?: () => void;
  onerror?: () => void;
  onabort?: () => void;
  ontimeout?: () => void;
  open = vi.fn();
  setRequestHeader = vi.fn();
  send() { this.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 }); queueMicrotask(() => this.onload?.()); }
  abort() { this.onabort?.(); }
}

beforeEach(() => {
  mocks.api.mockReset();
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:audio");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("private library media and metadata", () => {
  it("accepts mobile audio with missing MIME and rejects unsupported/oversize/empty files", () => {
    expect(audioMime(file)).toBe("audio/mp4");
    expect(validateAudio(file)).toBeNull();
    expect(validateAudio({ ...file, size: 0 })).toMatch(/empty/);
    expect(validateAudio({ ...file, size: 200 * 1024 * 1024 + 1 })).toMatch(/200 MB/);
    expect(validateAudio({ ...file, name: "video.mov", type: "video/quicktime" })).toMatch(/Choose MP3/);
    expect(validateArtwork({ type: "image/svg+xml", size: 100 })).toMatch(/JPEG/);
    expect(validateArtwork({ type: "image/png", size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
  });
  it("searches metadata without modifying source and maps only authenticated track references", () => {
    expect(filterTracks([track], " LATE ")).toEqual([track]);
    expect(filterTracks([track], "2026")).toEqual([track]);
    const song = trackToSong(track);
    expect(song.playback).toEqual({ r2TrackId: "track-1" });
    expect(song.artwork.cover).toBe("/icon.svg");
    expect(formatDuration(123)).toBe("2:03");
    expect(formatDuration(null)).toBe("—");
  });
  it("allows only known internal post-login destinations", () => {
    for (const unsafe of ["//evil.example", "https://evil.example", "/\\evil.example", "/admin?token=secret", null, ""]) expect(safeReturnPath(unsafe)).toBe("/");
    expect(safeReturnPath("/admin")).toBe("/admin");
    expect(safeReturnPath("/library")).toBe("/library");
    expect(safeReturnPath("/")).toBe("/");
    expect(safeReturnPath("/library?playlist=00000000-0000-4000-8000-000000000001")).toBe("/library?playlist=00000000-0000-4000-8000-000000000001");
    expect(safeReturnPath("/library?playlist=00000000-0000-4000-8000-000000000001&redirect=//evil.example")).toBe("/");
    expect(safeReturnPath("/?jam=ABC123")).toBe("/?jam=ABC123");
    expect(safeReturnPath("/?jam=abc123")).toBe("/?jam=abc123");
    expect(jamCodeFromPath("/?jam=abc123")).toBe("ABC123");
  });
  it("rejects malformed Jam links rather than passing redirects or joining ambiguous codes", () => {
    for (const path of ["/?jam=too-long", "/?jam=ABC123&next=//evil.example", "/?jam=ABC123&jam=DEF456", "/?jam=%41BC123", "/?jam=ABC123#fragment", "/?jam=ABC123\n", "/?jam=ABC123/", "//evil.example/?jam=ABC123", "/\\evil.example/?jam=ABC123", "https://evil.example/?jam=ABC123", "/?jam=ABC12%0a", "/?JAM=ABC123"]) {
      expect(safeReturnPath(path), path).toBe("/");
      expect(jamCodeFromPath(path), path).toBeNull();
    }
  });
});

describe("upload lifecycle checkpoints", () => {
  it("finalizes with the probed duration and matching upload ID, rather than the queued snapshot", async () => {
    mocks.api.mockResolvedValueOnce({ track, uploadId: "upload-1", upload: { url: "https://storage.invalid/audio", headers: { "Content-Type": "audio/mp4" } } }).mockResolvedValueOnce({ track });
    const changes: Partial<UploadJob>[] = [];
    await runUpload(job(), new AbortController().signal, (patch) => changes.push(patch));
    const finalize = mocks.api.mock.calls[1];
    expect(finalize[0]).toBe("/api/tracks/track-1/finalize");
    expect(JSON.parse(finalize[1].body)).toEqual({ kind: "audio", durationSeconds: 183.5, uploadId: "upload-1" });
    expect(JSON.parse(mocks.api.mock.calls[0][1].body)).toMatchObject({ sizeBytes: 100, mimeType: "audio/mp4" });
    expect(changes.at(-1)?.status).toBe("ready");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:audio");
  });
  it("retry reuses the pending track and obtains a new signed target without deleting/recreating it", async () => {
    mocks.api.mockResolvedValueOnce({ uploadId: "upload-2", upload: { url: "https://storage.invalid/retry", headers: {} } }).mockResolvedValueOnce({ track });
    await runUpload(job({ trackId: track.id, durationSeconds: 120 }), new AbortController().signal, () => {});
    expect(mocks.api.mock.calls.map(([url]) => url)).toEqual(["/api/tracks/track-1/upload-url", "/api/tracks/track-1/finalize"]);
    expect(JSON.parse(mocks.api.mock.calls[1][1].body).uploadId).toBe("upload-2");
  });
  it("cancellation during record creation retains its returned ID and prevents storage/finalization", async () => {
    const controller = new AbortController();
    mocks.api.mockImplementationOnce(async () => { controller.abort(); return { track, uploadId: "upload-1", upload: { url: "https://storage.invalid/audio", headers: {} } }; });
    const updates: Partial<UploadJob>[] = [];
    await expect(runUpload(job({ durationSeconds: 12 }), controller.signal, (patch) => updates.push(patch))).rejects.toMatchObject({ name: "AbortError" });
    expect(updates.some((patch) => patch.trackId === track.id)).toBe(true);
    expect(mocks.api).toHaveBeenCalledTimes(1);
  });
  it("artwork failure preserves verified audio for a retry that uploads only artwork", async () => {
    const art = { name: "cover.png", type: "image/png", size: 400 } as File;
    mocks.api.mockResolvedValueOnce({ track, upload: { url: "https://storage.invalid/audio", headers: {} }, uploadId: "audio-intent" }).mockResolvedValueOnce({ track }).mockRejectedValueOnce(new Error("Artwork unavailable"));
    const current = job({ artwork: art, durationSeconds: 123 });
    await expect(runUpload(current, new AbortController().signal, (patch) => Object.assign(current, patch))).rejects.toThrow("Artwork unavailable");
    expect(current.audioVerified).toBe(true);
    mocks.api.mockReset();
    mocks.api.mockResolvedValueOnce({ upload: { url: "https://storage.invalid/art", headers: {} }, uploadId: "art-intent" }).mockResolvedValueOnce({ track });
    await runUpload(current, new AbortController().signal, () => {});
    expect(JSON.parse(mocks.api.mock.calls[0][1].body)).toMatchObject({ kind: "artwork", sizeBytes: 400 });
    expect(JSON.parse(mocks.api.mock.calls[1][1].body)).toEqual({ kind: "artwork", uploadId: "art-intent" });
    expect(current.status).toBe("ready");
  });
  it("already-cancelled duration probes do not allocate a media URL", async () => {
    const controller = new AbortController(); controller.abort();
    expect(await probeDuration(file, controller.signal)).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
