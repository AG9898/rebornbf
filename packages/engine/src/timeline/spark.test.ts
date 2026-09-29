import { describe, expect, it } from "vitest";
import type { EnemySlotId, PlayerSlotId } from "../state/types.ts";
import { detectSparks, SPARK_WINDOW_TICKS } from "./spark.ts";
import type { ScheduledHit } from "./types.ts";

function hit(actor: PlayerSlotId, target: EnemySlotId, actionId = 0, hitIndex = 0): ScheduledHit {
  return {
    tick: 10,
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
