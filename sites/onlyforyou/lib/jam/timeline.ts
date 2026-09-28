// ─────────────────────────────────────────────────────────────────────────────
// Shared-timeline math — pure functions, fully unit-tested.
//
// The authoritative room state stores a REFERENCE position and the server
// timestamp when it was set. The live position is computed, never copied from
// a client's raw audio.currentTime. Devices stream independently and are held
// together by these calculations plus adaptive drift correction.
// ─────────────────────────────────────────────────────────────────────────────

export interface TimelineState {
  /** reference position in seconds as of `updatedAt` (server time) */
  positionSeconds: number;
  /** server epoch ms when the reference position was written */
  updatedAt: number;
  playbackState: "idle" | "ready" | "playing" | "paused" | "ended";
}

/** Drift-correction thresholds (tuning parameters, not guarantees). */
export interface DriftThresholds {
  /** below this: leave it alone */
  none: number;
  /** up to this: gentle correction (playback-rate nudge) */
  nudge: number;
  /** above: hard resync via seek */
  seek: number;
}

export const DEFAULT_DRIFT_THRESHOLDS: DriftThresholds = {
  none: 80,
  nudge: 250,
  seek: 250,
};

/** Convert a client epoch to the estimated server epoch. */
export function clientToServerMs(clientNow: number, offsetMs: number): number {
  return clientNow + offsetMs;
}

/**
 * Expected playback position for a given server epoch. While playing, the
 * position advances in wall-clock time from the reference; otherwise it is
 * frozen. Clamps at 0 — a scheduled future start yields 0.
 */
export function expectedPosition(timeline: TimelineState, serverNowMs: number): number {
  if (timeline.playbackState !== "playing") return timeline.positionSeconds;
  const elapsedSec = (serverNowMs - timeline.updatedAt) / 1000;
  return Math.max(0, timeline.positionSeconds + elapsedSec);
}

/** Drift of a device relative to the shared timeline, in ms (positive = behind). */
export function driftMs(
  timeline: TimelineState,
  serverNowMs: number,
  localPositionSec: number,
): number {
  const target = expectedPosition(timeline, serverNowMs);
  return (target - localPositionSec) * 1000;
}

export type Correction = "none" | "nudge" | "seek";

/** Decide how strongly to correct, given current drift and thresholds. */
export function classifyDrift(
  drift: number,
  thresholds: DriftThresholds = DEFAULT_DRIFT_THRESHOLDS,
): Correction {
  const abs = Math.abs(drift);
  if (abs < thresholds.none) return "none";
  if (abs <= thresholds.nudge) return "nudge";
  return "seek";
}

/**
 * Playback-rate nudge to close a drift gap gently. Positive drift (behind)
 → slightly faster. Kept within ±3% so pitch stays inaudibly unaffected.
 */
export function nudgeRate(drift: number, maxRateDelta = 0.03): number {
  const rate = 1 + (drift / 1000) * 0.25;
  return Math.min(1 + maxRateDelta, Math.max(1 - maxRateDelta, rate));
}

/** Drift small enough to stop nudging and return to rate 1.0. */
export const NUDGE_SETTLE_MS = 40;

/**
 * The scheduled instant a synchronized start should begin, expressed in
 * server time: `leadMs` in the future so every client can arm playback.
 */
export function scheduledStartAt(serverNowMs: number, leadMs = 1200): number {
  return serverNowMs + leadMs;
}

/**
 * Milliseconds from client `now` until a scheduled server-time instant.
 * Negative → the moment has already passed (start immediately).
 */
export function msUntilServerTime(clientNow: number, offsetMs: number, serverAt: number): number {
  return serverAt - clientToServerMs(clientNow, offsetMs);
}
