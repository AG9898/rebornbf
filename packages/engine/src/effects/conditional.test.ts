import { describe, expect, it } from "vitest";
import { bbGaugeFraction, conditionHolds } from "./conditional.ts";

const at = (hp: number, turn = 1, bc = 0, bbCost = 20) => ({ hp, maxHp: 4000, turn, bc, bbCost });

describe("conditionHolds", () => {
  it("reads HP thresholds strictly as fractions of max HP", () => {
    const above = { id: "cond.hp_above", value: 0.5 } as const;
    expect(conditionHolds(above, at(2001))).toBe(true);
    expect(conditionHolds(above, at(2000))).toBe(false);
    const below = { id: "cond.hp_below", value: 0.2 } as const;
    expect(conditionHolds(below, at(799))).toBe(true);
    expect(conditionHolds(below, at(800))).toBe(false);
  });

  it("holds for the first N turns", () => {
    const first = { id: "cond.first_turns", value: 2 } as const;
    expect([1, 2, 3].map((turn) => conditionHolds(first, at(4000, turn)))).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("reads the BB gauge as a fraction of the BB cost; a partly filled SBB counts as 100%", () => {
    const above = { id: "cond.bb_above", value: 0.5 } as const;
    expect(bbGaugeFraction(11, 20)).toBeCloseTo(0.55);
    expect(bbGaugeFraction(35, 20)).toBe(1);
    expect(bbGaugeFraction(5, 0)).toBe(0);
    expect(conditionHolds(above, at(4000, 1, 11))).toBe(true);
    expect(conditionHolds(above, at(4000, 1, 10))).toBe(false);
    expect(conditionHolds(above, at(4000, 1, 40))).toBe(true);
    // "Full" (value 1) can never be exceeded: the fraction is capped at 1.
    expect(conditionHolds({ id: "cond.bb_above", value: 0.99 }, at(4000, 1, 20))).toBe(true);
  });

  it("never holds for conditions the battle state cannot track yet", () => {
    expect(conditionHolds({ id: "cond.after_hc_collected", value: 1 }, at(4000))).toBe(false);
    expect(conditionHolds({ id: "cond.sphere_type_equipped", value: 0 }, at(4000))).toBe(false);
    expect(conditionHolds({ id: "cond.signature_sphere", value: 0 }, at(4000))).toBe(false);
  });
});
