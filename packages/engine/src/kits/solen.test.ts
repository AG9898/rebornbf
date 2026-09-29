import { readFileSync } from "node:fs";
import { UnitSchema } from "@bfr/data";
import { describe, expect, it } from "vitest";
import { addedElements } from "../effects/buffs.ts";
import type { BurstUsedEvent, HitLandedEvent } from "../events.ts";
import { attackTotal } from "../formulas/attack-stat.ts";
import { attackCore, hitDamage, rollAttack } from "../formulas/damage.ts";
import { elementMultiplier } from "../formulas/element.ts";
import { createBattle } from "../state/create-battle.ts";
import { step } from "../step.ts";
import { makeEnemy, makeSetup } from "../test/factories.ts";

// Solen's kit reference test (M2-04E, ROSTER.md → Transcription step 4): the Omni form's BB,
// worked by hand from the transcribed data and checked against the engine.

const solen = UnitSchema.parse(
  JSON.parse(
    readFileSync(new URL("../../../data/content/units/solen.json", import.meta.url), "utf8"),
  ),
);
const omni = solen.forms.find((form) => form.id === "solen-omni");
if (!omni) throw new Error("solen-omni form missing");

// Omni BB: 14-hit AoE, 350% + 100 flat ATK, then ATK/DEF/REC +150% and BB fill rate +30% to the
// party (3 turns), applied before the damage roll.
const DISTRIBUTION = [15, 8, 7, 6, 5, 4, 3, 20, 6, 6, 5, 5, 5, 5];
const STAT_MODS = 1.0 + 0.5 + 1.5; // leader skill ATK +100% (all) + 50% (Light) + BB ATK buff
const BB_MODIFIER = 3.5;
const TARGET_DEF = 600;

describe("Solen (M2-04E)", () => {
  it("transcribes every form, 2★ to Omni", () => {
    expect(solen.forms.map((form) => form.rarity)).toEqual([2, 3, 4, 5, 6, 7, "omni"]);
    expect(omni.bursts.bb.attacks[0]?.damageDistribution).toEqual(DISTRIBUTION);
    expect(omni.bursts.bb.attacks[0]?.startDelayFrames).toBe(16);
    expect(omni.bursts.ubb?.cost).toBe(25);
  });

  it("Omni BB reference case with fixed draws: 33396 against a Dark foe", () => {
    // atk_total = floor((2780 + 100) × (1 + 3.0 + 3.5)) = 2880 × 7.5 = 21600
    const atkTotal = attackTotal({
      atk: 2780,
      flatAtk: 100,
      statMods: STAT_MODS,
      bbModifier: BB_MODIFIER,
    });
    expect(atkTotal).toBe(21600);
    // core = (21600 − 600/3) × 1.0 + 21600/25 = 21400 + 864 = 22264; Light → Dark ×1.5 = 33396
    const core = attackCore({
      atkTotal,
      targetDef: TARGET_DEF,
      rolls: { critical: false, variance: 1, divisor: 25 },
      elementMult: elementMultiplier({ attacker: "light", defender: "dark" }),
    });
    expect(core).toBe(33396);
    const hits = DISTRIBUTION.map((pct) => hitDamage(core, pct));
    // e.g. floor(33396 × 15%) = 5009, floor(33396 × 20%) = 6679, floor(33396 × 3%) = 1001
    expect(hits).toEqual([
      5009, 2671, 2337, 2003, 1669, 1335, 1001, 6679, 2003, 2003, 1669, 1669, 1669, 1669,
    ]);
    // Flooring each hit drops 10 points in total.
    expect(hits.reduce((sum, hit) => sum + hit, 0)).toBe(33386);
  });

  it("the engine deals the same BB damage when Solen leads, at her reduced BB cost", () => {
    const foe = {
      ...makeEnemy("dummy"),
      element: "dark" as const,
      stats: { hp: 1_000_000, atk: 800, def: TARGET_DEF, rec: 100 },
    };
    const battle = createBattle(
      {
        squad: [{ unit: solen, formId: "solen-omni", stats: omni.stats.max }],
        leaderIndex: 0,
        waves: [[foe]],
      },
      11,
    );
    // Leader skill BB cost −25%: ceil(25 × 0.75) = 19 BC is enough for the BB.
    const start = { ...battle, party: battle.party.map((unit) => ({ ...unit, bc: 19 })) };
    const { state, events } = step(start, [{ type: "burst", tick: 0, actor: "p0", tier: "bb" }]);
    expect(
      events.find((event): event is BurstUsedEvent => event.type === "BurstUsed"),
    ).toBeTruthy();
    const draw = rollAttack(start.rng, 0);
    const core = attackCore({
      atkTotal: attackTotal({
        atk: 2780,
        flatAtk: 100,
        statMods: STAT_MODS,
        bbModifier: BB_MODIFIER,
      }),
      targetDef: TARGET_DEF,
      rolls: draw.value,
      elementMult: 1.5,
    });
    const landed = events.filter((event): event is HitLandedEvent => event.type === "HitLanded");
    expect(landed.map((hit) => hit.damage)).toEqual(
      DISTRIBUTION.map((pct) => hitDamage(core, pct)),
    );
    const effects = state.party[0]?.effects ?? [];
    for (const id of ["buff.atk", "buff.def", "buff.rec"] as const) {
      expect(effects.find((e) => e.id === id)).toMatchObject({ value: 1.5, turns: 3 });
    }
    expect(effects.find((e) => e.id === "bb.fill_rate" && e.source === "bb")).toMatchObject({
      value: 0.3,
      turns: 3,
    });
    // Leader-skill passives: BB cost −25% and BB fill rate (BC efficacy) +50%.
    expect(effects.find((e) => e.id === "bb.cost_reduction")).toMatchObject({
      value: 0.25,
      source: "leader",
    });
    expect(effects.find((e) => e.id === "bb.fill_rate" && e.source === "leader")).toMatchObject({
      value: 0.5,
    });
  });

  it("after the Omni UBB every party unit has all six added elements (M1-06J)", () => {
    const setup = makeSetup(2);
    const battle = createBattle(
      {
        ...setup,
        squad: [{ unit: solen, formId: "solen-omni", stats: omni.stats.max }, ...setup.squad],
        leaderIndex: 0,
      },
      11,
    );
    const start = {
      ...battle,
      party: battle.party.map((unit) =>
        unit.slot === "p0" ? { ...unit, bc: 25, overdrive: true } : unit,
      ),
    };
    const { state } = step(start, [{ type: "burst", tick: 0, actor: "p0", tier: "ubb" }]);
    expect(state.party).toHaveLength(3);
    for (const unit of state.party) {
      expect(addedElements(unit.effects).sort()).toEqual([
        "dark",
        "earth",
        "fire",
        "light",
        "thunder",
        "water",
      ]);
      expect(
        unit.effects.filter((e) => e.id === "buff.add_element").every((e) => e.source === "ubb"),
      ).toBe(true);
    }
  });
});
