import { readFileSync } from "node:fs";
import { type Burst, type Form, type Unit, UnitSchema } from "@bfr/data";
import { describe, expect, it } from "vitest";
import { burstThreshold } from "../gauge/index.ts";
import { step } from "../step.ts";
import { makeEnemy, makeMember } from "../test/factories.ts";
import { burstAtLevel, burstCostAtLevel, formAtBurstLevels } from "./burst-levels.ts";
import { BattleSetupError, createBattle } from "./create-battle.ts";

// Burst level scaling (M1-08B; GAME_DESIGN §6 → Burst levels, RESOLVED-58). Reference values are
// the section's table: gauge cost and first attack's modifier at levels 1 / 5 / 10, Omni forms.

function loadUnit(id: string): Unit {
  const path = new URL(`../../../data/content/units/${id}.json`, import.meta.url);
  return UnitSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

function omniForm(unit: Unit): Form {
  const form = unit.forms.find((f) => f.rarity === "omni");
  if (!form) throw new Error(`${unit.id} has no Omni form`);
  return form;
}

type Triple = readonly [number, number, number];
const LEVELS = [1, 5, 10] as const;
const STANDARD = { bbCost: [32, 29, 25], bbMod: [2.333, 2.852, 3.5] } as const;
const STANDARD_SBB = { sbbCost: [25, 23, 20], sbbMod: [3.733, 4.563, 5.6] } as const;
const DANCER = { bbCost: [33, 30, 26], bbMod: [2.4, 2.933, 3.6] } as const;
const DANCER_SBB = { sbbCost: [38, 35, 30], sbbMod: [1.333, 1.63, 2] } as const;

const REFERENCE: readonly {
  unit: string;
  bb: string;
  sbb: string;
  bbCost: Triple;
  bbMod: Triple;
  sbbCost: Triple;
  sbbMod: Triple;
}[] = [
  { unit: "brand", bb: "Sunforge Break", sbb: "Crownfire Advance", ...STANDARD, ...STANDARD_SBB },
  { unit: "maren", bb: "Wintertide Blessing", sbb: "Sovereign Thaw", ...STANDARD, ...STANDARD_SBB },
  { unit: "rook", bb: "Tempest Twinstrike", sbb: "Sovereign Squall", ...STANDARD, ...STANDARD_SBB },
  {
    unit: "garrick",
    bb: "Heartstone Sweep",
    sbb: "Sovereign Rampart",
    ...STANDARD,
    ...STANDARD_SBB,
  },
  { unit: "solen", bb: "Solstice Rite", sbb: "Solstice Canticle", ...STANDARD, ...STANDARD_SBB },
  { unit: "morrick", bb: "Nightshore Wake", sbb: "Nightshore Toll", ...STANDARD, ...STANDARD_SBB },
  { unit: "aurelle", bb: "Aurora Procession", sbb: "Aurora Crown Waltz", ...DANCER, ...DANCER_SBB },
  { unit: "vespera", bb: "Eventide Thornveil", sbb: "Vesper Thornfall", ...DANCER, ...DANCER_SBB },
];

function firstModifier(burst: Burst): number | undefined {
  return burst.effects.find((effect) => effect.id.startsWith("attack."))?.value;
}

describe("burst level reference values (RESOLVED-58)", () => {
  for (const ref of REFERENCE) {
    const form = omniForm(loadUnit(ref.unit));
    it(`${ref.unit}: BB ${ref.bb} and SBB ${ref.sbb} at levels 1 / 5 / 10`, () => {
      const { bb, sbb } = form.bursts;
      if (!sbb) throw new Error("missing SBB");
      expect([bb.name, sbb.name]).toEqual([ref.bb, ref.sbb]);
      expect(LEVELS.map((l) => burstAtLevel(bb, l).cost)).toEqual(ref.bbCost);
      expect(LEVELS.map((l) => firstModifier(burstAtLevel(bb, l)))).toEqual(ref.bbMod);
      expect(LEVELS.map((l) => burstAtLevel(sbb, l).cost)).toEqual(ref.sbbCost);
      expect(LEVELS.map((l) => firstModifier(burstAtLevel(sbb, l)))).toEqual(ref.sbbMod);
    });
  }

  it("Brand SBB Crownfire Advance worked example at level 1", () => {
    const sbb = omniForm(loadUnit("brand")).bursts.sbb;
    if (!sbb) throw new Error("missing SBB");
    const level1 = burstAtLevel(sbb, 1);
    expect(level1.cost).toBe(25);
    expect(level1.effects).toEqual([
      { id: "attack.aoe", value: 3.733, target: "enemies", flatAtk: 133 },
      { id: "buff.atk", value: 1, turns: 3, target: "party" },
      { id: "buff.bb_atk", value: 2, turns: 3, target: "party" },
      { id: "debuff.atk_down", value: 0.333, turns: 1, target: "enemies", chance: 20 },
      { id: "buff.elem_weak_dmg", value: 0.5, turns: 3, target: "party", element: "fire" },
    ]);
    expect(level1.attacks).toBe(sbb.attacks);
  });

  it("every launch BB and SBB resolves at every level 1–10 with monotone costs", () => {
    for (const ref of REFERENCE) {
      const { bb, sbb } = omniForm(loadUnit(ref.unit)).bursts;
      for (const burst of [bb, sbb]) {
        if (!burst) continue;
        const costs = Array.from({ length: 10 }, (_, i) => burstAtLevel(burst, i + 1).cost);
        expect(costs[9]).toBe(burst.cost);
        for (let i = 1; i < 10; i++) expect(costs[i]).toBeLessThanOrEqual(costs[i - 1] ?? 0);
      }
    }
  });
});

describe("burstAtLevel field rules", () => {
  const base: Burst = { name: "Test", cost: 20, attacks: [], effects: [] };

  it("costs ceil(cost₁₀ × (1 + 0.25 × (10 − L) / 9))", () => {
    expect([1, 2, 5, 9, 10].map((l) => burstCostAtLevel(20, l))).toEqual([25, 25, 23, 21, 20]);
    expect(() => burstCostAtLevel(20, 0)).toThrow(RangeError);
    expect(() => burstCostAtLevel(20, 11)).toThrow(RangeError);
  });

  it("rounds amounts and chances to integers and other numbers to 3 decimals", () => {
    const burst = burstAtLevel(
      {
        ...base,
        effects: [
          { id: "ailment.inflict.curse", value: 35, target: "enemies" },
          { id: "drop.bc", value: 35, turns: 3, target: "party" },
          { id: "barrier", value: 2000, element: "earth", target: "party" },
          { id: "buff.add_ailment", value: 20, turns: 3, target: "party", ailment: "weak" },
          {
            id: "heal.over_time",
            value: 0,
            min: 1500,
            max: 1700,
            recBonus: 0.1,
            turns: 3,
            target: "party",
          },
          { id: "bb.fill_on_hit", value: 0, min: 4, max: 7, turns: 3, target: "party" },
          {
            id: "hp_drain",
            value: 0,
            min: 0.03,
            max: 0.06,
            chance: 50,
            turns: 3,
            target: "party",
          },
          { id: "bb.fill_per_turn", value: 4, turns: 3, target: "party" },
        ],
      },
      1,
    );
    expect(burst.effects).toEqual([
      { id: "ailment.inflict.curse", value: 23, target: "enemies" },
      { id: "drop.bc", value: 23, turns: 3, target: "party" },
      { id: "barrier", value: 1333, element: "earth", target: "party" },
      { id: "buff.add_ailment", value: 13, turns: 3, target: "party", ailment: "weak" },
      {
        id: "heal.over_time",
        value: 0,
        min: 1000,
        max: 1133,
        recBonus: 0.067,
        turns: 3,
        target: "party",
      },
      { id: "bb.fill_on_hit", value: 0, min: 3, max: 5, turns: 3, target: "party" },
      { id: "hp_drain", value: 0, min: 0.02, max: 0.04, chance: 33, turns: 3, target: "party" },
      { id: "bb.fill_per_turn", value: 2.667, turns: 3, target: "party" },
    ]);
  });

  it("keeps sentinels, element indexes, hit counts, turns, and zeros", () => {
    const effects: Burst["effects"] = [
      { id: "bb.fill_instant", value: 999, target: "party" },
      { id: "bb.fill_instant", value: 8, target: "party" },
      {
        id: "heal.over_time",
        value: 0,
        min: 98999,
        max: 99999,
        recBonus: 0.1,
        turns: 3,
        target: "party",
      },
      { id: "buff.add_element", value: 2, turns: 3, target: "party" },
      { id: "hits.add_normal", value: 1, damageBonus: 0.5, turns: 2, target: "self" },
      { id: "ailment.cure", value: 0, target: "party" },
    ];
    expect(burstAtLevel({ ...base, effects }, 1).effects).toEqual([
      { id: "bb.fill_instant", value: 999, target: "party" },
      { id: "bb.fill_instant", value: 5.333, target: "party" },
      {
        id: "heal.over_time",
        value: 0,
        min: 98999,
        max: 99999,
        recBonus: 0.067,
        turns: 3,
        target: "party",
      },
      { id: "buff.add_element", value: 2, turns: 3, target: "party" },
      { id: "hits.add_normal", value: 1, damageBonus: 0.333, turns: 2, target: "self" },
      { id: "ailment.cure", value: 0, target: "party" },
    ]);
  });

  it("returns level-10 bursts unchanged", () => {
    const burst: Burst = {
      ...base,
      effects: [{ id: "buff.atk", value: 1.5, turns: 3, target: "party" }],
    };
    expect(burstAtLevel(burst, 10)).toBe(burst);
  });
});

describe("burst levels in battle setup", () => {
  const brand = loadUnit("brand");
  const omni = omniForm(brand);
  const member = (burstLevels?: { bb?: number; sbb?: number }) => ({
    unit: brand,
    formId: omni.id,
    stats: { hp: 6000, atk: 2800, def: 2000, rec: 1800 },
    ...(burstLevels ? { burstLevels } : {}),
  });
  const setupWith = (m: ReturnType<typeof member>) => ({
    squad: [m, makeMember("other")],
    leaderIndex: 0,
    waves: [[makeEnemy("slime")]],
  });

  it("defaults to level 10: kit values and the UBB", () => {
    const unit = createBattle(setupWith(member()), 1).party[0];
    expect(unit?.form).toEqual(omni);
  });

  it("scales BB and SBB costs into the gauge and hides the UBB below level 10", () => {
    const unit = createBattle(setupWith(member({ bb: 1, sbb: 5 })), 1).party[0];
    if (!unit) throw new Error("missing unit");
    expect(unit.form.bursts.bb.cost).toBe(32);
    expect(unit.form.bursts.sbb?.cost).toBe(23);
    expect(unit.form.bursts.ubb).toBeUndefined();
    expect(burstThreshold(unit.form, "sbb")).toBe(55);
    expect(formAtBurstLevels(omni, { bb: 10, sbb: 9 }).bursts.ubb).toBeUndefined();
    expect(formAtBurstLevels(omni, { bb: 10, sbb: 10 }).bursts.ubb).toBe(omni.bursts.ubb);
  });

  it("a level-1 BB needs its scaled cost", () => {
    const state = createBattle(setupWith(member({ bb: 1 })), 1);
    const at = (bc: number) => ({
      ...state,
      party: state.party.map((u, i) => (i === 0 ? { ...u, bc } : u)),
    });
    const input = { type: "burst", tick: 0, actor: "p0", tier: "bb" } as const;
    const short = step(at(31), [input]).events.find((e) => e.type === "ActionRejected");
    expect(short).toMatchObject({ reason: "insufficient_gauge" });
    const enough = step(at(32), [input]).events.find((e) => e.type === "ActionRejected");
    expect(enough).toBeUndefined();
  });

  it("rejects levels outside 1–10", () => {
    expect(() => createBattle(setupWith(member({ bb: 0 })), 1)).toThrow(BattleSetupError);
    expect(() => createBattle(setupWith(member({ sbb: 11 })), 1)).toThrow(
      /squad\[0\]\.burstLevels\.sbb/,
    );
    expect(() => createBattle(setupWith(member({ bb: 2.5 })), 1)).toThrow(BattleSetupError);
  });
});
