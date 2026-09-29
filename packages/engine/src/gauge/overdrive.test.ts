import { describe, expect, it } from "vitest";
import { attackTotal } from "../formulas/attack-stat.ts";
import { attackCore, hitDamage, rollAttack } from "../formulas/damage.ts";
import { guardMultiplier } from "../formulas/mitigation.ts";
import { createBattle } from "../state/create-battle.ts";
import type { BattleSetup, BattleState } from "../state/types.ts";
import { step } from "../step.ts";
import { makeEnemy, makeSetup, makeUnit, singleTargetShapes } from "../test/factories.ts";
import {
  actionOdYield,
  activateOd,
  addOd,
  createOdGauge,
  endOverdriveTurn,
  instantOdFill,
  OD_LIMIT_MAX,
  turnEndOdYield,
} from "./overdrive.ts";

const attack = {
  moveType: "ranged" as const,
  startDelayFrames: 0,
  hitFrames: [0],
  damageDistribution: [100],
  dropChecks: 0,
};

/** p0 is an Omni fire unit with BB 25 / SBB 20 / UBB 30 and a one-hit normal attack; p1 has no UBB. */
function setup(enemyElement: "earth" | "light" = "light"): BattleSetup {
  const base = makeSetup(2);
  const unit = makeUnit("od");
  const form = unit.forms[0];
  if (!form) throw new Error("missing form");
  const bb = { ...form.bursts.bb, cost: 25, attacks: [attack], effects: singleTargetShapes(1, 3) };
  const omni = {
    ...form,
    rarity: "omni" as const,
    normalAttack: attack,
    bursts: { bb, sbb: { ...bb, cost: 20 }, ubb: { ...bb, cost: 30 } },
  };
  const member = base.squad[0];
  if (!member) throw new Error("missing member");
  return {
    ...base,
    squad: [
      { ...member, unit: { ...unit, forms: [omni] }, formId: omni.id },
      ...base.squad.slice(1),
    ],
    waves: [[{ ...makeEnemy("dummy"), element: enemyElement }]],
  };
}

function withOd(state: BattleState, points: number): BattleState {
  return { ...state, od: { ...state.od, points } };
}

describe("OD gauge values", () => {
  it("yields 300/100/200 per action, +100 against a weak enemy, and 500 at turn end", () => {
    // GAME_DESIGN OD 1: three normal attacks (one vs a weak enemy), one BB, one SBB, turn end.
    const yields =
      2 * actionOdYield("attack") +
      actionOdYield("attack", 1) +
      actionOdYield("bb") +
      actionOdYield("sbb") +
      turnEndOdYield();
    expect(yields).toBe(1800);
    expect(addOd(createOdGauge(), yields)).toEqual({ points: 1800, limit: 10_000 });
    expect(actionOdYield("ubb", 1)).toBe(100);
  });

  it("boosts action and turn-end yields by OD fill rate but not the weak bonus", () => {
    expect(actionOdYield("attack", 0, 0.2)).toBe(360);
    expect(actionOdYield("attack", 1, 0.2)).toBe(460);
    expect(turnEndOdYield(0.2)).toBe(600);
  });

  it("caps at the limit, fills instantly by % of the limit, and grows the limit to 40,000", () => {
    expect(addOd({ points: 9900, limit: 10_000 }, 300).points).toBe(10_000);
    expect(instantOdFill({ points: 0, limit: 15_000 }, 0.1).points).toBe(1500);
    let od = { points: 10_000, limit: 10_000 };
    const limits: number[] = [];
    for (let i = 0; i < 7; i++) {
      od = activateOd(od);
      limits.push(od.limit);
    }
    expect(limits).toEqual([15_000, 20_000, 25_000, 30_000, 35_000, 40_000, OD_LIMIT_MAX]);
    expect(od.points).toBe(0);
  });

  it("leaves Overdrive Mode with an empty BB gauge after 4 turns", () => {
    let unit = { overdrive: true, overdriveTurns: 4, bc: 12 };
    for (let turn = 1; turn <= 3; turn++) {
      unit = endOverdriveTurn(unit);
      expect(unit).toEqual({ overdrive: true, overdriveTurns: 4 - turn, bc: 12 });
    }
    expect(endOverdriveTurn(unit)).toEqual({ overdrive: false, overdriveTurns: 0, bc: 0 });
    const idle = { overdrive: false, overdriveTurns: 0, bc: 7 };
    expect(endOverdriveTurn(idle)).toBe(idle);
  });
});

describe("OD gauge in step", () => {
  it("fills from actions, with the weak-element bonus, and emits OdGained", () => {
    const start = { ...createBattle(setup("earth"), 3) };
    const bc = start.party.map((u, i) => (i === 0 ? { ...u, bc: 25 } : u));
    const { state, events } = step({ ...start, party: bc }, [
      { type: "burst", tick: 0, actor: "p0", tier: "bb" },
      { type: "attack", tick: 0, actor: "p1" },
    ]);
    const gained = events.filter((e) => e.type === "OdGained");
    // Both units are fire and the enemy is earth: BB 100 + 100, attack 300 + 100.
    expect(gained.map((e) => [e.actor, e.gained, e.points])).toEqual([
      ["p0", 200, 200],
      ["p1", 400, 600],
    ]);
    expect(state.od).toEqual({ points: 600, limit: 10_000 });
    const neutral = step(createBattle(setup("light"), 3), [
      { type: "attack", tick: 0, actor: "p0" },
    ]);
    expect(neutral.state.od.points).toBe(300);
  });

  it("activates Overdrive Mode only for a UBB-capable unit when the gauge is full", () => {
    const start = createBattle(setup(), 3);
    const od = (actor: "p0" | "p1") => [{ type: "overdrive" as const, tick: 0, actor }];
    expect(step(withOd(start, 9999), od("p0")).events).toEqual([
      { type: "ActionRejected", tick: 0, actor: "p0", reason: "od_not_full" },
    ]);
    expect(step(withOd(start, 10_000), od("p1")).events).toEqual([
      { type: "ActionRejected", tick: 0, actor: "p1", reason: "not_ubb_capable" },
    ]);
    const { state, events } = step(withOd(start, 10_000), od("p0"));
    expect(events).toEqual([
      {
        type: "OverdriveActivated",
        tick: 0,
        actor: "p0",
        limitBefore: 10_000,
        limitAfter: 15_000,
        turns: 4,
      },
    ]);
    expect(state.od).toEqual({ points: 0, limit: 15_000 });
    expect(state.party[0]).toMatchObject({ overdrive: true, overdriveTurns: 4, bc: 0 });
    expect(state.acted).toEqual([]);
    expect(step(withOd(state, 15_000), od("p0")).events).toEqual([
      { type: "ActionRejected", tick: 0, actor: "p0", reason: "already_overdrive" },
    ]);
  });

  it("gives +100% ATK in Overdrive Mode, lets the unit act, and ends the mode on UBB", () => {
    const start = withOd(createBattle(setup(), 5), 10_000);
    const atkTotal = attackTotal({ atk: 1400, statMods: 1, bbModifier: 3 });
    const active = step(start, [{ type: "overdrive", tick: 0, actor: "p0" }]).state;
    const charged = {
      ...active,
      party: active.party.map((u, i) => (i === 0 ? { ...u, bc: 30 } : u)),
    };
    const draw = rollAttack(charged.rng, 0);
    const core = attackCore({ atkTotal, targetDef: 500, rolls: draw.value, elementMult: 1 });
    const { state, events } = step(charged, [{ type: "burst", tick: 0, actor: "p0", tier: "ubb" }]);
    expect(events.find((e) => e.type === "HitLanded")).toMatchObject({
      damage: hitDamage(core, 100),
    });
    expect(state.party[0]).toMatchObject({ overdrive: false, overdriveTurns: 0, bc: 0 });
    expect(events.some((e) => e.type === "OdGained")).toBe(false);
  });
});

describe("guard", () => {
  it("uses the unit's action, marks it guarding, and gives no base BB fill", () => {
    const start = createBattle(setup(), 3);
    const { state, events } = step(start, [
      { type: "guard", tick: 0, actor: "p0" },
      { type: "attack", tick: 1, actor: "p0" },
    ]);
    expect(events).toEqual([
      { type: "Guarded", tick: 0, actor: "p0" },
      { type: "ActionRejected", tick: 1, actor: "p0", reason: "already_acted" },
    ]);
    expect(state.party[0]).toMatchObject({ guarding: true, bc: 0 });
    expect(state.acted).toEqual(["p0"]);
    expect(state.od.points).toBe(0);
    expect(state.rng).toEqual(start.rng);
  });

  it("halves damage taken, less guard bonuses (GAME_DESIGN §3 Case 5)", () => {
    expect(Math.floor(1285 * guardMultiplier(true))).toBe(642);
    expect(guardMultiplier(true, 0.2)).toBeCloseTo(0.3);
    expect(guardMultiplier(true, 0.7)).toBe(0);
    expect(guardMultiplier(false)).toBe(1);
  });
});
