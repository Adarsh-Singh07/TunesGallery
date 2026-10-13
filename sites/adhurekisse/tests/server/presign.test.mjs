// Actual SDK signing with fake credentials. Presigning is entirely offline.
// The Vitest R2 test independently asserts that our helper passes these inputs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

test("real SDK binds upload MIME, size, checksum and no-overwrite condition", async () => {
  const client = new S3Client({
    region: "auto", endpoint: "https://offline-test.r2.cloudflarestorage.com",
    requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
    credentials: { accessKeyId: "offline-test-key", secretAccessKey: "offline-test-secret" },
  });
  try {
    const url = new URL(await getSignedUrl(client, new PutObjectCommand({
      Bucket: "offline-test", Key: "audio/immutable.mp3", ContentType: "audio/mpeg",
      ContentLength: 100, ContentMD5: Buffer.from("ab".repeat(16), "hex").toString("base64"),
      IfNoneMatch: "*", CacheControl: "private, no-store",
    }), { expiresIn: 900, signableHeaders: new Set(["content-type", "content-length", "content-md5", "if-none-match", "cache-control"]) }));
    const signed = url.searchParams.get("X-Amz-SignedHeaders").split(";");
    for (const header of ["content-type", "content-length", "content-md5", "if-none-match", "host", "cache-control"]) assert.ok(signed.includes(header), `${header} must be signed`);
    // Every signed header must be in the returned upload contract, except host
    // and content-length, which the browser generates from the URL/File.
    const browserHeaders = new Set(["content-type", "content-md5", "if-none-match", "cache-control"]);
    for (const header of signed) assert.ok(["host", "content-length"].includes(header) || browserHeaders.has(header), `missing upload header ${header}`);
    assert.equal(url.searchParams.get("X-Amz-Expires"), "900");
  } finally { client.destroy(); }
});
