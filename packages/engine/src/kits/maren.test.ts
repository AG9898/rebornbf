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

// Maren's kit reference test (M2-04B, ROSTER.md → Transcription step 4): the Omni form's BB,
// worked by hand from the transcribed data and checked against the engine.

const maren = UnitSchema.parse(
  JSON.parse(
    readFileSync(new URL("../../../data/content/units/maren.json", import.meta.url), "utf8"),
  ),
);
const omni = maren.forms.find((form) => form.id === "maren-omni");
if (!omni) throw new Error("maren-omni form missing");

// Omni BB: 13-hit AoE, 350% + 100 flat ATK, then a 4000–4500 HoT (+10% REC) and 7 BC per turn to
// the party (3 turns). No ATK or BB ATK buffs: the only stat mods are the leader skill's.
const DISTRIBUTION = [16, 8, 7, 6, 5, 4, 15, 9, 8, 7, 6, 5, 4];
const STAT_MODS = 1.0 + 0.5; // leader skill ATK +100% (all) + 50% (Water)
const BB_MODIFIER = 3.5;
const TARGET_DEF = 600;

describe("Maren (M2-04B)", () => {
  it("transcribes every form, 2★ to Omni", () => {
    expect(maren.forms.map((form) => form.rarity)).toEqual([2, 3, 4, 5, 6, 7, "omni"]);
    expect(omni.bursts.bb.attacks[0]?.damageDistribution).toEqual(DISTRIBUTION);
  });

  it("Omni BB reference case with fixed draws: 25700 against a Fire foe", () => {
    // atk_total = floor((2678 + 100) × (1 + 1.5 + 3.5)) = 2778 × 6 = 16668
    const atkTotal = attackTotal({
      atk: 2678,
      flatAtk: 100,
      statMods: STAT_MODS,
      bbModifier: BB_MODIFIER,
    });
    expect(atkTotal).toBe(16668);
    // core = (16668 − 600/3) × 1.0 + 16668/25 = 17134.72; Water → Fire ×1.5 = 25702.08
    const core = attackCore({
      atkTotal,
      targetDef: TARGET_DEF,
      rolls: { critical: false, variance: 1, divisor: 25 },
      elementMult: elementMultiplier({ attacker: "water", defender: "fire" }),
    });
    const hits = DISTRIBUTION.map((pct) => hitDamage(core, pct));
    // floor(25702.08 × 16%) = 4112, × 8% = 2056, × 7% = 1799, … × 4% = 1028
    expect(hits).toEqual([
      4112, 2056, 1799, 1542, 1285, 1028, 3855, 2313, 2056, 1799, 1542, 1285, 1028,
    ]);
    expect(hits.reduce((sum, hit) => sum + hit, 0)).toBe(25700);
  });

  it("the engine deals the same BB damage when Maren leads, and stores her HoT and BC fill", () => {
    const foe = {
      ...makeEnemy("dummy"),
      element: "fire" as const,
      stats: { hp: 1_000_000, atk: 800, def: TARGET_DEF, rec: 100 },
    };
    const battle = createBattle(
      {
        squad: [{ unit: maren, formId: "maren-omni", stats: omni.stats.max }],
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
        atk: 2678,
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
    const hot = effects.find((effect) => effect.id === "heal.over_time" && effect.source === "bb");
    expect(hot).toMatchObject({ min: 4000, max: 4500, recBonus: 0.1, turns: 3, healerRec: 2760 });
    const fill = effects.find((effect) => effect.id === "bb.fill_per_turn");
    expect(fill).toMatchObject({ value: 7, turns: 3, source: "bb" });
  });
});
