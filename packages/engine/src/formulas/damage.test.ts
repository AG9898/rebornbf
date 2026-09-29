import { describe, expect, it } from "vitest";
import { createRng } from "../rng.ts";
import { attackTotal, STAT_CAP } from "./attack-stat.ts";
import { type AttackRolls, attackCore, hitDamage, MIN_HIT_DAMAGE, rollAttack } from "./damage.ts";
import { defenseTerm } from "./defense.ts";
import { elementMultiplier } from "./element.ts";
import { guardMultiplier, mitigationMultiplier } from "./mitigation.ts";

// Reference damage cases from GAME_DESIGN §3 (M0-03A), each with its random draws fixed.
// Hand calculations are shown in the design doc next to each case.

const noCrit = (variance: number, divisor: number): AttackRolls => ({
  critical: false,
  variance,
  divisor,
});

describe("reference damage cases (GAME_DESIGN §3)", () => {
  it("Case 1 — plain normal attack, neutral: 940", () => {
    const atkTotal = attackTotal({ atk: 1000 });
    const core = attackCore({ atkTotal, targetDef: 300, rolls: noCrit(1, 25), elementMult: 1 });
    // 1000 − 100 = 900; × 1.0; + 1000/25 = 940
    expect(hitDamage(core, 100)).toBe(940);
  });

  it("Case 2 — variance and per-hit flooring: 252 + 588 = 840", () => {
    const core = attackCore({
      atkTotal: attackTotal({ atk: 1000 }),
      targetDef: 300,
      rolls: noCrit(0.9, 32),
      elementMult: 1,
    });
    // 900 × 0.9 + 31.25 = 841.25 → floor(252.375), floor(588.875)
    const hits = [30, 70].map((dist) => hitDamage(core, dist));
    expect(hits).toEqual([252, 588]);
    expect(hits.reduce((a, b) => a + b, 0)).toBe(840);
  });

  it("Case 3 — burst with DEF-ignore, crit, and one sparked hit: 25458", () => {
    const atkTotal = attackTotal({ atk: 2000, statMods: 0.5 + 0.3, bbModifier: 3.0 });
    expect(atkTotal).toBe(9600);
    const core = attackCore({
      atkTotal,
      targetDef: 5000,
      defIgnore: true,
      rolls: { critical: true, critBase: 0.5, divisor: 25 },
      critDamageBuffs: 0.5,
      elementMult: 1,
    });
    // 9600 × 2.0 + 384 = 19584
    expect(core).toBe(19584);
    const hits = [
      hitDamage(core, 20),
      hitDamage(core, 30, { sparkMult: 1.5 + 0.5 }),
      hitDamage(core, 50),
    ];
    expect(hits).toEqual([3916, 11750, 9792]);
    expect(hits.reduce((a, b) => a + b, 0)).toBe(25458);
  });

  it("Case 4 — elemental weakness with mitigation: 1170", () => {
    const atkTotal = attackTotal({ atk: 1500, statMods: 0.2 });
    expect(atkTotal).toBe(1800);
    const elementMult = elementMultiplier({
      attacker: "fire",
      defender: "earth",
      elementalDamageBuffs: 0.25,
    });
    expect(elementMult).toBe(1.75);
    const core = attackCore({ atkTotal, targetDef: 600, rolls: noCrit(1, 25), elementMult });
    // (1600 + 72) × 1.75 = 2926; mitigation (1 − 0.5) − 0.1 = 0.4 → floor(1170.4)
    const mitigation = mitigationMultiplier({ bb: 0.5, passive: 0.1 });
    expect(mitigation).toBeCloseTo(0.4, 12);
    expect(hitDamage(core, 100, { mitigation })).toBe(1170);
  });

  it("Case 5 — resisted element into a guarding target: 642", () => {
    const elementMult = elementMultiplier({ attacker: "water", defender: "thunder" });
    expect(elementMult).toBe(0.5);
    const core = attackCore({
      atkTotal: attackTotal({ atk: 3000 }),
      targetDef: 1200,
      rolls: noCrit(0.95, 30),
      elementMult,
    });
    // (2600 × 0.95 + 100) × 0.5 = 1285; guard ×0.5 → floor(642.5)
    expect(hitDamage(core, 100, { guard: guardMultiplier(true) })).toBe(642);
  });

  it("Case 6 — critical damage cap: 35178", () => {
    const core = attackCore({
      atkTotal: attackTotal({ atk: 5000 }),
      targetDef: 0,
      rolls: { critical: true, critBase: 0.6, divisor: 28 },
      critDamageBuffs: 6.0,
      elementMult: 1,
    });
    // min(7.0, 7.6) → 35000 + 178.571…
    expect(hitDamage(core, 100)).toBe(35178);
  });
});

describe("damage formula components", () => {
  it("caps atk_total at 99,999 and floors it", () => {
    expect(attackTotal({ atk: 50000, bbModifier: 3 })).toBe(STAT_CAP);
    expect(attackTotal({ atk: 1001, statMods: 0.5 })).toBe(1501);
    // RESOLVED-37 item 1: flat ATK is added before the % sum.
    expect(attackTotal({ atk: 1000, flatAtk: 200, statMods: 0.5 })).toBe(1800);
  });

  it("uses DEF ÷ 3 unrounded, or 0 with DEF-ignore", () => {
    expect(defenseTerm(1000)).toBeCloseTo(333.333, 3);
    expect(defenseTerm(1000, true)).toBe(0);
  });

  it("deals at least 1 damage per hit", () => {
    const core = attackCore({
      atkTotal: 100,
      targetDef: 3000,
      rolls: noCrit(1, 25),
      elementMult: 1,
    });
    expect(core).toBeLessThan(0);
    expect(hitDamage(core, 100)).toBe(MIN_HIT_DAMAGE);
    expect(hitDamage(500, 100, { guard: guardMultiplier(true, 0.5) })).toBe(MIN_HIT_DAMAGE);
  });

  it("caps passive mitigation at 50% and stacks BB, UBB, and elemental mitigation", () => {
    expect(mitigationMultiplier()).toBe(1);
    expect(mitigationMultiplier({ passive: 0.8 })).toBe(0.5);
    // (0.5 × 0.8 − 0.1) × (0.8 × 0.9) = 0.3 × 0.72
    expect(
      mitigationMultiplier({
        bb: 0.5,
        ubb: 0.2,
        passive: 0.1,
        bbElemental: 0.2,
        ubbElemental: 0.1,
      }),
    ).toBeCloseTo(0.216, 12);
    expect(guardMultiplier(false)).toBe(1);
    expect(guardMultiplier(true, 0.2)).toBeCloseTo(0.3, 12);
  });

  it("rolls attack terms deterministically: crit → base, else variance, then divisor", () => {
    const rng = createRng(42);
    expect(rollAttack(rng, 0.3)).toEqual(rollAttack(rng, 0.3));
    const normal = rollAttack(rng, 0).value;
    const crit = rollAttack(rng, 1).value;
    expect(normal.critical).toBe(false);
    expect(crit.critical).toBe(true);
    expect(normal.divisor).toBeGreaterThanOrEqual(25);
    expect(crit.divisor).toBeLessThanOrEqual(32);
  });
});
