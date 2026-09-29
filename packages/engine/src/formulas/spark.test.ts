import { describe, expect, it } from "vitest";
import { hitDamage } from "./damage.ts";
import { SPARK_BASE_MULT, sparkDropBonus, sparkMultiplier } from "./spark.ts";

describe("spark multiplier", () => {
  it("is 1 for an unsparked hit, even with spark buffs", () => {
    expect(sparkMultiplier(false)).toBe(1);
    expect(sparkMultiplier(false, 0.5)).toBe(1);
  });

  it("is 1.5 base plus additive, uncapped spark-damage buffs", () => {
    expect(SPARK_BASE_MULT).toBe(1.5);
    expect(sparkMultiplier(true)).toBe(1.5);
    expect(sparkMultiplier(true, 0.5)).toBe(2.0);
    expect(sparkMultiplier(true, 0.5 + 0.3 + 2.5)).toBeCloseTo(4.8, 12);
  });

  it("applies per hit before flooring (GAME_DESIGN §3 Case 3, hit 2)", () => {
    expect(hitDamage(19584, 30, { sparkMult: sparkMultiplier(true, 0.5) })).toBe(11750);
    expect(hitDamage(19584, 20, { sparkMult: sparkMultiplier(false, 0.5) })).toBe(3916);
  });

  it("adds no base drop bonus, only spark drop-bonus effects on sparked hits", () => {
    expect(sparkDropBonus(true)).toBe(0);
    expect(sparkDropBonus(true, 0.2)).toBe(0.2);
    expect(sparkDropBonus(false, 0.2)).toBe(0);
  });
});
