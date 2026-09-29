import { readFileSync } from "node:fs";
import { UnitSchema } from "@bfr/data";
import { describe, expect, it } from "vitest";
import { refreshPassives } from "../effects/passive.ts";
import type { HitLandedEvent } from "../events.ts";
import { attackTotal } from "../formulas/attack-stat.ts";
import { attackCore, hitDamage, rollAttack } from "../formulas/damage.ts";
import { elementMultiplier } from "../formulas/element.ts";
import { nextInt } from "../rng.ts";
import { createBattle } from "../state/create-battle.ts";
import { step } from "../step.ts";
import { makeEnemy } from "../test/factories.ts";

// Vespera's kit reference test (M2-04H, ROSTER.md → Transcription step 4): the Omni form's BB,
// worked by hand from the transcribed data and checked against the engine.

const vespera = UnitSchema.parse(
  JSON.parse(
    readFileSync(new URL("../../../data/content/units/vespera.json", import.meta.url), "utf8"),
  ),
);
const omni = vespera.forms.find((form) => form.id === "vespera-omni");
if (!omni) throw new Error("vespera-omni form missing");

// Omni BB: a 14-hit AoE at 360% + 200 flat ATK, then 6 more hits at 360% + 200 that land only on
// Light foes. Its six 75% ailments roll at burst start, before the damage rolls.
const MAIN = [15, 15, 10, 10, 8, 8, 7, 6, 6, 4, 4, 3, 2, 2];
const LIGHT_ONLY = [30, 20, 20, 10, 10, 10];
// Leader skill ATK +100% (Dark) + 50% (all). The Extra Skill's ATK +50% while the BB gauge is
// above 50% (`cond.bb_above`) is off: passives are checked at battle start, with an empty gauge.
const STAT_MODS = 1.0 + 0.5;
const BB_MODIFIER = 3.6;
const FOE_DEF = 600;
// The case's seed lands Weak (DEF −50%) on the foe before the damage is rolled: 600 → 300.
const WEAK_DEF = 300;
const SEED = 18;

describe("Vespera (M2-04H)", () => {
  it("transcribes every form, 3★ to Omni", () => {
    expect(vespera.forms.map((form) => form.rarity)).toEqual([3, 4, 5, 6, 7, "omni"]);
    const [main, lightOnly] = omni.bursts.bb.attacks;
    expect(main?.damageDistribution).toEqual(MAIN);
    expect(lightOnly?.damageDistribution).toEqual(LIGHT_ONLY);
    expect([main?.startDelayFrames, lightOnly?.startDelayFrames]).toEqual([99, 106]);
    expect(omni.bursts.bb.effects[1]).toMatchObject({
      id: "attack.element_target",
      element: "light",
      value: 3.6,
      flatAtk: 200,
    });
    expect(omni.bursts.bb.effects).toContainEqual({
      id: "debuff.dot",
      value: 5,
      turns: 3,
      target: "enemies",
      flatAtk: 100,
    });
    const six = vespera.forms.find((form) => form.id === "vespera-6");
    expect(six?.bursts.sbb?.effects[0]).toMatchObject({ id: "attack.aoe", critRate: 20 });
    // The 5★ BB's source frames are out of order; sorted (all hits are 10%, ROSTER kit notes).
    const five = vespera.forms.find((form) => form.id === "vespera-5");
    expect(five?.bursts.bb.attacks[0]?.hitFrames).toEqual([0, 4, 16, 20, 22, 28, 34, 40, 46, 52]);
    expect(omni.bursts.sbb?.effects).toContainEqual({
      id: "bb.fill_on_hit",
      value: 0,
      min: 5,
      max: 8,
      turns: 3,
      target: "party",
    });
  });

  it("Omni BB reference case with fixed draws: 31835.8 core against a weakened Light foe", () => {
    // atk_total = floor((3183 + 200) × (1 + 1.5 + 3.6)) = floor(3383 × 6.1) = floor(20636.3)
    const atkTotal = attackTotal({
      atk: 3183,
      flatAtk: 200,
      statMods: STAT_MODS,
      bbModifier: BB_MODIFIER,
    });
    expect(atkTotal).toBe(20636);
    // core = (20636 − 300/3) × 1.0 + 20636/30 = 20536 + 687.87 = 21223.87; Dark → Light ×1.5
    const core = attackCore({
      atkTotal,
      targetDef: WEAK_DEF,
      rolls: { critical: false, variance: 1, divisor: 30 },
      elementMult: elementMultiplier({ attacker: "dark", defender: "light" }),
    });
    expect(core).toBeCloseTo(31835.8, 6);
    const main = MAIN.map((pct) => hitDamage(core, pct));
    // e.g. floor(31835.8 × 15%) = 4775, floor(31835.8 × 7%) = 2228, floor(31835.8 × 2%) = 636
    expect(main).toEqual([
      4775, 4775, 3183, 3183, 2546, 2546, 2228, 1910, 1910, 1273, 1273, 955, 636, 636,
    ]);
    expect(main.reduce((sum, hit) => sum + hit, 0)).toBe(31829);
    // The Light-only attack has the same modifier and flat ATK, so the same core with these draws.
    const lightOnly = LIGHT_ONLY.map((pct) => hitDamage(core, pct));
    expect(lightOnly).toEqual([9550, 6367, 6367, 3183, 3183, 3183]);
    expect(lightOnly.reduce((sum, hit) => sum + hit, 0)).toBe(31833);
  });

  it("the engine deals the same BB damage when Vespera leads, and stores her effects", () => {
    const foe = {
      ...makeEnemy("dummy"),
      element: "light" as const,
      stats: { hp: 1_000_000, atk: 800, def: FOE_DEF, rec: 100 },
    };
    const battle = createBattle(
      {
        squad: [{ unit: vespera, formId: "vespera-omni", stats: omni.stats.max }],
        leaderIndex: 0,
        waves: [[foe]],
      },
      SEED,
    );
    const start = {
      ...battle,
      party: battle.party.map((unit) => ({ ...unit, bc: omni.bursts.bb.cost })),
    };
    const { state, events } = step(start, [{ type: "burst", tick: 0, actor: "p0", tier: "bb" }]);
    // Six ailment draws for the one foe (poison, sick, curse, weak, injury, paralysis in list
    // order), then one draw set per attack.
    let rng = start.rng;
    const ailmentDraws: number[] = [];
    for (let i = 0; i < 6; i++) {
      const draw = nextInt(rng, 0, 99);
      ailmentDraws.push(draw.value);
      rng = draw.rng;
    }
    expect(ailmentDraws[3]).toBeLessThan(75); // Weak lands
    const foeEffects = state.enemies[0]?.effects ?? [];
    expect(foeEffects.some((e) => e.id === "ailment.inflict.weak")).toBe(true);
    expect(foeEffects.find((e) => e.id === "debuff.dot")).toMatchObject({ value: 5, turns: 3 });
    const first = rollAttack(rng, 0);
    const second = rollAttack(first.rng, 0);
    const atkTotal = attackTotal({
      atk: 3183,
      flatAtk: 200,
      statMods: STAT_MODS,
      bbModifier: BB_MODIFIER,
    });
    const core = (rolls: typeof first.value) =>
      attackCore({ atkTotal, targetDef: WEAK_DEF, rolls, elementMult: 1.5 });
    const landed = events.filter((event): event is HitLandedEvent => event.type === "HitLanded");
    expect(landed.map((hit) => hit.damage).sort((a, b) => a - b)).toEqual(
      [
        ...MAIN.map((pct) => hitDamage(core(first.value), pct)),
        ...LIGHT_ONLY.map((pct) => hitDamage(core(second.value), pct)),
      ].sort((a, b) => a - b),
    );
    // Passives: the leader skill's cost reduction and the Extra Skill's six added ailments,
    // counter, and (inactive) BB-gauge-gated ATK.
    const effects = state.party[0]?.effects ?? [];
    expect(effects.find((e) => e.id === "bb.cost_reduction")).toMatchObject({ value: 0.2 });
    const added = effects.filter((e) => e.id === "buff.add_ailment" && e.source === "extra");
    expect(added.map((e) => [e.ailment, e.value])).toEqual([
      ["poison", 8],
      ["curse", 8],
      ["paralysis", 8],
      ["weak", 10],
      ["sick", 10],
      ["injury", 10],
    ]);
    expect(effects.find((e) => e.id === "damage_reflect")).toMatchObject({
      value: 0.25,
      chance: 20,
    });
    expect(effects.some((e) => e.id === "passive.stat_pct" && e.source === "extra")).toBe(false);
    // With the gauge above half the BB cost at a passive check, the gated ATK +50% switches on.
    const charged = refreshPassives(start).party[0]?.effects ?? [];
    expect(charged.find((e) => e.id === "passive.stat_pct" && e.source === "extra")).toMatchObject({
      stat: "atk",
      value: 0.5,
    });
  });
});
