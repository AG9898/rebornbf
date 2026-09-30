import { AILMENTS, type Effect, type EnhancementTree, type Sphere, UnitSchema } from "@bfr/data";
import { describe, expect, it } from "vitest";
import { applyEffect } from "../effects/index.ts";
import { passiveStatTotal, refreshPassives } from "../effects/passive.ts";
import { takeUnitDamage } from "../effects/survival.ts";
import { attackTotal } from "../formulas/attack-stat.ts";
import { rollAttack } from "../formulas/damage.ts";
import { createRng, nextInt } from "../rng.ts";
import { step } from "../step.ts";
import { makeSetup, makeUnit } from "../test/factories.ts";
import { BattleSetupError, createBattle } from "./create-battle.ts";
import { type EnhancementSelection, selectedEnhancements } from "./enhancements.ts";
import type { LeveledMember } from "./types.ts";

const stat = (
  name: "hp" | "atk" | "def" | "rec",
  value: number,
  target: Effect["target"] = "self",
): Effect => ({
  id: "passive.stat_pct",
  stat: name,
  value,
  target,
});
const tree: EnhancementTree = [
  // Upgrade deliberately precedes its prerequisite in content order.
  {
    id: "upgrade",
    name: "Upgrade",
    cost: 20,
    requires: ["stats"],
    changes: [{ kind: "passive.replace", option: "stats", index: 1, effect: stat("atk", 0.5) }],
  },
  {
    id: "stats",
    name: "Stats",
    cost: 20,
    changes: [{ kind: "passive", effects: [stat("hp", 0.4), stat("atk", 0.4)] }],
  },
  {
    id: "conditional",
    name: "Conditional",
    cost: 10,
    changes: [
      {
        kind: "passive",
        effects: [
          { id: "cond.hp_above", value: 0.5, target: "self", effects: [stat("atk", 0.25)] },
        ],
      },
    ],
  },
];
const selection: EnhancementSelection = {
  optionIds: ["upgrade", "conditional", "stats"],
  budget: 50,
  unlocked: true,
};

function member(enhancements: EnhancementTree = tree): LeveledMember {
  const unit = makeUnit("sp");
  const base = unit.forms[0];
  if (!base) throw new Error("missing form");
  const burst = base.bursts.bb;
  return {
    unit: UnitSchema.parse({
      ...unit,
      forms: [
        {
          ...base,
          rarity: "omni",
          maxLevel: 150,
          stats: {
            base: { hp: 1000, atk: 1000, def: 1000, rec: 1000 },
            max: { hp: 1000, atk: 1000, def: 1000, rec: 1000 },
          },
          leaderSkill: {
            name: "Leader",
            effects: [stat("hp", 0.1, "party"), stat("atk", 0.1, "party")],
          },
          extraSkill: { name: "Extra", effects: [stat("hp", 0.2), stat("atk", 0.2)] },
          bursts: { bb: burst, sbb: burst, ubb: burst },
          enhancements,
        },
      ],
    }),
    formId: base.id,
    level: 150,
    selectedEnhancements: selection,
  };
}
const sphere: Sphere = {
  id: "sp-sphere",
  name: "Test sphere",
  kind: "all-stat",
  effects: [stat("hp", 0.3), stat("atk", 0.3)],
};
const battle = (input: LeveledMember) => createBattle({ ...makeSetup(1), squad: [input] }, 7);

describe("selected SP passives", () => {
  it("freezes final-total afflicted damage and capped ordered counter chances on the owner", () => {
    const input = member([
      {
        id: "base",
        name: "Base",
        cost: 10,
        changes: [
          {
            kind: "passive",
            effects: [
              { id: "passive.afflicted_damage", value: 0.6 },
              { id: "passive.ailment_counter", ailment: "injury", chance: 12 },
              { id: "passive.ailment_counter", ailment: "poison", chance: 70 },
            ],
          },
        ],
      },
      {
        id: "upgrade",
        name: "Upgrade",
        cost: 10,
        requires: ["base"],
        changes: [
          {
            kind: "passive.replace",
            option: "base",
            index: 0,
            effect: { id: "passive.afflicted_damage", value: 0.8 },
          },
          {
            kind: "passive",
            effects: [{ id: "passive.ailment_counter", ailment: "poison", chance: 50 }],
          },
        ],
      },
    ]);
    const state = createBattle(
      {
        ...makeSetup(1),
        squad: [
          { ...input, selectedEnhancements: { ...selection, optionIds: ["upgrade", "base"] } },
          { ...input, selectedEnhancements: undefined },
        ],
      },
      7,
    );
    expect(state.party[0]?.enhancementAfflictedDamage).toBe(0.8); // Not .6 + .8.
    expect(state.party[0]?.enhancementAilmentCounters).toEqual([
      { ailment: "poison", chance: 100 },
      { ailment: "injury", chance: 12 },
    ]);
    expect(state.party[1]?.enhancementAfflictedDamage).toBeUndefined();
    expect(state.party[1]?.enhancementAilmentCounters).toBeUndefined();
    expect(refreshPassives(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it("adds afflicted damage to capped ATK per target before damage is scheduled", () => {
    const start = battle({
      ...member([
        {
          id: "bonus",
          name: "Bonus",
          cost: 10,
          changes: [{ kind: "passive", effects: [{ id: "passive.afflicted_damage", value: 0.8 }] }],
        },
      ]),
      selectedEnhancements: { ...selection, optionIds: ["bonus"] },
    });
    const unit = start.party[0];
    const enemy = start.enemies[0];
    if (!unit || !enemy) throw new Error("missing combatants");
    const rolls = rollAttack(start.rng, 0).value;
    if (rolls.critical) throw new Error("unexpected crit");
    // 1000 ATK + .1 leader + .2 ES + .5 BB buff + .8 afflicted = 2600, not
    // 1800 × 1.8. Fire vs Earth; enemy DEF 500. Bonus is included before the cap.
    const buffed = {
      ...start,
      party: [
        {
          ...unit,
          effects: applyEffect(
            unit.effects,
            { id: "buff.atk", value: 0.5, target: "self", turns: 3 },
            "bb",
          ),
        },
      ],
    };
    const core = (s: typeof start) =>
      step(s, [{ type: "attack", tick: 0, actor: "p0" }], { untilTick: 0 }).state.timeline[0]?.core;
    const expected = (atk: number, def = 500) =>
      ((atk - def / 3) * rolls.variance + atk / rolls.divisor) * 1.5;
    const buffedUnit = buffed.party[0];
    if (!buffedUnit) throw new Error("missing buffed unit");
    expect(core(buffed)).toBeCloseTo(expected(1800));
    for (const ailment of AILMENTS) {
      const afflicted = {
        ...buffed,
        enemies: [
          {
            ...enemy,
            effects: applyEffect(
              enemy.effects,
              { id: `ailment.inflict.${ailment}`, value: 100, target: "enemy", turns: 3 },
              "bb",
            ),
          },
        ],
      };
      const def = ailment === "weak" ? 250 : 500;
      expect(core(afflicted)).toBeCloseTo(expected(2600, def));
      expect(
        core({
          ...afflicted,
          party: [{ ...buffedUnit, stats: { ...unit.stats, atk: 100000 } }],
        }),
      ).toBeCloseTo(expected(99999, def));
    }
    const debuffed = {
      ...buffed,
      enemies: [
        {
          ...enemy,
          effects: applyEffect(
            [],
            {
              id: "debuff.atk_down",
              value: 0.5,
              target: "enemy",
              turns: 3,
            },
            "bb",
          ),
        },
      ],
    };
    expect(core(debuffed)).toBeCloseTo(expected(1800));
    const added = {
      ...buffed,
      party: [
        {
          ...buffedUnit,
          effects: applyEffect(
            unit.effects,
            {
              id: "buff.add_ailment",
              ailment: "poison",
              value: 100,
              target: "self",
              turns: 3,
            },
            "bb",
          ),
        },
      ],
    };
    const scheduled = step(added, [{ type: "attack", tick: 0, actor: "p0" }], { untilTick: 0 });
    const firstCore = scheduled.state.timeline[0]?.core;
    const first = step(scheduled.state, [], { untilTick: 20 });
    expect(first.state.enemies[0]?.effects.some((e) => e.id === "ailment.inflict.poison")).toBe(
      true,
    );
    expect(first.state.timeline[0]?.core).toBe(firstCore); // Later hit keeps un-afflicted snapshot.
    const bb = {
      ...unit.form.bursts.bb,
      attacks: [unit.form.normalAttack],
      effects: [
        { id: "attack.st" as const, value: 0, target: "enemy" as const },
        { id: "ailment.inflict.poison" as const, value: 100, target: "enemy" as const },
      ],
    };
    const bursting = {
      ...start,
      party: [
        { ...unit, bc: bb.cost, form: { ...unit.form, bursts: { ...unit.form.bursts, bb } } },
      ],
    };
    const burstResult = step(bursting, [{ type: "burst", tier: "bb", actor: "p0", tick: 0 }], {
      untilTick: 0,
    });
    // Burst-start poison consumes a draw before damage and qualifies immediately.
    const burstRolls = rollAttack(nextInt(start.rng, 0, 99).rng, 0).value;
    if (burstRolls.critical) throw new Error("unexpected crit");
    expect(burstResult.state.timeline[0]?.core).toBeCloseTo(
      ((2100 - 500 / 3) * burstRolls.variance + 2100 / burstRolls.divisor) * 1.5,
    );
  });
  it("adds leader, ally leader, Extra Skill, sphere and final-total SP bonuses once", () => {
    const input = { ...member(), spheres: [sphere] };
    const original = structuredClone(input);
    const state = createBattle(
      {
        ...makeSetup(1),
        squad: [input],
        ally: { ...member(), selectedEnhancements: undefined, kind: "duplicate" },
      },
      7,
    );
    const unit = state.party[0];
    if (!unit) throw new Error("missing unit");
    // HP: 1000 × (1 + .1 leader + .1 ally + .2 ES + .3 sphere + .4 SP) = 2100.
    // ATK: same sources with .5 final SP (not .4 + .5), plus .25 HP condition = 2450.
    expect(unit.stats.hp).toBe(2100);
    expect(unit.hp).toBe(2100);
    expect(
      attackTotal({ atk: unit.stats.atk, statMods: passiveStatTotal(unit.effects, "atk") }),
    ).toBe(2450);
    expect(unit.effects.filter((effect) => effect.source === "sp")).toHaveLength(3);
    const refreshed = refreshPassives(refreshPassives(state));
    expect(refreshed).toEqual(state);
    expect(input).toEqual(original);
    expect(state.party[1]?.effects.some((effect) => effect.source === "sp")).toBe(false);
    expect(
      createBattle(
        {
          ...makeSetup(1),
          squad: [input],
          ally: { ...member(), selectedEnhancements: undefined, kind: "duplicate" },
        },
        7,
      ),
    ).toEqual(state);
  });

  it("re-evaluates SP conditions without compounding HP or retaining old SP effects", () => {
    const state = battle(member());
    const unit = state.party[0];
    if (!unit) throw new Error("missing unit");
    const low = refreshPassives({ ...state, party: [{ ...unit, hp: unit.stats.hp / 2 }] });
    expect(passiveStatTotal(unit.effects, "atk")).toBeCloseTo(1.05);
    expect(passiveStatTotal(low.party[0]?.effects ?? [], "atk")).toBeCloseTo(0.8);
    expect(low.party[0]?.stats.hp).toBe(1700);
    expect(low.party[0]?.hp).toBe(850);
    expect(refreshPassives(low)).toEqual(low);
  });

  it("preserves existing behavior when selections are absent or empty", () => {
    const absent = battle({ ...member(), selectedEnhancements: undefined });
    expect(battle({ ...member(), selectedEnhancements: { ...selection, optionIds: [] } })).toEqual(
      absent,
    );
    expect(absent.party[0]?.stats.hp).toBe(1300);
    expect(absent.party[0]?.enhancementPassives).toBeUndefined();
  });

  it("resolves the same effects regardless of selection order, including on an ally", () => {
    const input = member();
    const reordered = {
      ...input,
      selectedEnhancements: { ...selection, optionIds: [...selection.optionIds].reverse() },
    };
    expect(battle(reordered)).toEqual(battle(input));
    const state = createBattle(
      {
        ...makeSetup(1),
        squad: [{ ...input, selectedEnhancements: undefined }],
        ally: { ...reordered, kind: "duplicate" },
      },
      7,
    );
    expect(state.party[1]?.effects.filter((effect) => effect.source === "sp")).toHaveLength(3);
    expect(state.party[0]?.effects.some((effect) => effect.source === "sp")).toBe(false);
  });

  it("charges for burst-only options without adding passive grants", () => {
    const input = member([
      {
        id: "burst",
        name: "Burst",
        cost: 20,
        changes: [
          {
            kind: "burst.add",
            tier: "bb",
            effects: [{ id: "buff.crit_dmg", value: 0.5, turns: 3, target: "party" }],
          },
        ],
      },
    ]);
    const chosen = {
      ...input,
      selectedEnhancements: { ...selection, optionIds: ["burst"], budget: 20 },
    };
    const state = battle(chosen);
    expect(state.party[0]?.enhancementPassives).toBeUndefined();
    expect(state.party[0]?.form.bursts.bb.effects.at(-1)).toEqual({
      id: "buff.crit_dmg",
      value: 0.5,
      turns: 3,
      target: "party",
    });
    expect(() =>
      battle({ ...chosen, selectedEnhancements: { ...chosen.selectedEnhancements, budget: 19 } }),
    ).toThrow(/exceed SP budget/);
  });

  it.each([
    { ...selection, optionIds: ["missing"] },
    { ...selection, optionIds: ["stats", "stats"] },
    { ...selection, optionIds: ["upgrade"] },
    { ...selection, budget: 49 },
    { ...selection, budget: 101 },
    { ...selection, budget: 9 },
    { ...selection, budget: 50.5 },
    { ...selection, unlocked: false },
  ])("rejects invalid selection %j", (selectedEnhancements) => {
    expect(() => battle({ ...member(), selectedEnhancements })).toThrow(BattleSetupError);
    expect(() => battle({ ...member(), selectedEnhancements })).toThrow(
      /squad\[0\].selectedEnhancements/,
    );
  });

  it.each([149, 1])("rejects SP at level %s", (level) => {
    expect(() => battle({ ...member(), level })).toThrow(/level-150 Omni/);
  });
  it.each([{ bb: 9 }, { sbb: 9 }])("requires max burst levels %j", (burstLevels) => {
    expect(() => battle({ ...member(), burstLevels })).toThrow(/BB\/SBB 10/);
  });
  it("rejects explicit stats, non-Omni forms, missing trees and missing UBB", () => {
    const input = member();
    expect(() =>
      createBattle(
        {
          ...makeSetup(1),
          squad: [
            {
              ...input,
              level: undefined,
              unitType: undefined,
              stats: { hp: 1000, atk: 1000, def: 1000, rec: 1000 },
            },
          ],
        },
        7,
      ),
    ).toThrow(/level-150 Omni/);
    const form = input.unit.forms[0];
    if (!form) throw new Error("missing form");
    expect(() => selectedEnhancements({ ...form, rarity: 7 }, 150, undefined, selection)).toThrow(
      /Omni/,
    );
    expect(() =>
      selectedEnhancements({ ...form, enhancements: undefined }, 150, undefined, selection),
    ).toThrow(/unknown option/);
    expect(() =>
      selectedEnhancements(
        { ...form, bursts: { bb: form.bursts.bb, sbb: form.bursts.sbb } },
        150,
        undefined,
        selection,
      ),
    ).toThrow(/UBB/);
  });

  it("caps selected SP ATK at 130,000 without changing HP/DEF/REC or another unit", () => {
    const input = member([
      {
        id: "cap",
        name: "Cap",
        cost: 10,
        changes: [{ kind: "passive", effects: [{ id: "passive.atk_cap", value: 130000 }] }],
      },
      {
        id: "high-stats",
        name: "High stats",
        cost: 10,
        changes: [
          {
            kind: "passive",
            effects: [stat("hp", 200), stat("atk", 200), stat("def", 200), stat("rec", 200)],
          },
        ],
      },
    ]);
    const chosen = {
      ...input,
      selectedEnhancements: { ...selection, optionIds: ["cap", "high-stats"] },
    };
    const state = createBattle(
      { ...makeSetup(1), squad: [chosen, { ...input, selectedEnhancements: undefined }] },
      7,
    );
    const unit = state.party[0];
    if (!unit) throw new Error("missing unit");
    expect(unit.enhancementAtkCap).toBe(130000);
    expect(state.party[1]?.enhancementAtkCap).toBeUndefined();
    expect(unit.stats.hp).toBe(99999);
    for (const name of ["def", "rec"] as const) {
      expect(
        attackTotal({ atk: unit.stats[name], statMods: passiveStatTotal(unit.effects, name) }),
      ).toBe(99999);
    }
    // Raw ATK = 1000 × (1 + .1 leader + .2 ES + 200 SP) = 201,300.
    // Fire vs Earth ×1.5, target DEF 500: ((cap − 500/3) × variance + cap/divisor) ×1.5.
    const rolls = rollAttack(state.rng, 0).value;
    if (rolls.critical) throw new Error("unexpected critical hit at zero crit rate");
    const core = (cap: number) => ((cap - 500 / 3) * rolls.variance + cap / rolls.divisor) * 1.5;
    const attack = (s: typeof state) =>
      step(s, [{ type: "attack", tick: 0, actor: "p0", target: "e0" }], { untilTick: 0 }).state
        .timeline[0]?.core;
    expect(attack(state)).toBeCloseTo(core(130000));
    expect(attack(refreshPassives(refreshPassives(state)))).toBeCloseTo(core(130000));
    const burster = {
      ...unit,
      bc: unit.form.bursts.bb.cost,
      form: {
        ...unit.form,
        bursts: {
          ...unit.form.bursts,
          bb: {
            ...unit.form.bursts.bb,
            attacks: [unit.form.normalAttack],
            effects: [{ id: "attack.st" as const, value: 3, target: "enemy" as const }],
          },
        },
      },
    };
    // Adding the 300% BB modifier still caps at 130,000, using the same seeded draws.
    const burst = step(
      { ...state, party: [burster] },
      [{ type: "burst", tier: "bb", tick: 0, actor: "p0", target: "e0" }],
      { untilTick: 0 },
    );
    expect(burst.state.timeline[0]?.core).toBeCloseTo(core(130000));
    const absent = battle({
      ...chosen,
      selectedEnhancements: { ...selection, optionIds: ["high-stats"] },
    });
    expect(absent.party[0]?.enhancementAtkCap).toBeUndefined();
    expect(attack(absent)).toBeCloseTo(core(99999));
    expect(() => battle({ ...chosen, level: 149 })).toThrow(/level-150 Omni/);
    expect(() => battle({ ...chosen, burstLevels: { bb: 9 } })).toThrow(/BB\/SBB 10/);
    expect(() =>
      battle({
        ...chosen,
        selectedEnhancements: { ...chosen.selectedEnhancements, unlocked: false },
      }),
    ).toThrow(/unlocked/);
    expect(() =>
      battle({ ...chosen, selectedEnhancements: { ...chosen.selectedEnhancements, budget: 10 } }),
    ).toThrow(/exceed SP budget/);
  });

  it("does not silently activate unimplemented SP primitives", () => {
    const input = member([
      {
        id: "idol",
        name: "Idol",
        cost: 10,
        changes: [{ kind: "passive", effects: [{ id: "passive.spark_resist", value: 0.5 }] }],
      },
    ]);
    expect(() =>
      battle({ ...input, selectedEnhancements: { ...selection, optionIds: ["idol"] } }),
    ).toThrow(/unsupported SP passive/);
  });

  it("freezes self-only SP idol state and consumes only seeded successful saves", () => {
    const input = member([
      {
        id: "idol",
        name: "Idol",
        cost: 50,
        changes: [{ kind: "passive", effects: [{ id: "passive.angel_idol_once", chance: 70 }] }],
      },
    ]);
    const selected = { ...input, selectedEnhancements: { ...selection, optionIds: ["idol"] } };
    const original = JSON.stringify(selected.unit);
    const start = battle(selected);
    const unit = start.party[0];
    if (!unit) throw new Error("missing unit");
    expect(unit.passiveAngelIdol).toEqual({ chance: 70, consumed: false, protected: false });
    const other = makeSetup(1).squad[0];
    if (!other) throw new Error("missing other unit");
    const squad = createBattle({ ...makeSetup(2), squad: [selected, other] }, 7);
    expect(squad.party[1]?.passiveAngelIdol).toBeUndefined();
    expect(unit.effects.some((e) => e.id === "angel_idol")).toBe(false);
    let procs = 0;
    let misses = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const rng = createRng(seed);
      const draw = nextInt(rng, 0, 99);
      const nonlethal = takeUnitDamage(unit, unit.effects, 1, rng);
      expect(nonlethal).toMatchObject({ hp: unit.hp - 1, rng, survived: false });
      expect(nonlethal.passiveAngelIdol?.consumed).toBe(false);
      const result = takeUnitDamage(unit, unit.effects, 999999, rng);
      expect(result.rng).toEqual(draw.rng);
      expect(result.survived).toBe(draw.value < 70);
      expect(result.passiveAngelIdol?.consumed).toBe(result.survived);
      if (result.survived) {
        procs++;
        expect(result.hp).toBe(1);
        const saved = { ...unit, hp: result.hp, passiveAngelIdol: result.passiveAngelIdol };
        const refreshed = refreshPassives({ ...start, party: [saved] });
        const protectedUnit = refreshed.party[0];
        if (!protectedUnit) throw new Error("missing saved unit");
        const again = takeUnitDamage(protectedUnit, protectedUnit.effects, 999999, result.rng);
        expect(
          takeUnitDamage(
            JSON.parse(JSON.stringify(protectedUnit)),
            protectedUnit.effects,
            999999,
            result.rng,
          ),
        ).toEqual(again);
        expect(again).toMatchObject({ hp: 1, survived: false, rng: result.rng });
        expect(again.passiveAngelIdol).toEqual(result.passiveAngelIdol);
      } else {
        misses++;
        expect(result.hp).toBe(0);
        const burst = {
          id: "angel_idol",
          value: 0.5,
          turns: 3,
          target: "self",
          source: "bb",
        } as const;
        const fallback = takeUnitDamage(unit, [...unit.effects, burst], 999999, rng);
        expect(fallback).toMatchObject({
          hp: Math.floor(unit.stats.hp * 0.5),
          survived: true,
          rng: draw.rng,
        });
        expect(fallback.passiveAngelIdol).toEqual({
          chance: 70,
          consumed: false,
          protected: false,
        });
        expect(fallback.effects).toEqual(unit.effects);
        // A revive cannot turn a failed roll into a consumed allowance.
        const revived = { ...unit, passiveAngelIdol: result.passiveAngelIdol };
        expect(takeUnitDamage(revived, revived.effects, 999999, rng)).toEqual(result);
      }
    }
    expect(procs).toBeGreaterThan(0);
    expect(misses).toBeGreaterThan(0);
    expect(JSON.stringify(selected.unit)).toBe(original);
    expect(
      battle({ ...input, selectedEnhancements: undefined }).party[0]?.passiveAngelIdol,
    ).toBeUndefined();
  });

  it("uses prerequisite replacement caps and rejects independent override conflicts", () => {
    const capTree: EnhancementTree = [
      {
        id: "cap",
        name: "Cap",
        cost: 10,
        changes: [{ kind: "passive", effects: [{ id: "passive.atk_cap", value: 120000 }] }],
      },
      {
        id: "upgrade",
        name: "Upgrade",
        cost: 10,
        requires: ["cap"],
        changes: [
          {
            kind: "passive.replace",
            option: "cap",
            index: 0,
            effect: { id: "passive.atk_cap", value: 130000 },
          },
        ],
      },
    ];
    const input = {
      ...member(capTree),
      selectedEnhancements: { ...selection, optionIds: ["upgrade", "cap"] },
    };
    expect(battle(input).party[0]?.enhancementAtkCap).toBe(130000);
    const first = capTree[0];
    if (!first) throw new Error("missing cap option");
    const independent: EnhancementTree = [
      first,
      {
        id: "other",
        name: "Other",
        cost: 10,
        changes: [{ kind: "passive", effects: [{ id: "passive.atk_cap", value: 130000 }] }],
      },
    ];
    expect(() =>
      battle({
        ...member(independent),
        selectedEnhancements: { ...selection, optionIds: ["cap", "other"] },
      }),
    ).toThrow(/conflicting SP ATK-cap/);
  });
});
