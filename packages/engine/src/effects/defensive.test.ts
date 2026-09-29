import type { Effect } from "@bfr/data";
import { describe, expect, it } from "vitest";
import { evaluateEnemyAi } from "../ai/evaluate.ts";
import type { BattleEvent } from "../events.ts";
import { attackTotal } from "../formulas/attack-stat.ts";
import { critMultiplier } from "../formulas/crit.ts";
import { attackCore, hitDamage, rollAttack } from "../formulas/damage.ts";
import { elementMultiplier } from "../formulas/element.ts";
import { createRng, nextInt, type RngState } from "../rng.ts";
import { createBattle } from "../state/create-battle.ts";
import type { BattleState, BattleUnit, EnemySetup } from "../state/types.ts";
import { step } from "../step.ts";
import { makeEnemy, makeMember } from "../test/factories.ts";
import { endTurn } from "../turn.ts";
import { type ActiveEffect, defConversionAtk } from "./buffs.ts";
import { bcFillOnDamageTaken } from "./gauge.ts";
import { applyEffect } from "./index.ts";
import { refreshPassives } from "./passive.ts";
import {
  absorbWithBarrier,
  critResistance,
  rollChanceMitigation,
  triggeredMitigation,
} from "./survival.ts";

// Garrick's defensive effects (M1-06H, GAME_DESIGN §4 Kit additions (M2-04C)). The test unit has
// ATK 1400, DEF 1100, HP 4000 and is Fire; the test enemy is Earth (Earth → Fire is ×0.5).

function ofType<T extends BattleEvent["type"]>(
  events: readonly BattleEvent[],
  type: T,
): Extract<BattleEvent, { type: T }>[] {
  return events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);
}

const burst = (effects: readonly ActiveEffect[], effect: Effect): ActiveEffect[] =>
  applyEffect(effects, effect, "bb");

function duel(enemy: EnemySetup = makeEnemy("brute"), seed = 3): BattleState {
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

/** A 2-hit normal attack (50/50) so a mid-attack trigger affects the second hit. */
const twoHitBrute: EnemySetup = {
  ...makeEnemy("brute"),
  stats: { hp: 99999, atk: 6000, def: 500, rec: 100 },
  normalAttack: {
    moveType: "melee",
    startDelayFrames: 20,
    hitFrames: [0, 10],
    damageDistribution: [50, 50],
    dropChecks: 0,
  },
};

/** The brute's per-attack core against the test unit (DEF 1100, Fire) for the given draws. */
function bruteCore(rng: RngState): { core: number; rng: RngState } {
  const rolls = rollAttack(rng, 0);
  return {
    core: attackCore({
      atkTotal: 6000,
      targetDef: 1100,
      rolls: rolls.value,
      elementMult: elementMultiplier({ attacker: "earth", defender: "fire" }),
    }),
    rng: rolls.rng,
  };
}

describe("buff.atk_from_def (Parameter Conversion)", () => {
  it("adds value × total DEF after the % sum: the wiki's Arumat example and a UBB-style case", () => {
    // Wiki: 11600 ATK + 80% of 2000 DEF = 13200.
    expect(attackTotal({ atk: 11600, converted: 0.8 * 2000 })).toBe(13200);
    // ATK 1400 with a 300% burst: 1400 × 4 = 5600; DEF 1100 × (1 + 1.6) = 2860; 250% → +7150.
    const effects = burst([], { id: "buff.atk_from_def", value: 2.5, turns: 3, target: "self" });
    expect(defConversionAtk(effects, 2860)).toBe(7150);
    expect(attackTotal({ atk: 1400, bbModifier: 3, converted: 7150 })).toBe(12750);
    // The stat cap still applies to the total.
    expect(attackTotal({ atk: 90000, converted: 20000 })).toBe(99999);
  });

  it("raises a party unit's attack damage by 250% of its buffed DEF", () => {
    const start = duel(makeEnemy("dummy"));
    let effects = burst([], { id: "buff.def", value: 1.6, turns: 3, target: "self" });
    effects = burst(effects, { id: "buff.atk_from_def", value: 2.5, turns: 3, target: "self" });
    const buffed = patchUnit(start, { effects });
    const { events } = step(buffed, [{ type: "attack", tick: 0, actor: "p0" }]);
    // atk_total = 1400 + floor(2.5 × 2860) = 8550; Fire → Earth ×1.5; enemy DEF 500.
    const rolls = rollAttack(start.rng, 0);
    const core = attackCore({
      atkTotal: 8550,
      targetDef: 500,
      rolls: rolls.value,
      elementMult: 1.5,
    });
    const hits = ofType(events, "HitLanded").map((hit) => hit.damage);
    expect(hits).toEqual([hitDamage(core, 50), hitDamage(core, 50)]);
    const plain = ofType(
      step(start, [{ type: "attack", tick: 0, actor: "p0" }]).events,
      "HitLanded",
    );
    expect(hits[0]).toBeGreaterThan((plain[0]?.damage ?? 0) * 5);
  });
});

describe("crit_resist", () => {
  it("scales the crit bonus before the cap; 1 negates it", () => {
    expect(critMultiplier(0.5, 0.5, 1)).toBe(1);
    expect(critMultiplier(0.5, 0.5, 0.5)).toBe(1.5);
    expect(critMultiplier(0.6, 6, 0)).toBe(7);
    expect(
      critResistance(burst([], { id: "crit_resist", value: 1.5, turns: 1, target: "self" })),
    ).toBe(1);
  });

  it("stops a 100%-crit enemy from critting the unit, drawing the same RNG", () => {
    const base = duel();
    const enemies = base.enemies.map((enemy) => ({
      ...enemy,
      effects: burst([], { id: "buff.crit_rate", value: 1, turns: 3, target: "self" }),
    }));
    const start = { ...base, enemies };
    const open = endTurn(start);
    expect(ofType(open.events, "EnemyHitLanded")[0]?.critical).toBe(true);
    const resisted = patchUnit(start, {
      effects: burst([], { id: "crit_resist", value: 1, turns: 3, target: "self" }),
    });
    const closed = endTurn(resisted);
    expect(ofType(closed.events, "EnemyHitLanded")[0]?.critical).toBe(false);
    expect(closed.state.rng).toEqual(open.state.rng);
  });
});

describe("chance_mitigation", () => {
  it("draws one [0, 99] integer per effect and adds value on a proc", () => {
    const rng = createRng(11);
    const effects = [
      ...burst([], { id: "chance_mitigation", value: 0.2, chance: 20, turns: 3, target: "self" }),
    ];
    const draw = nextInt(rng, 0, 99);
    expect(rollChanceMitigation(effects, rng)).toEqual({
      value: draw.value < 20 ? 0.2 : 0,
      rng: draw.rng,
    });
    const sure = burst([], { id: "chance_mitigation", value: 0.2, turns: 3, target: "self" });
    expect(rollChanceMitigation(sure, rng)).toEqual({ value: 0.2, rng });
  });

  it("adds a procced 20% to passive mitigation, capped at 50% with other passives", () => {
    const start = duel(twoHitBrute);
    const { core } = bruteCore(afterAi(start));
    const sure: ActiveEffect = {
      id: "chance_mitigation",
      value: 0.2,
      target: "self",
      source: "extra",
    };
    const [hit] = ofType(endTurn(patchUnit(start, { effects: [sure] })).events, "EnemyHitLanded");
    expect(hit?.damage).toBe(hitDamage(core, 50, { mitigation: 0.8 }));
    // 40% passive mitigation + 20% proc = 60%, capped at 50%.
    const passive: ActiveEffect = {
      id: "mitigation",
      value: 0.4,
      target: "self",
      source: "leader",
    };
    const [capped] = ofType(
      endTurn(patchUnit(start, { effects: [passive, sure] })).events,
      "EnemyHitLanded",
    );
    expect(capped?.damage).toBe(hitDamage(core, 50, { mitigation: 0.5 }));
  });

  it("rolls its chance after the attack's damage draws", () => {
    const start = duel(twoHitBrute);
    const { core, rng } = bruteCore(afterAi(start));
    const proc = nextInt(rng, 0, 99);
    const chance = proc.value + 1; // procs on this draw
    const effect: ActiveEffect = {
      id: "chance_mitigation",
      value: 0.2,
      chance,
      target: "self",
      source: "extra",
    };
    const { state, events } = endTurn(patchUnit(start, { effects: [effect] }));
    expect(ofType(events, "EnemyHitLanded").map((hit) => hit.damage)).toEqual([
      hitDamage(core, 50, { mitigation: 0.8 }),
      hitDamage(core, 50, { mitigation: 0.8 }),
    ]);
    expect(state.rng).toEqual(proc.rng);
  });
});

describe("bb.fill_on_damage_taken", () => {
  it("fills once per threshold crossed; sources stack (wiki: 8 + 10 BC at 5000)", () => {
    const effects: ActiveEffect[] = [
      {
        id: "bb.fill_on_damage_taken",
        value: 8,
        threshold: 5000,
        target: "party",
        source: "leader",
      },
      {
        id: "bb.fill_on_damage_taken",
        value: 10,
        threshold: 5000,
        target: "party",
        source: "ally_leader",
      },
    ];
    expect(bcFillOnDamageTaken(effects, 4000, 5200)).toBe(18);
    expect(bcFillOnDamageTaken(effects, 5200, 9999)).toBe(0);
    expect(bcFillOnDamageTaken(effects, 9999, 10000)).toBe(18);
  });

  it("fills 8 BC when an enemy hit takes the tally past 5000, and keeps the tally in state", () => {
    const start = duel(twoHitBrute);
    const { core } = bruteCore(afterAi(start));
    const fill: ActiveEffect = {
      id: "bb.fill_on_damage_taken",
      value: 8,
      threshold: 5000,
      target: "party",
      source: "leader",
    };
    const primed = patchUnit(start, { effects: [fill], damageTaken: 4999 });
    const { state, events } = endTurn(primed);
    const hit = hitDamage(core, 50);
    expect(ofType(events, "GaugeFilled")).toEqual([
      {
        type: "GaugeFilled",
        tick: 20,
        actor: "p0",
        target: "p0",
        effect: "bb.fill_on_damage_taken",
        gained: 8,
        gauge: 8,
      },
    ]);
    expect(state.party[0]).toMatchObject({ bc: 8, damageTaken: 4999 + 2 * hit });
  });
});

describe("mitigation_after_damage", () => {
  const trigger = (threshold: number, value: number): ActiveEffect => ({
    id: "mitigation_after_damage",
    value,
    threshold,
    triggerTurns: 1,
    target: "self",
    source: "extra",
  });

  it("picks the crossed trigger with the highest threshold", () => {
    const effects = [trigger(5000, 0.2), trigger(10000, 0.25)];
    expect(triggeredMitigation(effects, 9000, 10500)).toMatchObject({
      id: "mitigation",
      value: 0.25,
      turns: 2,
      source: "triggered",
    });
    expect(triggeredMitigation(effects, 4000, 6000)?.value).toBe(0.2);
    expect(triggeredMitigation(effects, 6000, 9000)).toBeUndefined();
  });

  it("keeps the skill's turns as triggerTurns when materialised from an Extra Skill", () => {
    const base = duel();
    const unit = base.party[0];
    if (!unit) throw new Error("no unit");
    const form = {
      ...unit.form,
      extraSkill: {
        name: "Bulwark",
        effects: [
          {
            id: "mitigation_after_damage" as const,
            value: 0.25,
            threshold: 10000,
            turns: 1,
            target: "self" as const,
          },
        ],
      },
    };
    const state = refreshPassives(patchUnit(base, { form }));
    expect(state.party[0]?.effects.find((e) => e.id === "mitigation_after_damage")).toMatchObject({
      triggerTurns: 1,
      source: "extra",
    });
  });

  it("cuts the rest of the attack by 25% once 10,000 damage is reached, through the next turn", () => {
    const start = duel(twoHitBrute);
    const { core } = bruteCore(afterAi(start));
    const primed = patchUnit(start, {
      hp: 4000,
      effects: [trigger(10000, 0.25)],
      damageTaken: 9999,
    });
    const first = endTurn(primed);
    const hits = ofType(first.events, "EnemyHitLanded").map((hit) => hit.damage);
    expect(hits).toEqual([hitDamage(core, 50), hitDamage(core, 50, { mitigation: 0.75 })]);
    expect(ofType(first.events, "EffectTriggered")).toEqual([
      {
        type: "EffectTriggered",
        tick: 20,
        target: "p0",
        effect: "mitigation_after_damage",
        value: 0.25,
        turns: 2,
      },
    ]);
    // It survives the end-of-turn tick and passive refresh with 1 turn left …
    const kept = first.state.party[0]?.effects.find((e) => e.source === "triggered");
    expect(kept).toMatchObject({ id: "mitigation", value: 0.25, turns: 1 });
    // … covers the next enemy phase, then expires.
    const second = endTurn(patchUnit(first.state, { hp: 4000 }));
    const [next] = ofType(second.events, "EnemyHitLanded");
    const nextCore = bruteCore(afterAi(patchUnit(first.state, { hp: 4000 }))).core;
    expect(next?.damage).toBe(hitDamage(nextCore, 50, { mitigation: 0.75 }));
    expect(second.state.party[0]?.effects.some((e) => e.source === "triggered")).toBe(false);
  });
});

describe("barrier", () => {
  it("absorbs a hit that fits its HP; a breaking hit passes on the unabsorbed share", () => {
    const effects = burst([], { id: "barrier", value: 2000, element: "earth", target: "party" });
    const held = absorbWithBarrier(effects, 1500, 1500);
    expect(held).toMatchObject({ damage: 0, absorbed: 1500, barrierHp: 500 });
    expect(held.effects[0]?.value).toBe(500);
    // Barrier takes 1000 of which 500 fits: half the unit's 1500 hit gets through.
    const broken = absorbWithBarrier(held.effects, 1500, 1000);
    expect(broken).toEqual({ damage: 750, absorbed: 500, barrierHp: 0, effects: [] });
    expect(absorbWithBarrier([], 1500, 1500)).toMatchObject({ damage: 1500, absorbed: 0 });
  });

  it("is one per combatant: a new barrier replaces the old whatever its slot", () => {
    const first = burst([], { id: "barrier", value: 2000, target: "party" });
    const second = applyEffect(first, { id: "barrier", value: 3000, target: "party" }, "ubb");
    expect(second).toEqual([{ id: "barrier", value: 3000, target: "party", source: "ubb" }]);
  });

  it("takes enemy hits at 0 DEF and its own element before the unit's HP", () => {
    const start = duel(twoHitBrute);
    const rolls = rollAttack(afterAi(start), 0);
    // Against an Earth barrier the Earth brute is neutral (×1.0) and DEF is 0.
    const barrierCore = attackCore({
      atkTotal: 6000,
      targetDef: 0,
      rolls: rolls.value,
      elementMult: 1,
    });
    const shielded = patchUnit(start, {
      effects: burst([], { id: "barrier", value: 50000, element: "earth", target: "party" }),
    });
    const { state, events } = endTurn(shielded);
    const [a, b] = ofType(events, "EnemyHitLanded");
    const absorbed = hitDamage(barrierCore, 50);
    expect(a).toMatchObject({ damage: 0, absorbed, barrierHp: 50000 - absorbed, unitHp: 4000 });
    expect(b).toMatchObject({ damage: 0, absorbed, barrierHp: 50000 - 2 * absorbed });
    expect(state.party[0]?.effects.find((e) => e.id === "barrier")?.value).toBe(
      50000 - 2 * absorbed,
    );
    expect(state.party[0]?.damageTaken).toBe(0);
  });
});
