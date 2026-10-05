import type { Effect } from "@bfr/data";
import { describe, expect, it } from "vitest";
import { evaluateEnemyAi } from "../ai/evaluate.ts";
import { hcDropRate } from "../drops/rates.ts";
import { rollHitDrops } from "../drops/roll.ts";
import type { BattleEvent } from "../events.ts";
import { attackCore, hitDamage, rollAttack } from "../formulas/damage.ts";
import { elementMultiplier } from "../formulas/element.ts";
import { guardMultiplier } from "../formulas/mitigation.ts";
import { createRng, nextInt, type RngState } from "../rng.ts";
import { createBattle } from "../state/create-battle.ts";
import type { BattleState, BattleUnit, EnemySetup } from "../state/types.ts";
import { step } from "../step.ts";
import { makeEnemy, makeMember } from "../test/factories.ts";
import { endTurn } from "../turn.ts";
import type { ActiveEffect } from "./buffs.ts";
import { bcFillOnDamageDealt } from "./gauge.ts";
import { applyEffect } from "./index.ts";
import { elementalWeaknessResistance, guardBonus, hpDrainAmount } from "./survival.ts";

// Guard mitigation, elemental weakness resistance, HP drain and damage-dealt BC fill
// (M1-06K, GAME_DESIGN §4). The test unit has ATK 1400, DEF 1100, HP 4000 and is Fire,
// with a 2-hit (50/50) normal attack and 4 drop checks.

function ofType<T extends BattleEvent["type"]>(
  events: readonly BattleEvent[],
  type: T,
): Extract<BattleEvent, { type: T }>[] {
  return events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);
}

const bb = (effects: readonly ActiveEffect[], effect: Effect): ActiveEffect[] =>
  applyEffect(effects, effect, "bb");

function duel(enemy: EnemySetup = makeEnemy("dummy"), seed = 5): BattleState {
  return createBattle({ squad: [makeMember("solo")], leaderIndex: 0, waves: [[enemy]] }, seed);
}

function patchUnit(state: BattleState, patch: Partial<BattleUnit>): BattleState {
  return { ...state, party: state.party.map((u, i) => (i === 0 ? { ...u, ...patch } : u)) };
}

/** The RNG after the enemy AI picks its target (the only unit), before the attack's draws. */
function afterAi(state: BattleState): RngState {
  const enemy = state.enemies[0];
  if (!enemy) throw new Error("no enemy");
  return evaluateEnemyAi({
    enemy,
    rules: enemy.ai,
    enemyTurn: 1,
    party: state.party,
    memory: enemy.aiMemory,
    rng: state.rng,
  }).rng;
}

/** A hard-hitting one-hit enemy of the given element. */
function brute(element: EnemySetup["element"]): EnemySetup {
  return { ...makeEnemy("brute"), element, stats: { hp: 99999, atk: 6000, def: 500, rec: 100 } };
}

/** The brute's per-attack core against the test unit (DEF 1100, Fire). */
function bruteCore(rng: RngState, elementMult: number): number {
  const rolls = rollAttack(rng, 0);
  return attackCore({ atkTotal: 6000, targetDef: 1100, rolls: rolls.value, elementMult });
}

const attack = [{ type: "attack" as const, tick: 0, actor: "p0" as const }];

describe("guard_mitigation", () => {
  it("adds guard bonuses to the 50% guard: 10% → ×0.4, BB 10% + UBB 30% → ×0.1", () => {
    let effects = bb([], { id: "guard_mitigation", value: 0.1, turns: 3, target: "party" });
    expect(guardBonus(effects)).toBe(0.1);
    // Core 10,000, one 100% hit: guarding alone 5,000; with +10% guard mitigation 4,000.
    expect(hitDamage(10000, 100, { guard: guardMultiplier(true, 0) })).toBe(5000);
    expect(hitDamage(10000, 100, { guard: guardMultiplier(true, guardBonus(effects)) })).toBe(4000);
    effects = applyEffect(
      effects,
      { id: "guard_mitigation", value: 0.3, turns: 3, target: "party" },
      "ubb",
    );
    expect(hitDamage(10000, 100, { guard: guardMultiplier(true, guardBonus(effects)) })).toBe(1000);
    // Only while guarding.
    expect(guardMultiplier(false, guardBonus(effects))).toBe(1);
  });

  it("cuts an enemy hit on a guarding unit to 40% of its unguarded damage", () => {
    const start = duel(brute("earth"));
    const core = bruteCore(afterAi(start), 0.5);
    const effects = bb([], { id: "guard_mitigation", value: 0.1, turns: 3, target: "party" });
    const guarding = patchUnit(start, { guarding: true, effects });
    const [hit] = ofType(endTurn(guarding).events, "EnemyHitLanded");
    expect(hit?.damage).toBe(hitDamage(core, 100, { guard: 0.4 }));
    const [open] = ofType(endTurn(patchUnit(start, { effects })).events, "EnemyHitLanded");
    expect(open?.damage).toBe(hitDamage(core, 100));
  });
});

describe("elem_weak_resist", () => {
  it("subtracts from the base and buffed weakness bonus (Water → Fire)", () => {
    const resist = (value: number) =>
      elementalWeaknessResistance(
        bb([], { id: "elem_weak_resist", value, turns: 3, target: "party" }),
      );
    const terms = { attacker: "water", defender: "fire", elementalDamageBuffs: 0.5 } as const;
    // No resist: 1 + 0.5 + 0.5 = 2.0; resist 0.25: 1 + 0.25 + 0.25 = 1.5; resist 1: ×1.0.
    expect(elementMultiplier(terms)).toBe(2);
    const quarter = resist(0.25);
    expect(
      elementMultiplier({ ...terms, baseResistance: quarter, buffedResistance: quarter }),
    ).toBe(1.5);
    const full = resist(1);
    expect(elementMultiplier({ ...terms, baseResistance: full, buffedResistance: full })).toBe(1);
  });

  it("negates a Water enemy's weakness bonus on the Fire unit", () => {
    const start = duel(brute("water"));
    const passive: ActiveEffect = {
      id: "elem_weak_resist",
      value: 1,
      target: "party",
      source: "leader",
    };
    const [open] = ofType(endTurn(start).events, "EnemyHitLanded");
    expect(open?.damage).toBe(hitDamage(bruteCore(afterAi(start), 1.5), 100));
    const resisted = patchUnit(start, { effects: [passive] });
    const [hit] = ofType(endTurn(resisted).events, "EnemyHitLanded");
    expect(hit?.damage).toBe(hitDamage(bruteCore(afterAi(resisted), 1), 100));
  });

  it("also protects an enemy that holds it from the Fire unit's weakness bonus", () => {
    const start = duel();
    const enemies = start.enemies.map((enemy) => ({
      ...enemy,
      effects: bb([], { id: "elem_weak_resist", value: 1, turns: 3, target: "self" }),
    }));
    const rolls = rollAttack(start.rng, 0);
    const core = attackCore({ atkTotal: 1400, targetDef: 500, rolls: rolls.value, elementMult: 1 });
    const hits = ofType(step({ ...start, enemies }, attack).events, "HitLanded");
    expect(hits.map((h) => h.damage)).toEqual([hitDamage(core, 50), hitDamage(core, 50)]);
  });
});

describe("hp_drain", () => {
  it("heals floor(damage × share); a 1-damage hit restores nothing", () => {
    const rng = createRng(1);
    const fixed = bb([], { id: "hp_drain", value: 0.05, turns: 3, target: "party" });
    expect(hpDrainAmount(fixed, 10000, rng)).toEqual({ value: 500, rng });
    expect(hpDrainAmount(fixed, 1, rng)).toEqual({ value: 0, rng });
  });

  it("draws the proc, then on a proc RandomBetween(3, 6) percent (Morrick's 50% for 3–6%)", () => {
    const drain = bb([], {
      id: "hp_drain",
      value: 0,
      min: 0.03,
      max: 0.06,
      chance: 50,
      turns: 3,
      target: "party",
    });
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const rng = createRng(seed);
      const proc = nextInt(rng, 0, 99);
      const pct = nextInt(proc.rng, 3, 6);
      const expected =
        proc.value < 50
          ? { value: Math.floor((10000 * pct.value) / 100), rng: pct.rng }
          : { value: 0, rng: proc.rng };
      expect(hpDrainAmount(drain, 10000, rng)).toEqual(expected);
    }
  });

  it("heals the attacker after each landed hit, after that hit's drop draws", () => {
    const start = duel();
    const drain = bb([], {
      id: "hp_drain",
      value: 0,
      min: 0.03,
      max: 0.06,
      chance: 50,
      turns: 3,
      target: "party",
    });
    const hurt = patchUnit(start, { hp: 1000, effects: drain });
    const { state, events } = step(hurt, attack);
    const rolls = rollAttack(start.rng, 0);
    const core = attackCore({
      atkTotal: 1400,
      targetDef: 500,
      rolls: rolls.value,
      elementMult: 1.5,
    });
    // Replay: per hit, 2 BC checks + the HC roll (and divisor), then the drain draws.
    let rng = rolls.rng;
    const heals: number[] = [];
    for (const damage of [hitDamage(core, 50), hitDamage(core, 50)]) {
      const drops = rollHitDrops(rng, { checks: 2, bcRate: 0, hcRate: hcDropRate() });
      const heal = hpDrainAmount(drain, damage, drops.rng);
      if (heal.value > 0) heals.push(heal.value);
      rng = heal.rng;
    }
    expect(state.rng).toEqual(rng);
    const restored = ofType(events, "HpRestored");
    expect(restored.map((e) => e.amount)).toEqual(heals);
    expect(heals.length).toBeGreaterThan(0);
    expect(restored.every((e) => e.effect === "hp_drain" && e.target === "p0")).toBe(true);
  });

  it("with a fixed share draws nothing: 10% of each 50% hit", () => {
    const start = duel();
    const drain = bb([], { id: "hp_drain", value: 0.1, turns: 3, target: "party" });
    const plain = step(patchUnit(start, { hp: 1000 }), attack);
    const drained = step(patchUnit(start, { hp: 1000, effects: drain }), attack);
    expect(drained.state.rng).toEqual(plain.state.rng);
    const hits = ofType(drained.events, "HitLanded").map((h) => h.damage);
    expect(ofType(drained.events, "HpRestored").map((e) => e.amount)).toEqual(
      hits.map((damage) => Math.floor(damage * 0.1)),
    );
    const gained = hits.reduce((sum, damage) => sum + Math.floor(damage * 0.1), 0);
    expect(drained.state.party[0]?.hp).toBe((plain.state.party[0]?.hp ?? 0) + gained);
  });
});

describe("bb.fill_on_damage_dealt", () => {
  const fill = (value: number, source: ActiveEffect["source"]): ActiveEffect => ({
    id: "bb.fill_on_damage_dealt",
    value,
    threshold: 50000,
    target: "party",
    source,
  });

  it("fills once per new multiple of the threshold; sources stack", () => {
    const effects = [fill(8, "leader"), fill(8, "ally_leader")];
    expect(bcFillOnDamageDealt(effects, 49000, 50200)).toBe(16);
    expect(bcFillOnDamageDealt(effects, 50200, 99999)).toBe(0);
    expect(bcFillOnDamageDealt(effects, 99999, 180000)).toBe(16);
  });

  it("fills 8 BC when a hit takes the damage-dealt tally past 50,000, and keeps the tally", () => {
    const start = duel();
    const primed = patchUnit(start, { effects: [fill(8, "leader")], damageDealt: 49999 });
    const { state, events } = step(primed, attack);
    const hits = ofType(events, "HitLanded").map((h) => h.damage);
    const fills = ofType(events, "GaugeFilled").filter(
      (e) => e.effect === "bb.fill_on_damage_dealt",
    );
    expect(fills).toHaveLength(1);
    expect(fills[0]).toMatchObject({ tick: 20, actor: "p0", target: "p0", gained: 8 });
    expect(state.party[0]?.damageDealt).toBe(49999 + hits.reduce((a, b) => a + b, 0));
    // Without the effect the tally still grows, but nothing fills.
    const bare = step(patchUnit(start, { damageDealt: 49999 }), attack);
    expect(bare.state.rng).toEqual(state.rng);
    expect((state.party[0]?.bc ?? 0) - (bare.state.party[0]?.bc ?? 0)).toBe(8);
  });
});
