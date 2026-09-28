import { describe, expect, it } from "vitest";
import {
  DEFAULT_DRIFT_THRESHOLDS,
  NUDGE_SETTLE_MS,
  classifyDrift,
  driftMs,
  expectedPosition,
  msUntilServerTime,
  nudgeRate,
  scheduledStartAt,
} from "../../lib/jam/timeline";

const base = {
  positionSeconds: 30,
  updatedAt: 1_000_000,
  playbackState: "playing" as const,
};

describe("expectedPosition", () => {
  it("advances with server time while playing", () => {
    expect(expectedPosition(base, 1_005_000)).toBeCloseTo(35, 3);
  });

  it("freezes while paused", () => {
    expect(expectedPosition({ ...base, playbackState: "paused" }, 1_005_000)).toBe(30);
  });

  it("freezes while idle", () => {
    expect(expectedPosition({ ...base, playbackState: "idle" }, 1_005_000)).toBe(30);
  });

  it("clamps at zero for scheduled future starts", () => {
    // a scheduled start writes position 0 with updatedAt slightly in the
    // future; before that instant the expected position stays 0
    const scheduled = { ...base, positionSeconds: 0, updatedAt: 1_005_000 };
    expect(expectedPosition(scheduled, 1_003_000)).toBe(0);
    expect(expectedPosition(scheduled, 1_007_000)).toBeCloseTo(2, 3);
  });
});

describe("driftMs", () => {
  it("is positive when the device is behind the timeline", () => {
    // timeline expects 35s, device reports 34.9s → 100ms behind
    const d = driftMs(base, 1_005_000, 34.9);
    expect(d).toBeCloseTo(100, 0);
  });

  it("is negative when the device is ahead", () => {
    const d = driftMs(base, 1_005_000, 35.2);
    expect(d).toBeCloseTo(-200, 0);
  });

  it("is ~zero when perfectly aligned", () => {
    expect(Math.abs(driftMs(base, 1_005_000, 35))).toBeLessThan(0.001);
  });
});

describe("classifyDrift", () => {
  const t = DEFAULT_DRIFT_THRESHOLDS;

  it("ignores sub-80ms drift", () => {
    expect(classifyDrift(79, t)).toBe("none");
    expect(classifyDrift(-79, t)).toBe("none");
  });

  it("nudges 80–250ms", () => {
    expect(classifyDrift(80, t)).toBe("nudge");
    expect(classifyDrift(250, t)).toBe("nudge");
    expect(classifyDrift(-180, t)).toBe("nudge");
  });

  it("seeks beyond 250ms", () => {
    expect(classifyDrift(251, t)).toBe("seek");
    expect(classifyDrift(-900, t)).toBe("seek");
  });
});

describe("nudgeRate", () => {
  it("speeds up when behind", () => {
    expect(nudgeRate(100)).toBeGreaterThan(1);
  });

  it("slows down when ahead", () => {
    expect(nudgeRate(-100)).toBeLessThan(1);
  });

  it("stays within ±3% so pitch stays inaudible", () => {
    expect(nudgeRate(10_000)).toBeLessThanOrEqual(1.03);
    expect(nudgeRate(-10_000)).toBeGreaterThanOrEqual(0.97);
  });

  it("returns ~1.0 near zero drift (settle band)", () => {
    expect(Math.abs(nudgeRate(NUDGE_SETTLE_MS) - 1)).toBeLessThan(0.02);
  });
});

describe("scheduled starts", () => {
  it("arms a start lead ms in the server future", () => {
    const serverNow = 5_000_000;
    expect(scheduledStartAt(serverNow, 1200)).toBe(5_001_200);
  });

  it("converts back to client countdown", () => {
    // client at 4_999_000 with +200ms offset sees the same server instant
    const serverAt = scheduledStartAt(5_000_000, 1200);
    const remaining = msUntilServerTime(4_999_000, 200, serverAt);
    expect(remaining).toBe(1200 + 5_000_000 - (4_999_000 + 200));
  });
});
