import type { Burst, Effect } from "@bfr/data";
import { describe, expect, it } from "vitest";
import type { BattleEvent } from "../events.ts";
import { nextFloat } from "../rng.ts";
import { createBattle } from "../state/create-battle.ts";
import type { BattleEnemy, BattleState, BattleUnit } from "../state/types.ts";
import { step } from "../step.ts";
import { makeEnemy, makeMember } from "../test/factories.ts";
import { endTurn, playTurn } from "../turn.ts";
import { dotDamage, dotTickDamage } from "./ailments.ts";
import { attackCritRate } from "./attack.ts";
import type { ActiveEffect } from "./buffs.ts";
import { applyEffect } from "./index.ts";

// Damage over time and attack crit bonuses (M1-06M, GAME_DESIGN §4 → Kit additions (M2-04H)). The test
// unit is Fire with 1,400 ATK; the test enemy is Earth with 500 DEF (Fire is strong against it).

function ofType<T extends BattleEvent["type"]>(
  events: readonly BattleEvent[],
  type: T,
): Extract<BattleEvent, { type: T }>[] {
  return events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);
}

const DOT: Effect = { id: "debuff.dot", value: 5, flatAtk: 100, turns: 3, target: "enemies" };

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

/** A paralyzed enemy loses its action, so the end-of-turn tick is the only thing that happens. */
function paralyze(state: BattleState): BattleState {
  return patchEnemy(state, (enemy) => ({
    ...enemy,
    effects: applyEffect(
      enemy.effects,
      { id: "ailment.inflict.paralysis", value: 100, turns: 1, target: "enemy" },
      "bb",
    ),
  }));
}

/** Gives the unit a BB (cost 20, gauge full) with the given attacks and effects. */
function withBurst(state: BattleState, effects: Effect[], hits = 0): BattleState {
  const unit = state.party[0];
  if (!unit) throw new Error("no unit");
  const bb: Burst = {
    name: "Test Burst",
    cost: 20,
    attacks:
      hits === 0
        ? []
        : [
            {
              moveType: "melee",
              startDelayFrames: 20,
              hitFrames: [0],
              damageDistribution: [100],
              dropChecks: 0,
            },
          ],
    effects,
  };
  const form = { ...unit.form, bursts: { ...unit.form.bursts, bb } };
  return patchUnit(state, { form, bc: 20 });
}

const burst = [{ type: "burst" as const, tick: 0, actor: "p0" as const, tier: "bb" as const }];

const stored = (value: number, source: ActiveEffect["source"] = "bb"): ActiveEffect => ({
  ...DOT,
  value,
  source,
  dotAtk: 1400,
  dotElement: "fire",
});

describe("debuff.dot damage", () => {
  it("follows the BF Wiki DoT formula with the element multiplier and no variance", () => {
    // ((1,400 + 100) × (5 + 1) − 600 / 3) = 8,800, then × element.
    const dot = stored(5);
    expect(dotTickDamage(dot, 600, "earth")).toBe(13_200); // Fire strong: × 1.5
    expect(dotTickDamage(dot, 600, "thunder")).toBe(8_800); // neutral
    expect(dotTickDamage(dot, 600, "water")).toBe(4_400); // Water resists Fire: × 0.5
    // floor((9,000 − 500 / 3) × 1.5) = floor(13,250) = 13,250.
    expect(dotTickDamage(dot, 500, "earth")).toBe(13_250);
    // A DEF term above the ATK term still deals 1 (RESOLVED-49 item 5).
    expect(dotTickDamage(dot, 99_999, "earth")).toBe(1);
  });

  it("sums a BB/SBB and a UBB DoT, which occupy separate slots", () => {
    let effects = applyEffect([], stored(5), "bb");
    effects = applyEffect(effects, stored(8), "sbb"); // replaces the BB DoT
    effects = applyEffect(effects, stored(15), "ubb");
    expect(effects.map((e) => [e.value, e.source])).toEqual([
      [8, "sbb"],
      [15, "ubb"],
    ]);
    // (1,500 × 9 − 200) × 1.5 = 19,950 and (1,500 × 16 − 200) × 1.5 = 35,700.
    expect(dotDamage(effects, 600, "earth")).toBe(19_950 + 35_700);
  });

  it("is blocked by debuff.null, which leaves an existing DoT ticking", () => {
    const nulled = applyEffect(
      [],
      { id: "debuff.null", value: 0, turns: 3, target: "enemy" },
      "bb",
    );
    expect(applyEffect(nulled, stored(5), "bb").some((e) => e.id === "debuff.dot")).toBe(false);
    const dotted = applyEffect(applyEffect([], stored(5), "bb"), nulled[0] as ActiveEffect, "bb");
    expect(dotDamage(dotted, 600, "earth")).toBe(13_200);
    // Status cure does not remove it (BF Wiki *DoT*: only purged).
    const cured = applyEffect(dotted, { id: "ailment.cure", value: 0, target: "enemy" }, "bb");
    expect(cured.some((e) => e.id === "debuff.dot")).toBe(true);
  });
});

describe("debuff.dot in battle", () => {
  it("snapshots the inflicter's ATK and element and ticks at end of turn, three times", () => {
    const start = withBurst(duel(), [DOT]);
    const afterBurst = step(start, burst).state;
    const held = afterBurst.enemies[0]?.effects.find((e) => e.id === "debuff.dot");
    expect(held).toMatchObject({ value: 5, flatAtk: 100, turns: 3, dotAtk: 1400 });
    expect(held?.dotElement).toBe("fire");

    // floor(((1,400 + 100) × 6 − 500 / 3) × 1.5) = 13,250 per tick; the DoT draws no RNG.
    let state = paralyze(afterBurst);
    const withoutDot = endTurn(
      patchEnemy(state, (e) => ({ ...e, effects: e.effects.filter((x) => x.id !== "debuff.dot") })),
    );
    const turn1 = endTurn(state);
    expect(turn1.state.rng).toEqual(withoutDot.state.rng);
    const ticks1 = ofType(turn1.events, "TurnDamaged");
    expect(ticks1).toEqual([
      expect.objectContaining({ target: "e0", effect: "debuff.dot", damage: 13_250, hp: 86_750 }),
    ]);
    // HoT and the rest follow the DoT (§2 step 1 before step 2).
    const types = turn1.events.map((e) => e.type);
    expect(types.indexOf("TurnDamaged")).toBeLessThan(types.indexOf("OdGained"));

    state = turn1.state;
    const hps: number[] = [];
    for (let i = 0; i < 3; i++) {
      const turn = endTurn(paralyze(state));
      hps.push(...ofType(turn.events, "TurnDamaged").map((e) => e.hp));
      state = turn.state;
    }
    // Two more ticks (turns 2 and 3); the effect expired after its third tick.
    expect(hps).toEqual([73_500, 60_250]);
    expect(state.enemies[0]?.effects.some((e) => e.id === "debuff.dot")).toBe(false);
  });

  it("can KO its holder, which ends the battle", () => {
    const start = paralyze(step(withBurst(duel(7, 10_000), [DOT]), burst).state);
    const { state, events } = endTurn(start);
    expect(ofType(events, "TurnDamaged")[0]).toMatchObject({ damage: 13_250, hp: 0 });
    expect(ofType(events, "EnemyDefeated")[0]).toMatchObject({ target: "e0" });
    expect(state.result).toBe("win");
  });

  it("damages a party unit against its total DEF", () => {
    // An Earth enemy's DoT (800 ATK, 100%) on the Fire unit (1,100 DEF): Fire resists Earth.
    const dot: ActiveEffect = {
      id: "debuff.dot",
      value: 1,
      turns: 3,
      target: "enemies",
      source: "bb",
      dotAtk: 800,
      dotElement: "earth",
    };
    const start = paralyze(patchUnit(duel(), { effects: [dot] }));
    const { events } = endTurn(start);
    // floor((800 × 2 − 1,100 / 3) × 0.5) = floor(616.67) = 616.
    expect(ofType(events, "TurnDamaged")[0]).toMatchObject({
      target: "p0",
      effect: "debuff.dot",
      damage: 616,
      hp: 4000 - 616,
    });
  });
});

describe("critRate on attack shapes", () => {
  it("adds its % points to the crit-rate buffs, then applies crit resistance", () => {
    expect(attackCritRate(0, 20, 0)).toBeCloseTo(0.2);
    expect(attackCritRate(0.1, 20, 0.5)).toBeCloseTo(0.15);
    expect(attackCritRate(0.3, 0, 0)).toBeCloseTo(0.3);
  });

  it("raises that attack's crit chance: the one crit draw lands below 20%", () => {
    // The burst's first draw is the attack's crit roll (no refund, DEF-ignore, or ailment draws).
    // Find the first seed whose crit draw is in [0, 0.2): it crits only with the +20% bonus.
    let seed = 1;
    let draw = 1;
    for (; seed < 500; seed++) {
      draw = nextFloat(duel(seed).rng).value;
      if (draw < 0.2) break;
    }
    expect(draw).toBeLessThan(0.2);
    const shape = (critRate?: number): Effect => ({
      id: "attack.st",
      value: 3,
      target: "enemy",
      ...(critRate === undefined ? {} : { critRate }),
    });
    const land = (critRate?: number) =>
      ofType(playTurn(withBurst(duel(seed), [shape(critRate)], 1), burst).events, "HitLanded")[0];
    expect(land()?.critical).toBe(false);
    expect(land(20)?.critical).toBe(true);
  });
});
