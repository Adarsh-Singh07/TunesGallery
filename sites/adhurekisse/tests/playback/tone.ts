import type { Route } from "@playwright/test";

/** Deterministic PCM WAV decoded by Chromium's real media pipeline. */
export function toneWav(seconds = 90, frequency = 220) {
  const rate = 8000;
  const length = Math.floor(seconds * rate);
  const result = Buffer.alloc(44 + length * 2);
  result.write("RIFF", 0); result.writeUInt32LE(result.length - 8, 4);
  result.write("WAVEfmt ", 8); result.writeUInt32LE(16, 16);
  result.writeUInt16LE(1, 20); result.writeUInt16LE(1, 22);
  result.writeUInt32LE(rate, 24); result.writeUInt32LE(rate * 2, 28);
  result.writeUInt16LE(2, 32); result.writeUInt16LE(16, 34);
  result.write("data", 36); result.writeUInt32LE(length * 2, 40);
  for (let sample = 0; sample < length; sample++) result.writeInt16LE(Math.round(Math.sin(2 * Math.PI * frequency * sample / rate) * 400), 44 + sample * 2);
  return result;
}

export async function fulfillTone(route: Route, body: Buffer) {
  const range = route.request().headers().range;
  const headers: Record<string, string> = {
    "content-type": "audio/wav", "accept-ranges": "bytes", "cache-control": "private, no-store",
    "access-control-allow-origin": "*", "x-content-type-options": "nosniff",
  };
  if (!range) return route.fulfill({ status: 200, headers, body });
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  let start = match?.[1] ? Number(match[1]) : 0;
  let end = match?.[2] ? Number(match[2]) : body.length - 1;
  if (match && !match[1] && match[2]) { start = Math.max(0, body.length - Number(match[2])); end = body.length - 1; }
  if (!match || start >= body.length || start > end) return route.fulfill({ status: 416, headers: { ...headers, "content-range": `bytes */${body.length}` }, body: "" });
  end = Math.min(end, body.length - 1);
  return route.fulfill({ status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${body.length}` }, body: body.subarray(start, end + 1) });
}
