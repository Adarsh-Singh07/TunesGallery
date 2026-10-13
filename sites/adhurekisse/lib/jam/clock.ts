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
  const valid = samples.filter((s) => Number.isFinite(s.offsetMs) && Number.isFinite(s.rttMs) && s.rttMs >= 0 && s.rttMs <= 10_000);
  if (valid.length === 0) return null;
  return valid.reduce((best, s) => (s.rttMs < best.rttMs ? s : best));
}

/**
 * Runs ping rounds against `ping()` (which returns the server timestamp).
 * Uses the min-RTT sample — the least contaminated by network delay.
 */
export async function synchronizeClock(
  ping: (signal?: AbortSignal) => Promise<number>,
  rounds = 4,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<ClockEstimate | null> {
  const estimates: ClockEstimate[] = [];
  for (let i = 0; i < rounds; i++) {
    if (options.signal?.aborted) break;
    const t0 = Date.now();
    const mono = performance.now();
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let rejectAbort: (() => void) | undefined;
    try {
      const cancelled = new Promise<never>((_, reject) => {
        rejectAbort = () => reject(new Error("Clock sample cancelled"));
        controller.signal.addEventListener("abort", rejectAbort, { once: true });
        timeout = setTimeout(abort, options.timeoutMs ?? 1_500);
      });
      const serverTs = await Promise.race([ping(controller.signal), cancelled]);
      const elapsed = performance.now() - mono;
      // A wall-clock adjustment mid-request cannot be interpreted as network RTT.
      if (Number.isFinite(serverTs) && Math.abs(Date.now() - t0 - elapsed) < 100) {
        const estimate = estimateFromSample({ t0, t1: t0 + elapsed, serverTs });
        // Sub-millisecond wall-clock noise is not meaningful for a phone Jam
        // and makes tests (and drift thresholds) needlessly nondeterministic.
        estimates.push({ offsetMs: Math.trunc(estimate.offsetMs), rttMs: estimate.rttMs });
      }
    } catch {
      // One failed/slow sample must not discard the useful rounds.
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
      if (rejectAbort) controller.signal.removeEventListener("abort", rejectAbort);
    }
  }
  return pickBestSample(estimates);
}
