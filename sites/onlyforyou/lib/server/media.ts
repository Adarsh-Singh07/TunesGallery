/** Small-header screening; this is not a complete decoder or malware scanner. */
export function matchesMagic(bytes: Uint8Array, mime: string): boolean {
  const b = Buffer.from(bytes);
  const at = (s: string, offset = 0) => b.subarray(offset, offset + s.length).toString("latin1") === s;
  if (b.length < 12) return false;
  switch (mime) {
    case "audio/mpeg":
      return at("ID3") || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && (b[1] & 0x06) !== 0 && (b[2] & 0xf0) !== 0xf0 && (b[2] & 0x0c) !== 0x0c);
    case "audio/aac": return b[0] === 0xff && (b[1] & 0xf6) === 0xf0;
    case "audio/mp4": case "audio/x-m4a":
      return at("ftyp", 4) && ["M4A ", "M4B ", "isom", "iso2", "mp41", "mp42"].some((brand) => at(brand, 8));
    case "audio/ogg": return at("OggS") && (b.includes(Buffer.from("OpusHead")) || b.includes(Buffer.from("\x01vorbis")));
    case "audio/wav": case "audio/x-wav": return at("RIFF") && at("WAVE", 8);
    case "audio/flac": case "audio/x-flac": return at("fLaC");
    case "image/jpeg": return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "image/png": return b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    case "image/webp": return at("RIFF") && at("WEBP", 8);
    case "image/avif": return at("ftyp", 4) && (at("avif", 8) || at("avis", 8));
    default: return false;
  }
}
