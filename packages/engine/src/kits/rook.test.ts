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

// Rook's kit reference test (M2-04D, ROSTER.md → Transcription step 4): the Omni form's BB,
// worked by hand from the transcribed data and checked against the engine.

const rook = UnitSchema.parse(
  JSON.parse(
    readFileSync(new URL("../../../data/content/units/rook.json", import.meta.url), "utf8"),
  ),
);
const omni = rook.forms.find((form) => form.id === "rook-omni");
if (!omni) throw new Error("rook-omni form missing");

// Omni BB: 2-hit AoE (10%/90%, 55 frames apart, so it never self-sparks), 350% + 100 flat ATK,
// then ATK +150% and Spark +90% to the party (3 turns), applied before the damage roll.
const DISTRIBUTION = [10, 90];
const STAT_MODS = 1.0 + 0.5 + 1.5; // leader skill ATK +100% (all) + 50% (Thunder) + BB ATK buff
const BB_MODIFIER = 3.5;
const TARGET_DEF = 600;

describe("Rook (M2-04D)", () => {
  it("transcribes every form, 2★ to Omni", () => {
    expect(rook.forms.map((form) => form.rarity)).toEqual([2, 3, 4, 5, 6, 7, "omni"]);
    expect(omni.bursts.bb.attacks[0]?.damageDistribution).toEqual(DISTRIBUTION);
    expect(omni.bursts.bb.attacks[0]?.hitFrames).toEqual([0, 55]);
  });

  it("Omni BB reference case with fixed draws: 35970 against a Water foe", () => {
    // atk_total = floor((3000 + 100) × (1 + 3.0 + 3.5)) = 3100 × 7.5 = 23250
    const atkTotal = attackTotal({
      atk: 3000,
      flatAtk: 100,
      statMods: STAT_MODS,
      bbModifier: BB_MODIFIER,
    });
    expect(atkTotal).toBe(23250);
    // core = (23250 − 600/3) × 1.0 + 23250/25 = 23980; Thunder → Water ×1.5 = 35970
    const core = attackCore({
      atkTotal,
      targetDef: TARGET_DEF,
      rolls: { critical: false, variance: 1, divisor: 25 },
      elementMult: elementMultiplier({ attacker: "thunder", defender: "water" }),
    });
    expect(core).toBe(35970);
    const hits = DISTRIBUTION.map((pct) => hitDamage(core, pct));
    // floor(35970 × 10%) = 3597, floor(35970 × 90%) = 32373
    expect(hits).toEqual([3597, 32373]);
    expect(hits.reduce((sum, hit) => sum + hit, 0)).toBe(35970);
    // Were the 90% hit sparked by an ally, ×(1.5 + 0.9 BB + 1.2 leader skill) = ×3.6:
    // floor(35970 × 3.6 × 90%) = floor(116542.8) = 116542.
    expect(hitDamage(core, 90, { sparkMult: 1.5 + 0.9 + 1.2 })).toBe(116542);
  });

  it("the engine deals the same BB damage when Rook leads, and stores his spark buffs", () => {
    const foe = {
      ...makeEnemy("dummy"),
      element: "water" as const,
      stats: { hp: 1_000_000, atk: 800, def: TARGET_DEF, rec: 100 },
    };
    const battle = createBattle(
      {
        squad: [{ unit: rook, formId: "rook-omni", stats: omni.stats.max }],
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
        atk: 3000,
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
    expect(landed.every((hit) => !hit.sparked)).toBe(true);
    const effects = state.party[0]?.effects ?? [];
    expect(effects.find((e) => e.id === "buff.atk")).toMatchObject({ value: 1.5, turns: 3 });
    expect(effects.find((e) => e.id === "buff.spark_dmg" && e.source === "bb")).toMatchObject({
      value: 0.9,
      turns: 3,
    });
    // Leader-skill passives: Spark +120% and the 2–3 BC fill on spark (effects/spark.ts).
    expect(effects.find((e) => e.id === "buff.spark_dmg" && e.source === "leader")).toMatchObject({
      value: 1.2,
    });
    expect(effects.find((e) => e.id === "bb.fill_on_spark")).toMatchObject({
      min: 2,
      max: 3,
      source: "leader",
    });
  });
});
