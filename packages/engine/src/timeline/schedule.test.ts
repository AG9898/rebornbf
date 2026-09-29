import { describe, expect, it } from "vitest";
import { compareHits, insertHits, msToTick, scheduleAttacks } from "./schedule.ts";

describe("timeline scheduling", () => {
  it("converts milliseconds to 60/s ticks, flooring", () => {
    expect(msToTick(0)).toBe(0);
    expect(msToTick(16)).toBe(0);
    expect(msToTick(17)).toBe(1);
    expect(msToTick(1000)).toBe(60);
    expect(() => msToTick(-1)).toThrow(RangeError);
  });

  it("schedules hit i at start + startDelayFrames + hitFrames[i]", () => {
    const hits = scheduleAttacks(
      [
        {
          moveType: "melee",
          startDelayFrames: 12,
          hitFrames: [0, 6, 6],
          damageDistribution: [40, 30, 30],
          dropChecks: 3,
        },
      ],
      100,
      3,
      "p1",
      "e0",
      [{ core: 100, critical: false }],
    );
    expect(hits.map((h) => [h.tick, h.hitIndex, h.distribution])).toEqual([
      [112, 0, 40],
      [118, 1, 30],
      [118, 2, 30],
    ]);
  });

  it("keeps the timeline sorted by tick, action, attack, hit", () => {
    const a = scheduleAttacks(
      [
        {
          moveType: "ranged",
          startDelayFrames: 0,
          hitFrames: [10],
          damageDistribution: [100],
          dropChecks: 1,
        },
      ],
      0,
      1,
      "p0",
      "e0",
      [{ core: 100, critical: false }],
    );
    const b = scheduleAttacks(
      [
        {
          moveType: "ranged",
          startDelayFrames: 0,
          hitFrames: [5, 10],
          damageDistribution: [50, 50],
          dropChecks: 2,
        },
      ],
      0,
      0,
      "p1",
      "e0",
      [{ core: 100, critical: false }],
    );
    const timeline = insertHits(a, b);
    expect(timeline.map((h) => [h.tick, h.actionId])).toEqual([
      [5, 0],
      [10, 0],
      [10, 1],
    ]);
    expect([...timeline].sort(compareHits)).toEqual(timeline);
  });
});
