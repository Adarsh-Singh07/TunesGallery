// ─────────────────────────────────────────────────────────────────────────────
// Clock synchronization — pure functions + a sampler.
//
// The shared timeline lives on the server clock. Each client estimates its
// offset from server time with NTP-style ping/pong rounds against the
// `server_time()` Postgres function and keeps the sample with the lowest
// round-trip time.
// ─────────────────────────────────────────────────────────────────────────────

export interface ClockSample {
  /** client epoch ms when the ping left */
  t0: number;
  /** client epoch ms when the pong arrived */
  t1: number;
  /** server epoch ms reported by the server */
  serverTs: number;
}

export interface ClockEstimate {
  /** add this to Date.now() to approximate server time (ms) */
  offsetMs: number;
  /** round-trip time in ms */
  rttMs: number;
}

/** Pure NTP-style offset/RTT math so it is unit-testable. */
export function estimateFromSample(sample: ClockSample): ClockEstimate {
  const rttMs = sample.t1 - sample.t0;
  const offsetMs = sample.serverTs - (sample.t0 + sample.t1) / 2;
  return { offsetMs, rttMs };
}

export function pickBestSample(samples: ClockEstimate[]): ClockEstimate | null {
  if (samples.length === 0) return null;
  return samples.reduce((best, s) => (s.rttMs < best.rttMs ? s : best));
}

/**
 * Runs ping rounds against `ping()` (which returns the server timestamp).
 * Uses the min-RTT sample — the least contaminated by network delay.
 */
export async function synchronizeClock(
  ping: () => Promise<number>,
  rounds = 4,
): Promise<ClockEstimate | null> {
  const estimates: ClockEstimate[] = [];
  for (let i = 0; i < rounds; i++) {
    const t0 = Date.now();
    const serverTs = await ping();
    const t1 = Date.now();
    if (Number.isFinite(serverTs)) estimates.push(estimateFromSample({ t0, t1, serverTs }));
    if (i < rounds - 1) await new Promise((r) => setTimeout(r, 120));
  }
  return pickBestSample(estimates);
}
