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

// Brand's kit reference test (M2-04A, ROSTER.md → Transcription step 4): the Omni form's BB,
// worked by hand from the transcribed data and checked against the engine.

const brand = UnitSchema.parse(
  JSON.parse(
    readFileSync(new URL("../../../data/content/units/brand.json", import.meta.url), "utf8"),
  ),
);
const omni = brand.forms.find((form) => form.id === "brand-omni");
if (!omni) throw new Error("brand-omni form missing");

// Omni BB: 15-hit AoE, 350% + 100 flat ATK, then ATK +150% and BB ATK +300% to the party (3 turns).
const DISTRIBUTION = [9, 12, 11, 8, 6, 5, 6, 5, 10, 7, 5, 4, 4, 4, 4];
// Leader skill: ATK +100% (all) + 50% (Fire) passive, BB ATK +120% passive.
const STAT_MODS = 1.0 + 0.5 + 1.5; // leader skill + BB ATK buff
const BB_MODIFIER = 3.5 + 1.2 + 3.0; // BB modifier + leader-skill BB ATK + burst BB ATK
const TARGET_DEF = 600;

describe("Brand (M2-04A)", () => {
  it("transcribes every form, 2★ to Omni", () => {
    expect(brand.forms.map((form) => form.rarity)).toEqual([2, 3, 4, 5, 6, 7, "omni"]);
    expect(omni.bursts.bb.attacks[0]?.damageDistribution).toEqual(DISTRIBUTION);
  });

  it("Omni BB reference case with fixed draws: 53385 against an Earth foe", () => {
    // atk_total = floor((2842 + 100) × (1 + 3.0 + 7.7)) = floor(34421.4) = 34421
    const atkTotal = attackTotal({
      atk: 2842,
      flatAtk: 100,
      statMods: STAT_MODS,
      bbModifier: BB_MODIFIER,
    });
    expect(atkTotal).toBe(34421);
    // core = (34421 − 600/3) × 1.0 + 34421/25 = 35597.84; Fire → Earth ×1.5 = 53396.76
    const core = attackCore({
      atkTotal,
      targetDef: TARGET_DEF,
      rolls: { critical: false, variance: 1, divisor: 25 },
      elementMult: elementMultiplier({ attacker: "fire", defender: "earth" }),
    });
    const hits = DISTRIBUTION.map((pct) => hitDamage(core, pct));
    // floor(53396.76 × 9%) = 4805, × 12% = 6407, × 11% = 5873, … × 4% = 2135
    expect(hits).toEqual([
      4805, 6407, 5873, 4271, 3203, 2669, 3203, 2669, 5339, 3737, 2669, 2135, 2135, 2135, 2135,
    ]);
    expect(hits.reduce((sum, hit) => sum + hit, 0)).toBe(53385);
  });

  it("the engine deals the same BB damage when Brand leads, replaying its draws", () => {
    const foe = {
      ...makeEnemy("dummy"),
      element: "earth" as const,
      stats: { hp: 1_000_000, atk: 800, def: TARGET_DEF, rec: 100 },
    };
    const battle = createBattle(
      {
        squad: [{ unit: brand, formId: "brand-omni", stats: omni.stats.max }],
        leaderIndex: 0,
        waves: [[foe]],
      },
      7,
    );
    const start = {
      ...battle,
      party: battle.party.map((unit) => ({ ...unit, bc: omni.bursts.bb.cost })),
    };
    const { events } = step(start, [{ type: "burst", tick: 0, actor: "p0", tier: "bb" }]);
    const draw = rollAttack(start.rng, 0);
    const core = attackCore({
      atkTotal: attackTotal({
        atk: 2842,
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
  });
});
