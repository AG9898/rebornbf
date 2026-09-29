import { describe, expect, it } from "vitest";
import { createRng, nextFloat, nextInt } from "../rng.ts";
import { makeUnit } from "../test/factories.ts";
import {
  BC_BASE_RATE,
  bcCrystalFill,
  bcDropRate,
  dropSpawns,
  HC_BASE_RATE,
  hcDropRate,
  hcHeal,
} from "./rates.ts";
import {
  type Collector,
  collectCrystals,
  countBcDrops,
  gaugeMax,
  type HitDrops,
  rollHcDivisor,
  rollHitDrops,
} from "./roll.ts";

const form = (() => {
  const base = makeUnit("dropper").forms[0];
  if (!base) throw new Error("factory form missing");
  // bbCost 25, sbbCost 20 as in GAME_DESIGN §2 Reference BB-fill cases.
  return {
    ...base,
    bursts: {
      bb: { ...base.bursts.bb, cost: 25 },
      sbb: { ...base.bursts.bb, cost: 20 },
    },
  };
})();

function collector(overrides: Partial<Collector> = {}): Collector {
  return { form, maxHp: 4000, hp: 4000, bc: 0, recTotal: 907, ...overrides };
}

function drops(bc: number, hcDivisors: number[] = []): HitDrops {
  return { bc, hc: hcDivisors.length, hcDivisors };
}

describe("drop rates (GAME_DESIGN §2 BC drop rate)", () => {
  it("uses base rates of 35% per BC check and 10% per HC roll", () => {
    expect(BC_BASE_RATE).toBe(35);
    expect(HC_BASE_RATE).toBe(10);
    expect(bcDropRate()).toBe(35);
    expect(hcDropRate()).toBe(10);
  });

  it("Fill 2 rates: +20% BB drop buff → 55; ×2 once the target is at 0 HP → 110", () => {
    expect(bcDropRate({ burstBuff: 20 })).toBe(55);
    expect(bcDropRate({ burstBuff: 20, overkill: true })).toBe(110);
    expect(hcDropRate({ overkill: true })).toBe(20);
  });

  it("Fill 4: 35 × (1 − 0.2) + (40 + 20) × (1 − 0.5) = 58", () => {
    const rate = bcDropRate({
      spheres: 40,
      leaderSkills: 20,
      baseResistance: 0.2,
      buffedResistance: 0.5,
    });
    expect(rate).toBeCloseTo(58, 10);
    expect(dropSpawns(58, 58)).toBe(true);
    expect(dropSpawns(59, 58)).toBe(false);
  });

  it("adds every bonus slot and the spark drop bonus additively, uncapped", () => {
    const rate = bcDropRate({
      inherent: 1,
      burstBuff: 20,
      ubbBuff: 30,
      itemBuff: 10,
      spheres: 15,
      leaderSkills: 25,
      spark: 9,
    });
    // 35 + 1 + 20 + 30 + 10 + 15 + 25 + 9 = 145
    expect(rate).toBe(145);
    expect(hcDropRate({ bonus: 15, spark: 5 })).toBe(30);
  });

  it("never spawns at rate ≤ 0 and always spawns at rate ≥ 100", () => {
    expect(dropSpawns(0, 0)).toBe(false);
    expect(dropSpawns(0, -5)).toBe(false);
    expect(dropSpawns(100, 100)).toBe(true);
    expect(dropSpawns(100, 110)).toBe(true);
  });
});

describe("reference BB-fill cases (GAME_DESIGN §2)", () => {
  it("Fill 1: 20 BC at +75% efficacy fill 35 — BB usable (≥ 25), SBB not (< 45)", () => {
    expect(bcCrystalFill(20, 0.75)).toBe(35);
    const result = collectCrystals(collector(), drops(20), { bcEfficacy: 0.75 });
    expect(result.bc).toBe(35);
    expect(result.bcGained).toBe(35);
    expect(gaugeMax(form)).toBe(45);
    expect(result.bc >= form.bursts.bb.cost).toBe(true);
    expect(result.bc >= gaugeMax(form)).toBe(false);
  });

  it("Fill 2: 3 checks per hit; draws 10, 55, 56 at 55 → 2 BC, then 100, 99, 0 at 110 → 3 BC", () => {
    const hit1 = countBcDrops([10, 55, 56], bcDropRate({ burstBuff: 20 }));
    const hit2 = countBcDrops([100, 99, 0], bcDropRate({ burstBuff: 20, overkill: true }));
    expect([hit1, hit2]).toEqual([2, 3]);
    const gauge = collectCrystals(collector(), drops(hit1 + hit2));
    expect(gauge.bcGained).toBe(5);
  });
});

describe("collecting crystals", () => {
  it("caps the gauge at bbCost + sbbCost and reports the gain actually applied", () => {
    const result = collectCrystals(collector({ bc: 40 }), drops(8));
    expect(result).toEqual({ bc: 45, hp: 4000, bcGained: 5, healed: 0 });
  });

  it("caps a form without SBB at bbCost", () => {
    const bbOnly = { ...form, bursts: { bb: form.bursts.bb } };
    expect(gaugeMax(bbOnly)).toBe(25);
    expect(collectCrystals(collector({ form: bbOnly, bc: 24 }), drops(3)).bc).toBe(25);
  });

  it("drains the gauge (floored at 0) when BC efficacy reduction exceeds 100%", () => {
    const result = collectCrystals(collector({ bc: 3 }), drops(2), { bcEfficacy: -3 });
    // 2 × (1 − 3) = −4 → 3 − 4 clamps to 0.
    expect(result.bc).toBe(0);
    expect(result.bcGained).toBe(-3);
  });

  it("HC heals floor(REC × (1 + eff) / divisor): REC 907 → 215 to 302 (BF Wiki HC Efficacy)", () => {
    expect(hcHeal(907, 4.2)).toBe(215);
    expect(hcHeal(907, 3.0)).toBe(302);
    // +25% HC efficacy: 907 × 1.25 / 3.0 = 377.9 → 377.
    expect(hcHeal(907, 3.0, 0.25)).toBe(377);
  });

  it("sums each HC's heal and caps at max HP", () => {
    const result = collectCrystals(collector({ hp: 3700 }), drops(0, [4.2, 3.0]));
    // 215 + 302 = 517, capped at 4000 − 3700 = 300.
    expect(result).toEqual({ bc: 0, hp: 4000, bcGained: 0, healed: 300 });
  });

  it("gives a defeated collector nothing", () => {
    const result = collectCrystals(collector({ hp: 0 }), drops(5, [3.0]));
    expect(result).toEqual({ bc: 0, hp: 0, bcGained: 0, healed: 0 });
  });
});

describe("rolling a hit's drops", () => {
  it("draws one 0–100 integer per check, then the HC roll, then a divisor if an HC spawned", () => {
    const rng = createRng(99);
    // Rates 100 make every check and the HC spawn, so the expected draws are fully determined.
    const result = rollHitDrops(rng, { checks: 3, bcRate: 100, hcRate: 100 });
    let expected = rng;
    for (let i = 0; i < 4; i++) {
      expected = nextInt(expected, 0, 100).rng;
    }
    const divisor = nextFloat(expected);
    expect(result.value.bc).toBe(3);
    expect(result.value.hc).toBe(1);
    expect(result.value.hcDivisors).toEqual([3.0 + 1.2 * divisor.value]);
    expect(result.rng).toEqual(divisor.rng);
  });

  it("still draws every check at rate 0 and spawns nothing", () => {
    const rng = createRng(5);
    const result = rollHitDrops(rng, { checks: 2, bcRate: 0, hcRate: 0 });
    let expected = rng;
    for (let i = 0; i < 3; i++) {
      expected = nextInt(expected, 0, 100).rng;
    }
    expect(result.value).toEqual({ bc: 0, hc: 0, hcDivisors: [] });
    expect(result.rng).toEqual(expected);
  });

  it("is deterministic under a fixed seed", () => {
    const run = () => {
      let rng = createRng(2024);
      const out: HitDrops[] = [];
      for (let i = 0; i < 50; i++) {
        const draw = rollHitDrops(rng, { checks: 4, bcRate: 35, hcRate: 10 });
        rng = draw.rng;
        out.push(draw.value);
      }
      return out;
    };
    const a = run();
    expect(run()).toEqual(a);
    // 200 checks at 35% and 50 HC rolls at 10% yield some crystals of both kinds.
    expect(a.reduce((n, d) => n + d.bc, 0)).toBeGreaterThan(0);
    expect(a.reduce((n, d) => n + d.hc, 0)).toBeGreaterThan(0);
  });

  it("draws HC divisors in [3.0, 4.2)", () => {
    let rng = createRng(1);
    for (let i = 0; i < 100; i++) {
      const draw = rollHcDivisor(rng);
      rng = draw.rng;
      expect(draw.value).toBeGreaterThanOrEqual(3.0);
      expect(draw.value).toBeLessThan(4.2);
    }
  });
});
