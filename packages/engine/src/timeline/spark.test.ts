import { describe, expect, it } from "vitest";
import type { EnemySlotId, PlayerSlotId } from "../state/types.ts";
import {
  detectSparks,
  rememberSparkHits,
  SPARK_ASSIST_FACTOR,
  SPARK_WINDOW_TICKS,
  sparkWindowTicks,
} from "./spark.ts";
import type { ScheduledHit } from "./types.ts";

function hit(
  actor: PlayerSlotId,
  target: EnemySlotId,
  actionId = 0,
  hitIndex = 0,
  tick = 10,
): ScheduledHit {
  return {
    tick,
    actionId,
    actor,
    target,
    attackIndex: 0,
    hitIndex,
    distribution: 100,
    core: 100,
    critical: false,
    dropChecks: 1,
  };
}

describe("spark detection", () => {
  it("uses a one-tick (same frame) window", () => {
    expect(SPARK_WINDOW_TICKS).toBe(1);
  });

  it("sparks hits from different units on one target", () => {
    expect(detectSparks([hit("p0", "e0", 0), hit("p1", "e0", 1)])).toEqual([true, true]);
  });

  it("sparks hits from the same unit on one target (self-spark)", () => {
    expect(detectSparks([hit("p0", "e0", 0, 0), hit("p0", "e0", 0, 1)])).toEqual([true, true]);
  });

  it("does not spark a lone hit or hits on different targets", () => {
    expect(detectSparks([])).toEqual([]);
    expect(detectSparks([hit("p0", "e0")])).toEqual([false]);
    expect(detectSparks([hit("p0", "e0", 0), hit("p1", "e1", 1)])).toEqual([false, false]);
  });

  it("marks every hit in a group and only the grouped targets", () => {
    const batch = [hit("p0", "e0", 0), hit("p1", "e1", 1), hit("p2", "e0", 2), hit("p3", "e0", 3)];
    expect(detectSparks(batch)).toEqual([true, false, true, true]);
  });
});

describe("spark assist window", () => {
  it("widens the window by the assist factor (initial 2×)", () => {
    expect(SPARK_ASSIST_FACTOR).toBe(2);
    expect(sparkWindowTicks(false)).toBe(1);
    expect(sparkWindowTicks(true)).toBe(2);
  });

  it("counts a pending hit one tick later on the same target only with assist", () => {
    const batch = [hit("p0", "e0", 0)];
    const pending = [hit("p1", "e0", 1, 0, 11), hit("p2", "e0", 2, 0, 12)];
    expect(detectSparks(batch, { window: 1, recent: [], pending })).toEqual([false]);
    expect(detectSparks(batch, { window: 2, recent: [], pending })).toEqual([true]);
    // Two ticks away is outside a 2-tick window.
    expect(detectSparks(batch, { window: 2, recent: [], pending: pending.slice(1) })).toEqual([
      false,
    ]);
  });

  it("counts a resolved hit one tick earlier, not other targets or extra hits", () => {
    const batch = [hit("p0", "e0", 0), hit("p1", "e1", 1)];
    const recent = [{ tick: 9, target: "e0" as const }];
    expect(detectSparks(batch, { window: 2, recent, pending: [] })).toEqual([true, false]);
    const extra = { ...hit("p2", "e1", 2, 0, 11), extra: { index: 1, drops: false } };
    expect(detectSparks(batch, { window: 2, recent: [], pending: [extra] })).toEqual([
      false,
      false,
    ]);
  });

  it("remembers only what later ticks can still reach", () => {
    expect(rememberSparkHits([], [hit("p0", "e0")], 10, 1)).toEqual([]);
    const recent = [
      { tick: 8, target: "e0" as const },
      { tick: 9, target: "e1" as const },
    ];
    expect(rememberSparkHits(recent, [hit("p0", "e0")], 10, 2)).toEqual([
      { tick: 10, target: "e0" },
    ]);
  });
});
