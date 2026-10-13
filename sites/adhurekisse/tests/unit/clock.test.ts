import { describe, expect, it, vi } from "vitest";
import {
  estimateFromSample,
  pickBestSample,
  synchronizeClock,
} from "../../lib/jam/clock";

describe("estimateFromSample", () => {
  it("computes offset as midpoint minus server timestamp", () => {
    // server says 10:00:00.000; client sent at 10:00:00.050 (client clock
    // 200ms fast), received at .050 → offset = server - midpoint
    const est = estimateFromSample({
      t0: 1_000_050,
      t1: 1_000_050,
      serverTs: 1_000_000,
    });
    expect(est.offsetMs).toBe(-50);
    expect(est.rttMs).toBe(0);
  });

  it("is unaffected by symmetric network delay", () => {
    // 40ms up, 40ms down — midpoint math cancels it
    const est = estimateFromSample({
      t0: 2_000_000,
      t1: 2_000_080,
      serverTs: 2_000_040 - 300,
    });
    expect(est.offsetMs).toBe(-300);
    expect(est.rttMs).toBe(80);
  });

  it("skews with asymmetric delay (documented limitation)", () => {
    // true offset 0; server timestamp taken 10ms after t0, response needs
    // another 90ms. Midpoint math then computes a -40ms offset — biased by
    // (down-up)/2 = 40ms. Min-RTT sampling across rounds mitigates this.
    const est = estimateFromSample({
      t0: 3_000_000,
      t1: 3_000_100,
      serverTs: 3_000_010,
    });
    expect(est.offsetMs).toBe(-40);
    expect(est.rttMs).toBe(100);
  });
});

describe("pickBestSample", () => {
  it("prefers the lowest round-trip time", () => {
    const best = pickBestSample([
      { offsetMs: 100, rttMs: 400 },
      { offsetMs: -20, rttMs: 30 },
      { offsetMs: 500, rttMs: 120 },
    ]);
    expect(best?.offsetMs).toBe(-20);
  });

  it("returns null with no samples", () => {
    expect(pickBestSample([])).toBeNull();
  });

  it("rejects invalid and suspended-request RTT samples", () => {
    expect(pickBestSample([
      { offsetMs: NaN, rttMs: 1 }, { offsetMs: 0, rttMs: -1 },
      { offsetMs: 99, rttMs: 20_000 }, { offsetMs: 20, rttMs: 40 },
    ])).toEqual({ offsetMs: 20, rttMs: 40 });
  });
});

describe("synchronizeClock", () => {
  it("uses the min-rtt sample across rounds", async () => {
    const estimate = await synchronizeClock(async () => {
      // server truth: Date.now() - 500; latency inflates t1 symmetrically
      return Date.now() - 500;
    }, 3);
    expect(estimate).not.toBeNull();
    // offset must land within (rtt/2) of the true -500ms offset
    expect(Math.abs(estimate!.offsetMs + 500)).toBeLessThan(250);
  }, 10_000);

  it("returns null when the server never answers", async () => {
    const estimate = await synchronizeClock(async () => Number.NaN, 2);
    expect(estimate).toBeNull();
  }, 10_000);

  it("keeps useful rounds after an individual request fails", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const monotonic = vi.spyOn(performance, "now").mockReturnValue(0);
    try {
      const ping = vi.fn().mockRejectedValueOnce(new Error("offline"))
        .mockImplementation(async () => 1_000_100);
      expect((await synchronizeClock(ping, 3))?.offsetMs).toBe(100);
      expect(ping).toHaveBeenCalledTimes(3);
    } finally {
      now.mockRestore();
      monotonic.mockRestore();
    }
  });

  it("bounds a hung clock round and aborts its request", async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const task = synchronizeClock((value) => { signal = value; return new Promise<number>(() => {}); }, 1, { timeoutMs: 50 });
      await vi.advanceTimersByTimeAsync(50);
      expect(await task).toBeNull();
      expect(signal?.aborted).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it("stops sampling after session cancellation", async () => {
    const controller = new AbortController(); controller.abort();
    const ping = vi.fn(async () => Date.now());
    expect(await synchronizeClock(ping, 4, { signal: controller.signal })).toBeNull();
    expect(ping).not.toHaveBeenCalled();
  });
});
