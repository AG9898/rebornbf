import type { Effect } from "@bfr/data";
import { describe, expect, it } from "vitest";
import { createRng, nextInt } from "../rng.ts";
import { createBattle } from "../state/create-battle.ts";
import type { BattleState, BattleUnit } from "../state/types.ts";
import { step } from "../step.ts";
import { makeSetup } from "../test/factories.ts";
import {
  AILMENT_HANDLERS,
  AILMENT_IDS,
  AILMENTS,
  type Ailment,
  ailmentTurns,
  isCursed,
  isParalyzed,
  poisonDamage,
  rollInfliction,
  statPenalty,
} from "./ailments.ts";
import type { ActiveEffect } from "./buffs.ts";
import { fillGauge } from "./gauge.ts";
import { applyEffect, EFFECT_REGISTRY, tickEffects } from "./index.ts";

const effect = (
  id: Effect["id"],
  value: number,
  turns?: number,
  target: Effect["target"] = "enemy",
): Effect => ({ id, value, ...(turns === undefined ? {} : { turns }), target });

const inflicted = (ailment: Ailment, turns = 3): ActiveEffect[] =>
  applyEffect([], effect(`ailment.inflict.${ailment}`, 100, turns), "bb");

/** Ticks `effects` until empty; returns how many end-of-turn steps it took. */
function turnsActive(effects: readonly ActiveEffect[]): number {
  let current = effects;
  let turns = 0;
  while (current.length > 0) {
    current = tickEffects(current);
    turns += 1;
  }
  return turns;
}

function withBurstEffects(effects: Effect[]): ReturnType<typeof makeSetup> {
  const setup = makeSetup(2);
  return {
    ...setup,
    squad: setup.squad.map((member, i) => {
      const form = member.unit.forms[0];
      if (i !== 0 || !form?.bursts.bb) return member;
      return {
        ...member,
        unit: {
          ...member.unit,
          forms: [{ ...form, bursts: { bb: { ...form.bursts.bb, effects } } }],
        },
      };
    }),
  };
}

function patchUnit(state: BattleState, patch: Partial<BattleUnit>): BattleState {
  return {
    ...state,
    party: state.party.map((unit) => (unit.slot === "p0" ? { ...unit, ...patch } : unit)),
  };
}

describe("ailments and debuffs", () => {
  it("registers one handler per ailment and debuff ID", () => {
    for (const id of AILMENT_IDS) {
      expect(EFFECT_REGISTRY[id]).toBe(AILMENT_HANDLERS[id]);
    }
  });

  it("ailments last 3 turns on player units; curse and paralysis 1 turn on enemies", () => {
    for (const ailment of AILMENTS) {
      expect(ailmentTurns(ailment, "party")).toBe(3);
      const onEnemy = ailment === "curse" || ailment === "paralysis" ? 1 : 3;
      expect(ailmentTurns(ailment, "enemy")).toBe(onEnemy);
    }
  });

  it("rolls the infliction chance with one 0–99 draw and attaches the rule duration", () => {
    const rng = createRng(7);
    const draw = nextInt(rng, 0, 99).value;
    const poison = {
      ...effect("ailment.inflict.poison", draw + 1),
      id: "ailment.inflict.poison" as const,
    };
    const hit = rollInfliction(rng, poison, "party");
    expect(hit.effect).toEqual({ ...poison, turns: 3 });
    expect(hit.rng).toEqual(nextInt(rng, 0, 99).rng);
    expect(rollInfliction(rng, { ...poison, value: draw }, "party").effect).toBeUndefined();
    expect(rollInfliction(rng, { ...poison, value: 0 }, "party").effect).toBeUndefined();
    const curse = { ...effect("ailment.inflict.curse", 100), id: "ailment.inflict.curse" as const };
    expect(rollInfliction(rng, curse, "enemy").effect?.turns).toBe(1);
  });

  it("re-inflicting an ailment refreshes it instead of stacking", () => {
    const once = inflicted("poison", 1);
    const again = applyEffect(once, effect("ailment.inflict.poison", 100, 3), "sbb");
    expect(again).toHaveLength(1);
    expect(again[0]?.turns).toBe(3);
  });

  it("poison deals 10% of max HP each end of turn while it lasts", () => {
    const poisoned = inflicted("poison");
    expect(poisonDamage(poisoned, 4000)).toBe(400);
    expect(poisonDamage(poisoned, 4005)).toBe(400);
    expect(poisonDamage(tickEffects(tickEffects(poisoned)), 4000)).toBe(400);
    expect(poisonDamage(tickEffects(tickEffects(tickEffects(poisoned))), 4000)).toBe(0);
    expect(poisonDamage([], 4000)).toBe(0);
    expect(turnsActive(poisoned)).toBe(3);
  });

  it.each([
    ["injury", "atk"],
    ["weak", "def"],
    ["sick", "rec"],
  ] as const)("%s subtracts 50% from %s stat_mods until it expires", (ailment, stat) => {
    let active = inflicted(ailment);
    for (let turn = 0; turn < 3; turn++) {
      expect(statPenalty(active, stat)).toBe(0.5);
      for (const other of ["atk", "def", "rec"] as const) {
        if (other !== stat) expect(statPenalty(active, other)).toBe(0);
      }
      active = tickEffects(active);
    }
    expect(statPenalty(active, stat)).toBe(0);
  });

  it("curse blocks bursts and gauge fill; paralysis blocks acting — each while active", () => {
    const curse = inflicted("curse", 1);
    expect(isCursed(curse)).toBe(true);
    expect(isCursed(tickEffects(curse))).toBe(false);
    const paralysis = inflicted("paralysis", 1);
    expect(isParalyzed(paralysis)).toBe(true);
    expect(isParalyzed(tickEffects(paralysis))).toBe(false);
    const [unit] = createBattle(makeSetup(1), 1).party;
    if (!unit) throw new Error("setup needs a unit");
    expect(fillGauge({ ...unit, effects: curse }, 10)).toBe(0);
    expect(fillGauge({ ...unit, effects: tickEffects(curse) }, 10)).toBe(10);
  });

  it("debuffs subtract their value from ATK/DEF stat_mods and stack with ailments", () => {
    const active = applyEffect(
      applyEffect(inflicted("injury"), effect("debuff.atk_down", 0.3, 2), "bb"),
      effect("debuff.def_down", 0.25, 1),
      "ubb",
    );
    expect(statPenalty(active, "atk")).toBeCloseTo(0.8);
    expect(statPenalty(active, "def")).toBe(0.25);
    expect(statPenalty(tickEffects(active), "def")).toBe(0);
    const replaced = applyEffect(active, effect("debuff.atk_down", 0.5, 2), "sbb");
    expect(statPenalty(replaced, "atk")).toBe(1);
  });

  it("ailment.null blocks every ailment but not debuffs; debuff.null the reverse", () => {
    const nulled = applyEffect([], effect("ailment.null", 1, 3), "bb");
    for (const ailment of AILMENTS) {
      expect(applyEffect(nulled, effect(`ailment.inflict.${ailment}`, 100, 3), "bb")).toEqual(
        nulled,
      );
    }
    expect(applyEffect(nulled, effect("debuff.atk_down", 0.5, 2), "bb")).toHaveLength(2);
    const debuffNull = applyEffect([], effect("debuff.null", 1, 3), "bb");
    expect(applyEffect(debuffNull, effect("debuff.def_down", 0.5, 2), "bb")).toEqual(debuffNull);
    expect(applyEffect(debuffNull, effect("ailment.inflict.weak", 100, 3), "bb")).toHaveLength(2);
    // Null does not cure what is already active.
    expect(applyEffect(inflicted("weak"), effect("ailment.null", 1, 3), "bb")).toHaveLength(2);
  });

  it("ailment.cure removes ailments and debuffs, keeping buffs and nulls", () => {
    const buff = applyEffect([], effect("buff.atk", 0.5, 3), "bb");
    const nulls = applyEffect(buff, effect("debuff.null", 1, 3), "bb");
    const sick = applyEffect(
      applyEffect(nulls, effect("ailment.inflict.sick", 100, 3), "bb"),
      effect("ailment.inflict.curse", 100, 3),
      "bb",
    );
    const debuffed = applyEffect(sick, effect("debuff.atk_down", 0.2, 2), "ubb");
    expect(applyEffect(debuffed, effect("ailment.cure", 1), "bb")).toEqual(nulls);
  });
});

describe("ailments in battle", () => {
  it("a burst inflicts an ailment on its enemy target with the enemy duration", () => {
    const setup = withBurstEffects([
      effect("ailment.inflict.curse", 100),
      effect("ailment.inflict.poison", 100),
      effect("debuff.def_down", 0.3, 2),
    ]);
    const state = patchUnit(createBattle(setup, 5), { bc: 20 });
    const result = step(state, [{ type: "burst", tick: 0, actor: "p0", tier: "bb", target: "e1" }]);
    const target = result.state.enemies.find((enemy) => enemy.slot === "e1");
    expect(target?.effects.map((e) => [e.id, e.turns])).toEqual([
      ["ailment.inflict.curse", 1],
      ["ailment.inflict.poison", 3],
      ["debuff.def_down", 2],
    ]);
    expect(result.state.enemies.find((enemy) => enemy.slot === "e0")?.effects).toEqual([]);
    const applied = result.events.filter((event) => event.type === "EffectApplied");
    expect(applied).toHaveLength(3);
  });

  it("KO'd enemies cannot receive ailments or debuffs", () => {
    const setup = withBurstEffects([
      { ...effect("ailment.inflict.weak", 100), target: "enemies" },
      { ...effect("debuff.atk_down", 0.5, 2), target: "enemies" },
    ]);
    const initial = patchUnit(createBattle(setup, 5), { bc: 20 });
    const state = {
      ...initial,
      enemies: initial.enemies.map((enemy) => (enemy.slot === "e0" ? { ...enemy, hp: 0 } : enemy)),
    };
    const result = step(state, [{ type: "burst", tick: 0, actor: "p0", tier: "bb" }]);
    expect(result.state.enemies.map((enemy) => enemy.effects.length)).toEqual([0, 2]);
  });

  it("a paralyzed unit cannot attack, burst, or guard", () => {
    const state = patchUnit(createBattle(makeSetup(2), 1), {
      bc: 20,
      effects: inflicted("paralysis"),
    });
    for (const input of [
      { type: "attack", tick: 0, actor: "p0" },
      { type: "burst", tick: 0, actor: "p0", tier: "bb" },
      { type: "guard", tick: 0, actor: "p0" },
    ] as const) {
      const result = step(state, [input]);
      expect(result.events).toEqual([
        { type: "ActionRejected", tick: 0, actor: "p0", reason: "paralyzed" },
      ]);
      expect(result.state.rng).toEqual(state.rng);
    }
  });

  it("a cursed unit cannot burst and collects no BC, but can still attack", () => {
    const burst = step(
      patchUnit(createBattle(makeSetup(2), 1), { bc: 20, effects: inflicted("curse") }),
      [{ type: "burst", tick: 0, actor: "p0", tier: "bb" }],
    );
    expect(burst.events).toEqual([
      { type: "ActionRejected", tick: 0, actor: "p0", reason: "cursed" },
    ]);
    expect(burst.state.party[0]?.bc).toBe(20);

    const seed = [...Array(50).keys()].find(
      (s) =>
        (step(createBattle(makeSetup(2), s), [{ type: "attack", tick: 0, actor: "p0" }]).state
          .party[0]?.bc ?? 0) > 0,
    );
    if (seed === undefined) throw new Error("no seed drops BC");
    const cursed = step(
      patchUnit(createBattle(makeSetup(2), seed), { effects: inflicted("curse") }),
      [{ type: "attack", tick: 0, actor: "p0" }],
    );
    const drops = cursed.events.filter((event) => event.type === "CrystalDropped");
    expect(drops.some((event) => event.bc > 0)).toBe(true);
    expect(drops.every((event) => event.bcGained === 0 && event.gauge === 0)).toBe(true);
    expect(cursed.state.party[0]?.bc).toBe(0);
  });

  it("injury on the attacker lowers damage; weak on the target raises it", () => {
    const damage = (state: BattleState): number =>
      step(state, [{ type: "attack", tick: 0, actor: "p0", target: "e0" }]).events.reduce(
        (total, event) => total + (event.type === "HitLanded" ? event.damage : 0),
        0,
      );
    const base = createBattle(makeSetup(2), 9);
    const plain = damage(base);
    expect(damage(patchUnit(base, { effects: inflicted("injury") }))).toBeLessThan(plain);
    const weakTarget = {
      ...base,
      enemies: base.enemies.map((enemy) =>
        enemy.slot === "e0" ? { ...enemy, effects: inflicted("weak") } : enemy,
      ),
    };
    expect(damage(weakTarget)).toBeGreaterThan(plain);
  });
});
