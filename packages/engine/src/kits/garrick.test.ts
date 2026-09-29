import { readFileSync } from "node:fs";
import { UnitSchema } from "@bfr/data";
import { describe, expect, it } from "vitest";
import type { HitLandedEvent } from "../events.ts";
import { attackTotal } from "../formulas/attack-stat.ts";
import { attackCore, hitDamage, rollAttack } from "../formulas/damage.ts";
import { elementMultiplier } from "../formulas/element.ts";
import { createBattle } from "../state/create-battle.ts";
import { step } from "../step.ts";
import { makeEnemy } from "../test/factories.ts";

// Garrick's kit reference test (M2-04C, ROSTER.md → Transcription step 4): the Omni form's BB,
// worked by hand from the transcribed data and checked against the engine.

const garrick = UnitSchema.parse(
  JSON.parse(
    readFileSync(new URL("../../../data/content/units/garrick.json", import.meta.url), "utf8"),
  ),
);
const omni = garrick.forms.find((form) => form.id === "garrick-omni");
if (!omni) throw new Error("garrick-omni form missing");

// Omni BB: 13-hit AoE, 350% + 100 flat ATK, then DEF +160% (3 turns) and a cure to the party.
// No ATK or BB ATK buffs: the only stat mods are the leader skill's.
const DISTRIBUTION = [15, 7, 6, 4, 18, 8, 7, 7, 6, 6, 6, 5, 5];
const STAT_MODS = 1.0 + 0.5; // leader skill ATK +100% (all) + 50% (Earth)
const BB_MODIFIER = 3.5;
const TARGET_DEF = 600;

describe("Garrick (M2-04C)", () => {
  it("transcribes every form, 2★ to Omni", () => {
    expect(garrick.forms.map((form) => form.rarity)).toEqual([2, 3, 4, 5, 6, 7, "omni"]);
    expect(omni.bursts.bb.attacks[0]?.damageDistribution).toEqual(DISTRIBUTION);
  });

  it("Omni BB reference case with fixed draws: 26370 against a Thunder foe", () => {
    // atk_total = floor((2750 + 100) × (1 + 1.5 + 3.5)) = 2850 × 6 = 17100
    const atkTotal = attackTotal({
      atk: 2750,
      flatAtk: 100,
      statMods: STAT_MODS,
      bbModifier: BB_MODIFIER,
    });
    expect(atkTotal).toBe(17100);
    // core = (17100 − 600/3) × 1.0 + 17100/25 = 17584; Earth → Thunder ×1.5 = 26376
    const core = attackCore({
      atkTotal,
      targetDef: TARGET_DEF,
      rolls: { critical: false, variance: 1, divisor: 25 },
      elementMult: elementMultiplier({ attacker: "earth", defender: "thunder" }),
    });
    const hits = DISTRIBUTION.map((pct) => hitDamage(core, pct));
    // floor(26376 × 15%) = 3956, × 7% = 1846, × 6% = 1582, × 4% = 1055, × 18% = 4747, …
    expect(hits).toEqual([
      3956, 1846, 1582, 1055, 4747, 2110, 1846, 1846, 1582, 1582, 1582, 1318, 1318,
    ]);
    expect(hits.reduce((sum, hit) => sum + hit, 0)).toBe(26370);
  });

  it("the engine deals the same BB damage when Garrick leads, and stores his DEF buff", () => {
    const foe = {
      ...makeEnemy("dummy"),
      element: "thunder" as const,
      stats: { hp: 1_000_000, atk: 800, def: TARGET_DEF, rec: 100 },
    };
    const battle = createBattle(
      {
        squad: [{ unit: garrick, formId: "garrick-omni", stats: omni.stats.max }],
        leaderIndex: 0,
        waves: [[foe]],
      },
      7,
    );
    const start = {
      ...battle,
      party: battle.party.map((unit) => ({ ...unit, bc: omni.bursts.bb.cost })),
    };
    const { state, events } = step(start, [{ type: "burst", tick: 0, actor: "p0", tier: "bb" }]);
    const draw = rollAttack(start.rng, 0);
    const core = attackCore({
      atkTotal: attackTotal({
        atk: 2750,
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
    expect(effects.find((effect) => effect.id === "buff.def")).toMatchObject({
      value: 1.6,
      turns: 3,
      source: "bb",
    });
    // Leader-skill passives: crit resist and damage-taken BC fill (behaviour: M1-06H tests).
    expect(effects.find((effect) => effect.id === "crit_resist")).toMatchObject({
      value: 1,
      source: "leader",
    });
    expect(effects.find((effect) => effect.id === "bb.fill_on_damage_taken")).toMatchObject({
      value: 8,
      threshold: 5000,
      source: "leader",
    });
  });
});
