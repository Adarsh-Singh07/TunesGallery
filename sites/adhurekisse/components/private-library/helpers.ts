import type { TrackRow } from "../../lib/auth";
import type { Song } from "../../data/songs";

export function trackToSong(track: TrackRow): Song {
  return { id: `r2-${track.id}`, title: track.title, artist: track.artist, album: track.album ?? undefined,
    movie: track.movie ?? undefined, year: track.year ?? undefined, tags: track.tags ?? [],
    artwork: { cover: track.artworkUrl || "/icon.svg" }, playback: { r2TrackId: track.id }, accent: "#c9a560" };
}
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
export function filterTracks(tracks: TrackRow[], query: string): TrackRow[] {
  const term = query.trim().toLocaleLowerCase();
  return tracks.filter((track) => [track.title, track.artist, track.album, track.movie, track.year, ...track.tags].filter(Boolean).some((value) => value!.toLocaleLowerCase().includes(term)));
}
export function safeReturnPath(path: string | null): string {
  if (path && /^\/library\?playlist=[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.exec(path)?.[0] === path) return path;
  if (jamCodeFromPath(path)) return path!;
  return path === "/admin" || path === "/library" || path === "/" ? path : "/";
}

/** Accept only the canonical local invite path: no extra params, fragments or redirects. */
export function jamCodeFromPath(path: string | null): string | null {
  const match = path?.match(/^\/\?jam=([A-Za-z0-9]{6})$/);
  return match && match[0] === path ? match[1].toUpperCase() : null;
}
