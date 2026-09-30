import { describe, expect, it } from "vitest";
import { EnhancementPassiveSchema, EnhancementTreeSchema } from "./enhancement.ts";
import { FormSchema } from "./unit.ts";

const spark = { id: "buff.spark_dmg", value: 0.8, turns: 3, target: "party" };
const stat = { id: "passive.stat_pct", stat: "atk", value: 0.2, target: "self" };
const burst = { name: "Test burst", cost: 20, attacks: [], effects: [spark] };
const form = {
  id: "test-omni",
  name: "Test",
  rarity: "omni",
  maxLevel: 150,
  stats: { base: { hp: 1, atk: 1, def: 1, rec: 1 }, max: { hp: 2, atk: 2, def: 2, rec: 2 } },
  normalAttack: {
    moveType: "melee",
    startDelayFrames: 0,
    hitFrames: [0],
    damageDistribution: [100],
    dropChecks: 1,
  },
  bursts: { bb: burst, sbb: burst, ubb: burst },
  sphereSlots: 1,
};
const base = {
  id: "power",
  name: "Power",
  cost: 10,
  changes: [{ kind: "passive", effects: [stat] }],
};
const add = {
  id: "add",
  name: "Add",
  cost: 50,
  changes: [{ kind: "burst.add", tier: "bb", effects: [spark] }],
};

describe("SP enhancement content contract", () => {
  it("keeps enhancements optional and Omni-only", () => {
    expect(FormSchema.safeParse(form).success).toBe(true);
    expect(FormSchema.safeParse({ ...form, rarity: 7 }).success).toBe(true);
    expect(FormSchema.safeParse({ ...form, enhancements: [base] }).success).toBe(true);
    expect(FormSchema.safeParse({ ...form, rarity: 7, enhancements: [base] }).success).toBe(false);
  });

  it("represents passive upgrades, burst additions, final-value replacements and duration upgrades", () => {
    const tree = [
      base,
      add,
      {
        id: "upgrade",
        name: "Upgrade",
        cost: 20,
        requires: ["power", "add"],
        changes: [
          { kind: "passive.replace", option: "power", index: 0, effect: { ...stat, value: 0.5 } },
          {
            kind: "burst.replace",
            ref: { tier: "sbb", index: 0 },
            effect: { ...spark, value: 1.2 },
          },
          {
            kind: "burst.replace",
            ref: { tier: "bb", addedBy: "add", index: 0 },
            effect: { ...spark, value: 1 },
          },
          {
            kind: "burst.duration",
            refs: [
              { tier: "ubb", index: 0 },
              { tier: "bb", addedBy: "add", index: 0 },
            ],
            turns: 4,
          },
        ],
      },
    ];
    expect(FormSchema.safeParse({ ...form, enhancements: tree }).success).toBe(true);
  });

  it.each([0, -1, 0.5, 101])("rejects invalid cost %s", (cost) => {
    expect(EnhancementTreeSchema.safeParse([{ ...base, cost }]).success).toBe(false);
  });

  it.each([
    [base, base],
    [{ ...base, requires: ["missing"] }],
    [{ ...base, requires: ["power"] }],
    [
      { ...base, requires: ["other"] },
      { ...base, id: "other", requires: ["power"] },
    ],
    [base, { ...base, id: "other", requires: ["power", "power"] }],
  ])("rejects duplicate IDs and missing/cyclic/duplicate prerequisites %#", (...tree) => {
    expect(EnhancementTreeSchema.safeParse(tree).success).toBe(false);
  });

  it("accepts transitive prerequisite references regardless of option order", () => {
    expect(
      FormSchema.safeParse({
        ...form,
        enhancements: [
          {
            id: "last",
            name: "Last",
            cost: 10,
            requires: ["middle"],
            changes: [
              {
                kind: "burst.duration",
                refs: [{ tier: "bb", addedBy: "add", index: 0 }],
                turns: 4,
              },
            ],
          },
          { ...base, id: "middle", requires: ["add"] },
          add,
        ],
      }).success,
    ).toBe(true);
  });

  it.each([
    { kind: "burst.replace", ref: { tier: "bb", index: 2 }, effect: spark },
    { kind: "burst.replace", ref: { tier: "bb", index: 0 }, effect: { ...spark, id: "buff.atk" } },
    { kind: "burst.replace", ref: { tier: "bb", index: 0 }, effect: { ...spark, target: "self" } },
    { kind: "burst.duration", refs: [{ tier: "bb", addedBy: "missing", index: 0 }], turns: 4 },
    { kind: "burst.duration", refs: [{ tier: "bb", addedBy: "add", index: 0 }], turns: 4 },
    { kind: "passive.replace", option: "power", index: 3, effect: stat },
    {
      kind: "passive.replace",
      option: "power",
      index: 0,
      effect: { id: "passive.atk_cap", value: 130000 },
    },
    { kind: "sphere-slot", value: 2 },
    { kind: "burst.add", tier: "bb", effects: [{ id: "attack.aoe", value: 3, target: "enemies" }] },
  ])("rejects invalid references and unsupported changes %#", (change) => {
    expect(
      FormSchema.safeParse({
        ...form,
        enhancements: [
          base,
          add,
          {
            id: "bad",
            name: "Bad",
            cost: 10,
            requires: ["power"],
            changes: [change],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects absent burst tiers and duration upgrades on instant effects", () => {
    const changes = [{ kind: "burst.add", tier: "ubb", effects: [spark] }];
    expect(
      FormSchema.safeParse({ ...form, bursts: { bb: burst }, enhancements: [{ ...base, changes }] })
        .success,
    ).toBe(false);
    expect(
      FormSchema.safeParse({
        ...form,
        bursts: { bb: { ...burst, effects: [{ id: "ailment.cure", value: 1, target: "party" }] } },
        enhancements: [
          {
            ...base,
            changes: [{ kind: "burst.duration", refs: [{ tier: "bb", index: 0 }], turns: 4 }],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("represents all launch passive shapes, including later shared mechanics", () => {
    // ROSTER → B0/B1 SP trees; these are contract fixtures, not launch transcription.
    const effects = [
      stat,
      { id: "cond.hp_above", value: 50, target: "self", effects: [stat] },
      { id: "cond.bb_above", value: 50, target: "self", effects: [stat] },
      { id: "bb.fill_on_hit", value: 0, min: 2, max: 3, target: "self" },
      { id: "damage_to_heal", value: 0.1, chance: 25, target: "self" },
      { id: "damage_reflect", value: 0.1, chance: 20, target: "self" },
      { id: "passive.atk_cap", value: 130000 },
      { id: "passive.angel_idol_once", chance: 70 },
      { id: "passive.afflicted_damage", value: 0.6 },
      { id: "passive.spark_resist", value: 0.5 },
      { id: "passive.element_resist", element: "light", value: 0.05 },
      { id: "passive.ailment_counter", ailment: "curse", chance: 5 },
      { id: "passive.normal_aoe", chance: 20, damageMultiplier: 0.5 },
      { id: "passive.turn_start" },
      { id: "passive.bc_efficacy_down", value: 0.5, chance: 30, turns: 2 },
    ];
    for (const effect of effects)
      expect(EnhancementPassiveSchema.safeParse(effect).success).toBe(true);
  });

  it("allows typed replacements of ranged heals and BC fills", () => {
    for (const effect of [
      {
        id: "heal.over_time",
        value: 0,
        min: 2000,
        max: 3000,
        recBonus: 0.11,
        turns: 3,
        target: "party",
      },
      { id: "bb.fill_on_hit", value: 0, min: 4, max: 7, turns: 3, target: "party" },
    ]) {
      expect(
        FormSchema.safeParse({
          ...form,
          bursts: { bb: { ...burst, effects: [effect] } },
          enhancements: [
            {
              ...base,
              changes: [{ kind: "burst.replace", ref: { tier: "bb", index: 0 }, effect }],
            },
          ],
        }).success,
      ).toBe(true);
      expect(
        FormSchema.safeParse({
          ...form,
          bursts: { bb: { ...burst, effects: [effect] } },
          enhancements: [
            {
              ...base,
              changes: [
                {
                  kind: "burst.replace",
                  ref: { tier: "bb", index: 0 },
                  effect: { ...effect, min: effect.max + 1 },
                },
              ],
            },
          ],
        }).success,
      ).toBe(false);
    }
  });
});
