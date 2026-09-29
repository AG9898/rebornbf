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

// Morrick's kit reference test (M2-04F, ROSTER.md → Transcription step 4): the Omni form's BB,
// worked by hand from the transcribed data and checked against the engine.

const morrick = UnitSchema.parse(
  JSON.parse(
    readFileSync(new URL("../../../data/content/units/morrick.json", import.meta.url), "utf8"),
  ),
);
const omni = morrick.forms.find((form) => form.id === "morrick-omni");
if (!omni) throw new Error("morrick-omni form missing");

// Omni BB: 13-hit AoE, 350% + 100 flat ATK, then DEF +150% and guard mitigation +10% to the party
// (3 turns). Neither buff raises Morrick's own damage.
const DISTRIBUTION = [9, 4, 9, 4, 30, 6, 5, 6, 5, 6, 5, 6, 5];
const STAT_MODS = 1.0 + 0.5; // leader skill ATK +100% (all) + 50% (Dark); the BB has no ATK buff
const BB_MODIFIER = 3.5;
const TARGET_DEF = 600;

describe("Morrick (M2-04F)", () => {
  it("transcribes every form, 2★ to Omni", () => {
    expect(morrick.forms.map((form) => form.rarity)).toEqual([2, 3, 4, 5, 6, 7, "omni"]);
    expect(omni.bursts.bb.attacks[0]?.damageDistribution).toEqual(DISTRIBUTION);
    expect(omni.bursts.bb.attacks[0]?.startDelayFrames).toBe(14);
    expect(omni.bursts.ubb?.effects.find((e) => e.id === "mitigation")).toMatchObject({
      value: 1,
      turns: 1,
    });
  });

  it("Omni BB reference case with fixed draws: 24252 against a Light foe", () => {
    // atk_total = floor((2540 + 100) × (1 + 1.5 + 3.5)) = 2640 × 6 = 15840
    const atkTotal = attackTotal({
      atk: 2540,
      flatAtk: 100,
      statMods: STAT_MODS,
      bbModifier: BB_MODIFIER,
    });
    expect(atkTotal).toBe(15840);
    // core = (15840 − 600/3) × 1.0 + 15840/30 = 15640 + 528 = 16168; Dark → Light ×1.5 = 24252
    const core = attackCore({
      atkTotal,
      targetDef: TARGET_DEF,
      rolls: { critical: false, variance: 1, divisor: 30 },
      elementMult: elementMultiplier({ attacker: "dark", defender: "light" }),
    });
    expect(core).toBe(24252);
    const hits = DISTRIBUTION.map((pct) => hitDamage(core, pct));
    // e.g. floor(24252 × 9%) = 2182, floor(24252 × 30%) = 7275, floor(24252 × 5%) = 1212
    expect(hits).toEqual([
      2182, 970, 2182, 970, 7275, 1455, 1212, 1455, 1212, 1455, 1212, 1455, 1212,
    ]);
    // Flooring each hit drops 5 points in total.
    expect(hits.reduce((sum, hit) => sum + hit, 0)).toBe(24247);
  });

  it("the engine deals the same BB damage when Morrick leads, and stores his buffs", () => {
    const foe = {
      ...makeEnemy("dummy"),
      element: "light" as const,
      stats: { hp: 1_000_000, atk: 800, def: TARGET_DEF, rec: 100 },
    };
    const battle = createBattle(
      {
        squad: [{ unit: morrick, formId: "morrick-omni", stats: omni.stats.max }],
        leaderIndex: 0,
        waves: [[foe]],
      },
      13,
    );
    const start = {
      ...battle,
      party: battle.party.map((unit) => ({ ...unit, bc: omni.bursts.bb.cost })),
    };
    const { state, events } = step(start, [{ type: "burst", tick: 0, actor: "p0", tier: "bb" }]);
    // The Extra Skill's DEF ignore sits under `cond.signature_sphere`, so the burst's first draws
    // are the damage rolls.
    const draw = rollAttack(start.rng, 0);
    const core = attackCore({
      atkTotal: attackTotal({
        atk: 2540,
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
    expect(effects.find((e) => e.id === "buff.def")).toMatchObject({ value: 1.5, turns: 3 });
    expect(effects.find((e) => e.id === "guard_mitigation")).toMatchObject({
      value: 0.1,
      turns: 3,
      source: "bb",
    });
    // Leader-skill passives (behaviour since M1-06K): weakness-damage resistance and the 8 BC fill
    // per 50,000 damage dealt.
    expect(effects.find((e) => e.id === "elem_weak_resist")).toMatchObject({
      value: 1,
      source: "leader",
    });
    expect(effects.find((e) => e.id === "bb.fill_on_damage_dealt")).toMatchObject({
      value: 8,
      threshold: 50000,
      source: "leader",
    });
  });
});
