import { describe, expect, it } from "vitest";
import { createRng } from "../rng.ts";
import { CRIT_MULT_CAP, critMultiplier, rollCrit, rollCritBase } from "./crit.ts";
import { rollAtkDivisor, rollVariance } from "./variance.ts";

describe("critical hits", () => {
  it("builds the multiplier as 1 + base + buffs, capped at ×7.0", () => {
    expect(critMultiplier(0.5)).toBe(1.5);
    expect(critMultiplier(0.6, 0.5)).toBeCloseTo(2.1, 12);
    expect(critMultiplier(0.6, 6)).toBe(CRIT_MULT_CAP);
  });

  it("never crits at rate 0, always at rate 1, and always consumes one draw", () => {
    let rng = createRng(99);
    for (let i = 0; i < 200; i++) {
      const never = rollCrit(rng, 0);
      const always = rollCrit(rng, 1);
      expect(never.value).toBe(false);
      expect(always.value).toBe(true);
      expect(always.rng).toEqual(never.rng);
      rng = never.rng;
    }
  });

  it("draws crit base, variance, and divisor inside their ranges", () => {
    let rng = createRng(5);
    const divisors = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const base = rollCritBase(rng);
      const variance = rollVariance(base.rng);
      const divisor = rollAtkDivisor(variance.rng);
      rng = divisor.rng;
      expect(base.value).toBeGreaterThanOrEqual(0.5);
      expect(base.value).toBeLessThan(0.6);
      expect(variance.value).toBeGreaterThanOrEqual(0.9);
      expect(variance.value).toBeLessThan(1.0);
      divisors.add(divisor.value);
    }
    expect([...divisors].sort((a, b) => a - b)).toEqual([25, 26, 27, 28, 29, 30, 31, 32]);
  });
});
