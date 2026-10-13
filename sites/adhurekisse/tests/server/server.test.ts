import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.R2_ACCOUNT_ID = "test-account";
  process.env.R2_ACCESS_KEY_ID = "test-key";
  process.env.R2_SECRET_ACCESS_KEY = "test-secret";
  process.env.R2_BUCKET_NAME = "test-bucket";
  return { requireUser: vi.fn(), send: vi.fn(), presign: vi.fn() };
});
vi.mock("../../lib/server/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@aws-sdk/client-s3", async (original) => ({
  ...await original<typeof import("@aws-sdk/client-s3")>(),
  S3Client: class { send = mocks.send; },
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: mocks.presign }));

import { api, ApiError, bodyJson, dbError, duration, json, trackMetadata } from "../../lib/server/http";
import { audioKey, presignUpload, verifyUpload, MAX_AUDIO_BYTES } from "../../lib/server/r2";
import { matchesMagic } from "../../lib/server/media";
import { PATCH as updateTrack } from "../../app/api/tracks/[id]/route";

const md5 = "ab".repeat(16);
const intent = { object_key: "audio/server-key/immutable.mp3", mime_type: "audio/mpeg", kind: "audio" as const, expected_bytes: 100, expected_md5: md5 };
const mp3 = new Uint8Array(100); mp3.set(Buffer.from("ID3"));
function verifiedObject(bytes = mp3) {
  mocks.send.mockResolvedValueOnce({ ContentLength: 100, ContentType: "audio/mpeg", ETag: `"${md5}"` });
  mocks.send.mockResolvedValueOnce({ ContentLength: 100, ContentRange: "bytes 0-99/100", Body: { transformToByteArray: async () => bytes } });
}
beforeEach(() => vi.clearAllMocks());

describe("API authorization and error boundary", () => {
  it("denies unauthenticated and non-admin callers before provider or handler work", async () => {
    const handler = vi.fn();
    mocks.requireUser.mockResolvedValue(null);
    const response = await api(new Request("https://app.test/api/tracks"), "upload", true, handler);
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
    mocks.requireUser.mockResolvedValue({ isAdmin: false });
    const denied = await updateTrack(new Request("https://app.test/api/tracks/x", { method: "PATCH" }), { params: Promise.resolve({ id: "x" }) });
    expect(denied.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });
  it("fails closed if the persistent limiter fails and emits a retry header when exhausted", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    mocks.requireUser.mockResolvedValue({ isAdmin: true, db: { rpc } });
    const handler = vi.fn();
    const response = await api(new Request("https://app.test/api/test"), "write", true, handler);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    rpc.mockResolvedValue({ data: null, error: { message: "secret provider hostname and SQL detail" } });
    const failure = await api(new Request("https://app.test/api/test"), "write", true, handler);
    expect(failure.status).toBe(503);
    expect(await failure.text()).not.toContain("hostname");
    expect(handler).not.toHaveBeenCalled();
  });
  it("provider exceptions cannot leak signed URLs or credentials", async () => {
    mocks.requireUser.mockResolvedValue({ isAdmin: true, db: { rpc: async () => ({ data: true, error: null }) } });
    const result = await api(new Request("https://app.test/api/test"), "read", false, async () => {
      throw new Error("https://r2.test?X-Amz-Signature=secret");
    });
    expect(await result.json()).toEqual({ error: "Service temporarily unavailable" });
    expect(result.headers.get("vary")).toBe("Authorization");
    expect(() => dbError({ message: "DUPLICATE" })).toThrow("DUPLICATE");
    expect(json({ ok: true }).headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("rejects malformed fields, non-finite duration and oversized streaming JSON", async () => {
    expect(() => trackMetadata({ title: { bad: true } }, true)).toThrow(ApiError);
    expect(() => duration(Infinity)).toThrow(ApiError);
    expect(() => duration(-1)).toThrow(ApiError);
    await expect(bodyJson(new Request("https://app.test", { method: "POST", body: "[]" }))).rejects.toThrow("Invalid JSON");
    await expect(bodyJson(new Request("https://app.test", { method: "POST", body: JSON.stringify({ text: "x".repeat(33000) }) }))).rejects.toThrow("Request too large");
  });
});

describe("immutable direct-upload capabilities and bounded verification", () => {
  it("signs Content-Type, checksum, conditional write and exact size; every retry gets a unique key", async () => {
    mocks.presign.mockResolvedValue("https://r2.test/upload");
    const result = await presignUpload("audio/key.mp3", "audio/mpeg", MAX_AUDIO_BYTES, 100, md5);
    const [, command, options] = mocks.presign.mock.calls[0];
    expect(command.input).toMatchObject({ ContentType: "audio/mpeg", ContentLength: 100, IfNoneMatch: "*", ContentMD5: Buffer.from(md5, "hex").toString("base64") });
    expect(options.signableHeaders.has("content-type")).toBe(true);
    expect(options.signableHeaders.has("if-none-match")).toBe(true);
    expect(options.signableHeaders.has("cache-control")).toBe(true);
    expect(result.headers["If-None-Match"]).toBe("*");
    expect(result.headers["Cache-Control"]).toBe(command.input.CacheControl);
    expect(audioKey("id", "mp3")).not.toBe(audioKey("id", "mp3"));
  });
  it("verifies HEAD plus conditional small Range and a matching signature", async () => {
    verifiedObject();
    expect(await verifyUpload(intent)).toEqual({ sizeBytes: 100, checksumMd5: md5 });
    expect(mocks.send.mock.calls[1][0].input).toMatchObject({ Range: "bytes=0-99", IfMatch: `"${md5}"` });
  });
  it.each([
    [{ ContentLength: 0 }, "size"],
    [{ ContentLength: MAX_AUDIO_BYTES + 1 }, "size"],
    [{ ContentLength: 101 }, "size mismatch"],
    [{ ContentType: "text/html" }, "type mismatch"],
    [{ ETag: '"multipart-3"' }, "checksum"],
    [{ ETag: `"${"cd".repeat(16)}"` }, "checksum mismatch"],
  ])("rejects invalid HEAD before reading content: %j", async (patch, error) => {
    mocks.send.mockResolvedValueOnce({ ContentLength: 100, ContentType: "audio/mpeg", ETag: `"${md5}"`, ...patch });
    await expect(verifyUpload(intent)).rejects.toThrow(error as string);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("rejects executable content with a spoofed media MIME and valid metadata", async () => {
    const html = new Uint8Array(100); html.set(Buffer.from("<!doctype html>"));
    verifiedObject(html);
    await expect(verifyUpload(intent)).rejects.toThrow("signature");
  });
  it("refuses non-Range responses before consuming an unbounded provider body", async () => {
    const consume = vi.fn();
    const destroy = vi.fn();
    mocks.send.mockResolvedValueOnce({ ContentLength: 100, ContentType: "audio/mpeg", ETag: `"${md5}"` });
    mocks.send.mockResolvedValueOnce({ ContentLength: 999999, Body: { transformToByteArray: consume, destroy } });
    await expect(verifyUpload(intent)).rejects.toThrow("range");
    expect(consume).not.toHaveBeenCalled(); expect(destroy).toHaveBeenCalled();
  });
  it("distinguishes WAV/WebP and rejects unsupported SVG and truncated headers", () => {
    const wav = Buffer.from("RIFFxxxxWAVEfmt ");
    const webp = Buffer.from("RIFFxxxxWEBPVP8 ");
    expect(matchesMagic(wav, "audio/wav")).toBe(true);
    expect(matchesMagic(wav, "image/webp")).toBe(false);
    expect(matchesMagic(webp, "image/webp")).toBe(true);
    expect(matchesMagic(Buffer.from("<svg>unsafe</svg>"), "image/svg+xml")).toBe(false);
    expect(matchesMagic(Buffer.from("ID3"), "audio/mpeg")).toBe(false);
  });
});
