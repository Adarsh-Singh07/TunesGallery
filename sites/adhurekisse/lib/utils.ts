/**
 * Formats seconds into m:ss string.
 */
export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Zero-pads a number to a given width.
 */
export function padTrack(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/**
 * Returns true if the browser prefers reduced motion.
 * SSR-safe (returns false on the server).
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Clamps a number between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
