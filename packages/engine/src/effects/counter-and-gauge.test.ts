import type { Effect } from "@bfr/data";
import { describe, expect, it } from "vitest";
import { evaluateEnemyAi } from "../ai/evaluate.ts";
import type { BattleEvent } from "../events.ts";
import { rollAttack } from "../formulas/damage.ts";
import { nextInt, type RngState } from "../rng.ts";
import { createBattle } from "../state/create-battle.ts";
import type { BattleEnemy, BattleState, BattleUnit } from "../state/types.ts";
import { makeEnemy, makeMember } from "../test/factories.ts";
import { endTurn } from "../turn.ts";
import type { ActiveEffect } from "./buffs.ts";
import { applyEffect } from "./index.ts";
import { refreshPassives } from "./passive.ts";

function ofType<T extends BattleEvent["type"]>(
  events: readonly BattleEvent[],
  type: T,
): Extract<BattleEvent, { type: T }>[] {
  return events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);
}

function duel(seed = 7, enemyHp = 100_000): BattleState {
  const state = createBattle(
    { squad: [makeMember("solo")], leaderIndex: 0, waves: [[makeEnemy("dummy")]] },
    seed,
  );
  return patchEnemy(state, (enemy) => ({
    ...enemy,
    hp: enemyHp,
    stats: { ...enemy.stats, hp: enemyHp },
  }));
}

function patchUnit(state: BattleState, patch: Partial<BattleUnit>): BattleState {
  return { ...state, party: state.party.map((u, i) => (i === 0 ? { ...u, ...patch } : u)) };
}

function patchEnemy(state: BattleState, patch: (enemy: BattleEnemy) => BattleEnemy): BattleState {
  return { ...state, enemies: state.enemies.map((e, i) => (i === 0 ? patch(e) : e)) };
}

// Counter damage, BB-gauge conditions and ranged BC-when-attacked (M1-06N, GAME_DESIGN §4 → Kit
// additions (M2-04H), RESOLVED-50). The test enemy normal-attacks p0 once per turn with one hit.

/** The enemy phase's draws before `afterEnemyAttack`: AI target, then crit, variance, divisor. */
function enemyAttackRng(state: BattleState): RngState {
  const enemy = state.enemies[0];
  if (!enemy) throw new Error("no enemy");
  const decision = evaluateEnemyAi({
    enemy,
    rules: enemy.ai,
    enemyTurn: 1,
    party: state.party,
    memory: enemy.aiMemory,
    rng: state.rng,
  });
  return rollAttack(decision.rng, 0).rng;
}

function withUnitEffects(state: BattleState, effects: Effect[]): BattleState {
  return patchUnit(state, {
    effects: effects.reduce<ActiveEffect[]>(
      (list, effect) => applyEffect(list, effect, effect.turns === 4 ? "ubb" : "bb"),
      [],
    ),
  });
}

const RANGED_FILL: Effect = {
  id: "bb.fill_on_hit",
  value: 0,
  min: 5,
  max: 8,
  turns: 3,
  target: "self",
};
const reflect = (chance: number, value = 0.25): Effect => ({
  id: "damage_reflect",
  value,
  chance,
  turns: 3,
  target: "self",
});

describe("ranged bb.fill_on_hit", () => {
  it("draws RandomBetween(min, max) BC once per attack, after the attack's damage draws", () => {
    // A BB/SBB ranged fill (5–8) and a UBB fixed fill (3) stack.
    const start = withUnitEffects(duel(), [
      RANGED_FILL,
      { id: "bb.fill_on_hit", value: 3, turns: 4, target: "self" },
    ]);
    const fill = nextInt(enemyAttackRng(start), 5, 8);
    const { state, events } = endTurn(start);
    expect(ofType(events, "GaugeFilled")).toEqual([
      expect.objectContaining({
        effect: "bb.fill_on_hit",
        gained: fill.value + 3,
        gauge: fill.value + 3,
      }),
    ]);
    expect(fill.value).toBeGreaterThanOrEqual(5);
    expect(fill.value).toBeLessThanOrEqual(8);
    // Nothing else draws this turn: the fill was the phase's last draw.
    expect(state.rng).toEqual(fill.rng);
  });
});

describe("damage_reflect", () => {
  /** The first seed whose counter proc draw (after the fill draw) is below / at least 20. */
  function seedWhere(procs: boolean): number {
    for (let seed = 1; seed < 500; seed++) {
      const start = withUnitEffects(duel(seed), [RANGED_FILL, reflect(20)]);
      const fill = nextInt(enemyAttackRng(start), 5, 8);
      if (nextInt(fill.rng, 0, 99).value < 20 === procs) return seed;
    }
    throw new Error("no seed");
  }

  it("counters 25% of the HP the attack cost, after the fill draw, on a proc below 20", () => {
    const start = withUnitEffects(duel(seedWhere(true)), [RANGED_FILL, reflect(20)]);
    const fill = nextInt(enemyAttackRng(start), 5, 8);
    const proc = nextInt(fill.rng, 0, 99);
    expect(proc.value).toBeLessThan(20);
    const { state, events } = endTurn(start);
    const [hit] = ofType(events, "EnemyHitLanded");
    const lost = 4000 - (hit?.unitHp ?? 0);
    const counter = Math.floor(lost * 0.25);
    expect(counter).toBeGreaterThan(0);
    expect(ofType(events, "CounterDamaged")).toEqual([
      {
        type: "CounterDamaged",
        tick: hit?.tick,
        actor: "p0",
        target: "e0",
        effect: "damage_reflect",
        damage: counter,
        hp: 100_000 - counter,
      },
    ]);
    // Order: the hit, then the gauge fill, then the counter.
    const types = events.map((e) => e.type);
    expect(types.indexOf("GaugeFilled")).toBeLessThan(types.indexOf("CounterDamaged"));
    expect(state.enemies[0]?.hp).toBe(100_000 - counter);
    expect(state.rng).toEqual(proc.rng);
  });

  it("does nothing on a failed proc, which still draws", () => {
    const start = withUnitEffects(duel(seedWhere(false)), [RANGED_FILL, reflect(20)]);
    const fill = nextInt(enemyAttackRng(start), 5, 8);
    const proc = nextInt(fill.rng, 0, 99);
    const { state, events } = endTurn(start);
    expect(ofType(events, "CounterDamaged")).toEqual([]);
    expect(state.enemies[0]?.hp).toBe(100_000);
    expect(state.rng).toEqual(proc.rng);
  });

  it("never KOs the attacker: it leaves at least 1 HP", () => {
    const start = withUnitEffects(duel(7, 50), [reflect(100, 1)]);
    const { state, events } = endTurn(start);
    expect(ofType(events, "CounterDamaged")[0]).toMatchObject({ damage: 49, hp: 1 });
    expect(ofType(events, "EnemyDefeated")).toEqual([]);
    expect(state.enemies[0]?.hp).toBe(1);
    expect(state.result).toBeUndefined();
    // A foe already at 1 HP takes no counter and no event.
    expect(ofType(endTurn(state).events, "CounterDamaged")).toEqual([]);
  });
});

describe("cond.bb_above", () => {
  /** The duel's unit with an Extra Skill: ATK +50% while its BB gauge is above 50%. */
  function gated(bc: number): BattleState {
    const state = duel();
    const unit = state.party[0];
    if (!unit) throw new Error("no unit");
    const form = {
      ...unit.form,
      extraSkill: {
        name: "Test Garden",
        effects: [
          {
            id: "cond.bb_above" as const,
            value: 0.5,
            target: "self" as const,
            effects: [
              {
                id: "passive.stat_pct" as const,
                stat: "atk" as const,
                value: 0.5,
                target: "self" as const,
              },
            ],
          },
        ],
      },
    };
    return patchUnit(state, { form, bc });
  }
  const atkPassive = (state: BattleState) =>
    state.party[0]?.effects.find((e) => e.id === "passive.stat_pct" && e.source === "extra");

  it("measures the BB gauge (cost 20) strictly above 50%, and draws nothing", () => {
    expect(atkPassive(refreshPassives(gated(10)))).toBeUndefined();
    const on = refreshPassives(gated(11));
    expect(atkPassive(on)).toMatchObject({ stat: "atk", value: 0.5 });
    expect(on.rng).toEqual(gated(11).rng);
  });

  it("is re-checked at turn start, with the gauge the turn ended on", () => {
    // No player action; the enemy's one attack adds 2 BC through a fixed fill: 10 → 12 of 20.
    const start = withUnitEffects(gated(10), [
      { id: "bb.fill_on_hit", value: 2, turns: 3, target: "self" },
    ]);
    const low = refreshPassives(start);
    expect(atkPassive(low)).toBeUndefined();
    const { state } = endTurn(low);
    expect(state.party[0]?.bc).toBe(12);
    expect(atkPassive(state)).toMatchObject({ value: 0.5 });
  });
});
