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

// Aurelle's kit reference test (M2-04G, ROSTER.md → Transcription step 4): the Omni form's BB,
// worked by hand from the transcribed data and checked against the engine.

const aurelle = UnitSchema.parse(
  JSON.parse(
    readFileSync(new URL("../../../data/content/units/aurelle.json", import.meta.url), "utf8"),
  ),
);
const omni = aurelle.forms.find((form) => form.id === "aurelle-omni");
if (!omni) throw new Error("aurelle-omni form missing");

// Omni BB: a 16-hit AoE at 360% + 200 flat ATK, then 4 more hits at 360% + 200 that land only on
// Dark foes; the burst's own BB ATK +350% applies before its damage is rolled.
const MAIN = [18, 11, 8, 6, 4, 18, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3];
const DARK_ONLY = [30, 25, 20, 25];
// Leader skill ATK +100% (Light) + 50% (all); Extra Skill ATK +50% while HP > 50%.
const STAT_MODS = 1.0 + 0.5 + 0.5;
// BB 360% + leader skill BB ATK 250% + Extra Skill 150% + the BB's own BB ATK buff 350%.
const BB_MODIFIER = 3.6 + 2.5 + 1.5 + 3.5;
const TARGET_DEF = 600;

describe("Aurelle (M2-04G)", () => {
  it("transcribes every form, 3★ to Omni", () => {
    expect(aurelle.forms.map((form) => form.rarity)).toEqual([3, 4, 5, 6, 7, "omni"]);
    const [main, darkOnly] = omni.bursts.bb.attacks;
    expect(main?.damageDistribution).toEqual(MAIN);
    expect(darkOnly?.damageDistribution).toEqual(DARK_ONLY);
    expect([main?.startDelayFrames, darkOnly?.startDelayFrames]).toEqual([21, 116]);
    expect(omni.bursts.bb.effects[1]).toMatchObject({
      id: "attack.element_target",
      element: "dark",
      value: 3.6,
      flatAtk: 200,
    });
    const sbb = omni.bursts.sbb?.effects[0];
    expect(sbb).toMatchObject({ id: "attack.hp_scaled", value: 2, hpScaling: 7 });
    const seven = aurelle.forms.find((form) => form.id === "aurelle-7");
    expect(seven?.bursts.bb.effects).toContainEqual({
      id: "buff.add_ailment",
      ailment: "paralysis",
      value: 10,
      turns: 3,
      target: "party",
    });
  });

  it("Omni BB reference case with fixed draws: 80234.9 core against a Dark foe", () => {
    // atk_total = floor((3485 + 200) × (1 + 2.0 + 11.1)) = floor(3685 × 14.1) = floor(51958.5)
    const atkTotal = attackTotal({
      atk: 3485,
      flatAtk: 200,
      statMods: STAT_MODS,
      bbModifier: BB_MODIFIER,
    });
    expect(atkTotal).toBe(51958);
    // core = (51958 − 600/3) × 1.0 + 51958/30 = 51758 + 1731.93… = 53489.93…; Light → Dark ×1.5
    const core = attackCore({
      atkTotal,
      targetDef: TARGET_DEF,
      rolls: { critical: false, variance: 1, divisor: 30 },
      elementMult: elementMultiplier({ attacker: "light", defender: "dark" }),
    });
    expect(core).toBeCloseTo(80234.9, 6);
    const main = MAIN.map((pct) => hitDamage(core, pct));
    // e.g. floor(80234.9 × 18%) = 14442, floor(80234.9 × 11%) = 8825, floor(80234.9 × 3%) = 2407
    expect(main).toEqual([
      14442, 8825, 6418, 4814, 3209, 14442, 3209, 2407, 3209, 2407, 3209, 2407, 3209, 2407, 3209,
      2407,
    ]);
    expect(main.reduce((sum, hit) => sum + hit, 0)).toBe(80230);
    // The Dark-only attack has the same modifier and flat ATK, so the same core with these draws.
    const darkOnly = DARK_ONLY.map((pct) => hitDamage(core, pct));
    expect(darkOnly).toEqual([24070, 20058, 16046, 20058]);
    expect(darkOnly.reduce((sum, hit) => sum + hit, 0)).toBe(80232);
  });

  it("the engine deals the same BB damage when Aurelle leads, and stores her buffs", () => {
    const foe = {
      ...makeEnemy("dummy"),
      element: "dark" as const,
      stats: { hp: 1_000_000, atk: 800, def: TARGET_DEF, rec: 100 },
    };
    const battle = createBattle(
      {
        squad: [{ unit: aurelle, formId: "aurelle-omni", stats: omni.stats.max }],
        leaderIndex: 0,
        waves: [[foe]],
      },
      17,
    );
    const start = {
      ...battle,
      party: battle.party.map((unit) => ({ ...unit, bc: omni.bursts.bb.cost })),
    };
    const { state, events } = step(start, [{ type: "burst", tick: 0, actor: "p0", tier: "bb" }]);
    // No effect of the kit draws before the damage rolls: one draw set per attack, in order.
    const first = rollAttack(start.rng, 0);
    const second = rollAttack(first.rng, 0);
    const atkTotal = attackTotal({
      atk: 3485,
      flatAtk: 200,
      statMods: STAT_MODS,
      bbModifier: BB_MODIFIER,
    });
    const core = (rolls: typeof first.value) =>
      attackCore({ atkTotal, targetDef: TARGET_DEF, rolls, elementMult: 1.5 });
    const landed = events.filter((event): event is HitLandedEvent => event.type === "HitLanded");
    // The two attacks' hits never share a tick (last main hit at 112, first Dark-only at 116).
    expect(landed.some((hit) => hit.sparked)).toBe(false);
    expect(landed.map((hit) => hit.damage)).toEqual([
      ...MAIN.map((pct) => hitDamage(core(first.value), pct)),
      ...DARK_ONLY.map((pct) => hitDamage(core(second.value), pct)),
    ]);
    const effects = state.party[0]?.effects ?? [];
    expect(effects.find((e) => e.id === "buff.spark_dmg")).toMatchObject({ value: 1.3, turns: 3 });
    expect(effects.find((e) => e.id === "buff.bb_atk" && e.source === "bb")).toMatchObject({
      value: 3.5,
      turns: 3,
    });
    // Passives: leader-skill and Extra Skill BB ATK, and the Extra Skill's HP-gated ATK.
    const passiveBbAtk = effects.filter((e) => e.id === "buff.bb_atk" && e.source !== "bb");
    expect(passiveBbAtk.map((e) => e.value).sort()).toEqual([1.5, 2.5]);
    expect(effects.find((e) => e.id === "passive.stat_pct" && e.source === "extra")).toMatchObject({
      stat: "atk",
      value: 0.5,
    });
  });
});
