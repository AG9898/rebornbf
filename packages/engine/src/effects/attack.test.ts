import type { Attack, Effect, Element } from "@bfr/data";
import { describe, expect, it } from "vitest";
import type { HitLandedEvent } from "../events.ts";
import { attackTotal } from "../formulas/attack-stat.ts";
import { attackCore, hitDamage, rollAttack } from "../formulas/damage.ts";
import { elementMultiplier } from "../formulas/element.ts";
import { createRng, nextInt, type RngState } from "../rng.ts";
import { createBattle } from "../state/create-battle.ts";
import type { BattleState, EnemySetup } from "../state/types.ts";
import { step } from "../step.ts";
import { makeEnemy, makeSetup } from "../test/factories.ts";
import {
  ATTACK_HANDLERS,
  ATTACK_IDS,
  attackPlans,
  bbModifier,
  defIgnoreChance,
  extraHitSources,
  NORMAL_ATTACK_PLAN,
  rollDefIgnore,
} from "./attack.ts";
import type { ActiveEffect } from "./buffs.ts";
import { applyEffect, EFFECT_REGISTRY } from "./index.ts";

/** p0 is fire, ATK 1400, HP 4000; its normal attack is 2 hits (frames 0/10, 50/50, 4 DC). */
const ATK = 1400;

const oneHit: Attack = {
  moveType: "ranged",
  startDelayFrames: 0,
  hitFrames: [0],
  damageDistribution: [100],
  dropChecks: 0,
};
const threeHits: Attack = {
  moveType: "ranged",
  startDelayFrames: 0,
  hitFrames: [0, 4, 8],
  damageDistribution: [30, 30, 40],
  dropChecks: 0,
};

function foe(id: string, element: Element, def = 500): EnemySetup {
  return { ...makeEnemy(id), name: id, element, stats: { hp: 10000, atk: 800, def, rec: 100 } };
}

/** A battle whose p0 has a charged BB with `attacks` and `effects`, against `enemies`. */
function burstBattle(
  attacks: Attack[],
  effects: Effect[],
  enemies: EnemySetup[] = [foe("a", "earth"), foe("b", "water", 300)],
  extraSkill?: Effect[],
): BattleState {
  const setup = makeSetup(2);
  const squad = setup.squad.map((member, i) => {
    const form = member.unit.forms[0];
    if (i !== 0 || !form) return member;
    const bb = { name: "Test", cost: 20, attacks, effects };
    const tuned = {
      ...form,
      bursts: { bb },
      ...(extraSkill ? { extraSkill: { name: "Test ES", effects: extraSkill } } : {}),
    };
    return { ...member, unit: { ...member.unit, forms: [tuned] } };
  });
  const state = createBattle({ ...setup, squad, waves: [enemies] }, 11);
  return {
    ...state,
    party: state.party.map((unit) => (unit.slot === "p0" ? { ...unit, bc: 20 } : unit)),
  };
}

function withEffects(state: BattleState, effects: ActiveEffect[]): BattleState {
  return {
    ...state,
    party: state.party.map((unit) =>
      unit.slot === "p0" ? { ...unit, effects: [...unit.effects, ...effects] } : unit,
    ),
  };
}

const landed = (events: readonly { type: string }[]) =>
  events.filter((event): event is HitLandedEvent => event.type === "HitLanded");

const burst = [{ type: "burst" as const, tick: 0, actor: "p0" as const, tier: "bb" as const }];

/** One attack's core against `def`/`defender`, replaying its draws from `rng`. */
function replayCore(
  rng: RngState,
  options: {
    modifier: number;
    def: number;
    defender: Element;
    critRate?: number;
    canCrit?: boolean;
    defIgnore?: boolean;
  },
) {
  const draw = rollAttack(rng, options.critRate ?? 0, options.canCrit ?? true);
  const core = attackCore({
    atkTotal: attackTotal({ atk: ATK, bbModifier: options.modifier }),
    targetDef: options.def,
    defIgnore: options.defIgnore ?? false,
    rolls: draw.value,
    elementMult: elementMultiplier({ attacker: "fire", defender: options.defender }),
  });
  return { core, critical: draw.value.critical, rng: draw.rng };
}

describe("attack effect handlers", () => {
  it("registers every attack ID; shapes store nothing, lasting IDs use the buff slots", () => {
    expect(Object.keys(ATTACK_HANDLERS).sort()).toEqual([...ATTACK_IDS].sort());
    for (const id of ATTACK_IDS) expect(EFFECT_REGISTRY[id]).toBe(ATTACK_HANDLERS[id]);
    for (const id of ["attack.aoe", "attack.st", "attack.random", "attack.hp_scaled"] as const) {
      expect(applyEffect([], { id, value: 3, target: "enemies" }, "bb")).toEqual([]);
    }
    expect(
      applyEffect(
        [],
        { id: "attack.element_target", value: 3, target: "enemies", element: "dark" },
        "bb",
      ),
    ).toEqual([]);
    const ignore: Effect = { id: "attack.def_ignore", value: 100, turns: 3, target: "self" };
    const once = applyEffect([], ignore, "bb");
    const replaced = applyEffect(once, { ...ignore, value: 50 }, "sbb");
    expect(replaced).toEqual([{ ...ignore, value: 50, source: "sbb" }]);
    expect(defIgnoreChance(applyEffect(replaced, ignore, "ubb"))).toBe(100);
    const hits: Effect = {
      id: "hits.add_normal",
      value: 2,
      damageBonus: 0.2,
      turns: 3,
      target: "self",
    };
    expect(extraHitSources(applyEffect([], hits, "bb"))).toEqual([
      { count: 2, multiplier: 1.2, drops: false },
    ]);
  });

  it("pairs attack shapes with attacks in order", () => {
    const plans = attackPlans({
      attacks: [oneHit, oneHit, oneHit],
      effects: [
        { id: "attack.hp_scaled", value: 2, hpScaling: 7, target: "enemies" },
        { id: "buff.atk", value: 1, turns: 3, target: "party" },
        { id: "attack.random", value: 1.5, target: "enemies" },
        { id: "attack.element_target", value: 5.6, target: "enemy", element: "dark" },
      ],
    });
    expect(plans).toEqual([
      { area: "all", modifier: 2, hpScaling: 7 },
      { area: "random", modifier: 1.5, hpScaling: 0 },
      { area: "single", modifier: 5.6, hpScaling: 0, element: "dark" },
    ]);
    expect(attackPlans({ attacks: [oneHit], effects: [] })).toEqual([NORMAL_ATTACK_PLAN]);
  });

  it("scales an HP-scaled modifier with current HP and rounds the percent down", () => {
    const plan = { area: "all" as const, modifier: 2, hpScaling: 7 };
    expect(bbModifier(plan, 4000, 4000)).toBe(9);
    expect(bbModifier(plan, 1000, 4000)).toBe(3.75);
    // 200% + 700% × 1/3 = 433.33…% → 433%.
    expect(bbModifier(plan, 1000, 3000)).toBe(4.33);
    expect(bbModifier({ ...plan, hpScaling: 0 }, 1, 4000)).toBe(2);
  });

  it("rolls DEF ignore only for a partial chance", () => {
    const rng = createRng(3);
    expect(rollDefIgnore(rng, 100)).toEqual({ value: true, rng });
    expect(rollDefIgnore(rng, 0)).toEqual({ value: false, rng });
    const draw = nextInt(rng, 0, 99);
    expect(rollDefIgnore(rng, 80)).toEqual({ value: draw.value < 80, rng: draw.rng });
  });
});

describe("attack shapes in battle", () => {
  it("attack.aoe hits every living foe, rolling each target in slot order", () => {
    const start = burstBattle([threeHits], [{ id: "attack.aoe", value: 2, target: "enemies" }]);
    const { events } = step(start, burst);
    const a = replayCore(start.rng, { modifier: 2, def: 500, defender: "earth" });
    const b = replayCore(a.rng, { modifier: 2, def: 300, defender: "water" });
    const hits = landed(events);
    expect(hits.map((hit) => [hit.target, hit.hitIndex, hit.damage])).toEqual([
      ["e0", 0, hitDamage(a.core, 30)],
      ["e1", 0, hitDamage(b.core, 30)],
      ["e0", 1, hitDamage(a.core, 30)],
      ["e1", 1, hitDamage(b.core, 30)],
      ["e0", 2, hitDamage(a.core, 40)],
      ["e1", 2, hitDamage(b.core, 40)],
    ]);
    expect(events.find((event) => event.type === "ActionStarted")).toMatchObject({ hits: 6 });
  });

  it("attack.st hits only the selected foe", () => {
    const start = burstBattle([threeHits], [{ id: "attack.st", value: 3, target: "enemy" }]);
    const { events } = step(start, [
      { type: "burst", tick: 0, actor: "p0", tier: "bb", target: "e1" },
    ]);
    const b = replayCore(start.rng, { modifier: 3, def: 300, defender: "water" });
    expect(landed(events).map((hit) => [hit.target, hit.damage])).toEqual([
      ["e1", hitDamage(b.core, 30)],
      ["e1", hitDamage(b.core, 30)],
      ["e1", hitDamage(b.core, 40)],
    ]);
  });

  it("attack.random draws a living foe per hit and never crits", () => {
    const enemies = [foe("a", "earth"), foe("b", "water", 300), foe("c", "light", 700)];
    const charged = burstBattle(
      [threeHits],
      [
        { id: "buff.crit_rate", value: 1, turns: 1, target: "self" },
        { id: "attack.random", value: 1.5, target: "enemies" },
      ],
      enemies,
    );
    const start = {
      ...charged,
      enemies: charged.enemies.map((enemy) => (enemy.slot === "e1" ? { ...enemy, hp: 0 } : enemy)),
    };
    const { events } = step(start, burst);
    const pool = [
      { slot: "e0", def: 500, defender: "earth" as const },
      { slot: "e2", def: 700, defender: "light" as const },
    ];
    let rng = start.rng;
    const expected = threeHits.damageDistribution.map((pct) => {
      const pick = nextInt(rng, 0, pool.length - 1);
      const target = pool[pick.value];
      if (!target) throw new Error("bad pick");
      const roll = replayCore(pick.rng, { ...target, modifier: 1.5, critRate: 1, canCrit: false });
      rng = roll.rng;
      return [target.slot, false, hitDamage(roll.core, pct)];
    });
    expect(landed(events).map((hit) => [hit.target, hit.critical, hit.damage])).toEqual(expected);
  });

  it("attack.hp_scaled uses the attacker's HP at action start", () => {
    const base = burstBattle(
      [oneHit],
      [{ id: "attack.hp_scaled", value: 2, hpScaling: 7, target: "enemy" }],
    );
    const start = {
      ...base,
      party: base.party.map((unit) => (unit.slot === "p0" ? { ...unit, hp: 1000 } : unit)),
    };
    const { events } = step(start, burst);
    const a = replayCore(start.rng, { modifier: 3.75, def: 500, defender: "earth" });
    expect(landed(events).map((hit) => hit.damage)).toEqual([hitDamage(a.core, 100)]);
  });

  it("attack.element_target connects only with foes of its element", () => {
    const enemies = [foe("a", "earth"), foe("b", "dark"), foe("c", "dark", 300)];
    const effects: Effect[] = [
      { id: "attack.st", value: 1, target: "enemy" },
      { id: "attack.element_target", value: 3.6, target: "enemies", element: "dark" },
    ];
    const { events } = step(burstBattle([oneHit, oneHit], effects, enemies), burst);
    expect(landed(events).map((hit) => [hit.attackIndex, hit.target])).toEqual([
      [0, "e0"],
      [1, "e1"],
      [1, "e2"],
    ]);
    const single: Effect[] = [
      effects[0] as Effect,
      { id: "attack.element_target", value: 3.6, target: "enemy", element: "dark" },
    ];
    const missed = step(burstBattle([oneHit, oneHit], single, enemies), burst);
    expect(landed(missed.events).map((hit) => [hit.attackIndex, hit.target])).toEqual([[0, "e0"]]);
  });
});

describe("attack.def_ignore", () => {
  it("a burst buff ignores the target's DEF on later attacks", () => {
    const effects: Effect[] = [
      { id: "attack.def_ignore", value: 100, turns: 3, target: "self" },
      { id: "attack.st", value: 1, target: "enemy" },
    ];
    const start = burstBattle([oneHit], effects);
    const { events } = step(start, burst);
    expect(events.filter((event) => event.type === "EffectApplied")).toHaveLength(1);
    const a = replayCore(start.rng, { modifier: 1, def: 500, defender: "earth", defIgnore: true });
    expect(landed(events).map((hit) => hit.damage)).toEqual([hitDamage(a.core, 100)]);
  });

  it("an Extra Skill chance draws once per attack before the crit roll", () => {
    const start = burstBattle(
      [oneHit],
      [{ id: "attack.st", value: 1, target: "enemy" }],
      undefined,
      [{ id: "attack.def_ignore", value: 80, target: "self" }],
    );
    expect(start.party[0]?.effects).toContainEqual({
      id: "attack.def_ignore",
      value: 80,
      target: "self",
      source: "extra",
    });
    const { events } = step(start, burst);
    const ignore = rollDefIgnore(start.rng, 80);
    const a = replayCore(ignore.rng, {
      modifier: 1,
      def: 500,
      defender: "earth",
      defIgnore: ignore.value,
    });
    expect(landed(events).map((hit) => hit.damage)).toEqual([hitDamage(a.core, 100)]);
  });
});

describe("hits.add_normal", () => {
  const attack = [{ type: "attack" as const, tick: 0, actor: "p0" as const }];
  const buffHits: ActiveEffect = {
    id: "hits.add_normal",
    value: 2,
    damageBonus: 0.2,
    turns: 3,
    target: "self",
    source: "bb",
  };

  it("clones each normal hit without elemental-damage buffs and rolls no drops for burst clones", () => {
    const plain = withEffects(burstBattle([], []), [
      { id: "buff.elem_weak_dmg", value: 0.5, turns: 3, target: "self", source: "bb" },
    ]);
    const start = withEffects(plain, [buffHits]);
    const scheduled = step(start, attack, { untilTick: 0 }).state.timeline;
    expect(scheduled.map((hit) => [hit.hitIndex, hit.extra, hit.dropChecks])).toEqual([
      [0, undefined, 2],
      [0, { index: 1, drops: false }, 0],
      [0, { index: 2, drops: false }, 0],
      [1, undefined, 2],
      [1, { index: 1, drops: false }, 0],
      [1, { index: 2, drops: false }, 0],
    ]);
    const { state, events } = step(start, attack);
    const draw = rollAttack(start.rng, 0);
    const terms = { atkTotal: ATK, targetDef: 500, rolls: draw.value };
    const core = attackCore({ ...terms, elementMult: 2 });
    const extraCore = attackCore({ ...terms, elementMult: 1.5 });
    expect(landed(events).map((hit) => [hit.hitIndex, hit.extraIndex, hit.damage])).toEqual([
      [0, undefined, hitDamage(core, 50)],
      [0, 1, hitDamage(extraCore * 1.2, 50)],
      [0, 2, hitDamage(extraCore * 1.2, 50)],
      [1, undefined, hitDamage(core, 50)],
      [1, 1, hitDamage(extraCore * 1.2, 50)],
      [1, 2, hitDamage(extraCore * 1.2, 50)],
    ]);
    // Burst-granted clones draw nothing: the RNG ends where the plain attack's does.
    expect(state.rng).toEqual(step(plain, attack).state.rng);
  });

  it("passive clones roll the original hit's drops", () => {
    const start = burstBattle([], [], undefined, [
      { id: "hits.add_normal", value: 1, target: "self" },
    ]);
    const scheduled = step(start, attack, { untilTick: 0 }).state.timeline;
    expect(scheduled.map((hit) => [hit.extra, hit.dropChecks])).toEqual([
      [undefined, 2],
      [{ index: 1, drops: true }, 2],
      [undefined, 2],
      [{ index: 1, drops: true }, 2],
    ]);
  });

  it("clones take their original's spark without spark-damage buffs and do not count toward it", () => {
    const start = withEffects(burstBattle([], []), [
      { ...buffHits, value: 1, damageBonus: 0 },
      { id: "buff.spark_dmg", value: 0.5, turns: 3, target: "self", source: "bb" },
    ]);
    const { events } = step(start, [...attack, { type: "attack", tick: 0, actor: "p1" }]);
    const sparks = events.filter((event) => event.type === "Sparked");
    expect(sparks.map((event) => event.hits)).toEqual([2, 2]);
    const draw = rollAttack(start.rng, 0);
    const terms = { atkTotal: ATK, targetDef: 500, rolls: draw.value, elementMult: 1.5 };
    const core = attackCore(terms);
    const p0 = landed(events).filter((hit) => hit.actor === "p0");
    expect(p0.map((hit) => [hit.extraIndex, hit.sparked, hit.damage])).toEqual([
      [undefined, true, hitDamage(core, 50, { sparkMult: 2 })],
      [1, true, hitDamage(core, 50, { sparkMult: 1.5 })],
      [undefined, true, hitDamage(core, 50, { sparkMult: 2 })],
      [1, true, hitDamage(core, 50, { sparkMult: 1.5 })],
    ]);
  });

  it("adds no clones to burst attacks", () => {
    const start = withEffects(
      burstBattle([threeHits], [{ id: "attack.st", value: 1, target: "enemy" }]),
      [buffHits],
    );
    expect(landed(step(start, burst).events).some((hit) => hit.extraIndex !== undefined)).toBe(
      false,
    );
  });
});

describe("effects added for the first kit transcription (M2-04A)", () => {
  const normal = [{ type: "attack" as const, tick: 0, actor: "p0" as const }];

  /** p0's attack core with ATK stat_mods, flat ATK, and a BB modifier, replaying its draws. */
  function core(rng: RngState, statMods: number, flatAtk: number, modifier: number) {
    const draw = rollAttack(rng, 0);
    return attackCore({
      atkTotal: attackTotal({ atk: ATK, flatAtk, statMods, bbModifier: modifier }),
      targetDef: 500,
      rolls: draw.value,
      elementMult: elementMultiplier({ attacker: "fire", defender: "earth" }),
    });
  }

  it("an attack shape's flatAtk joins base ATK and buff.bb_atk joins the burst modifier", () => {
    const start = burstBattle(
      [oneHit],
      [
        { id: "buff.bb_atk", value: 2, turns: 3, target: "self" },
        { id: "attack.st", value: 1, target: "enemy", flatAtk: 100 },
      ],
    );
    const { events } = step(start, burst);
    // atk_total = floor((1400 + 100) × (1 + 1 + 2)) = 6000
    expect(landed(events).map((hit) => hit.damage)).toEqual([
      hitDamage(core(start.rng, 0, 100, 3), 100),
    ]);
  });

  it("buff.bb_atk (including a leader-skill passive) never boosts normal attacks", () => {
    const start = withEffects(burstBattle([], []), [
      { id: "buff.bb_atk", value: 1.2, target: "party", source: "leader" },
    ]);
    const { events } = step(start, normal);
    expect(landed(events).map((hit) => hit.damage)).toEqual([
      hitDamage(core(start.rng, 0, 0, 0), 50),
      hitDamage(core(start.rng, 0, 0, 0), 50),
    ]);
  });

  it("passive.atk_hp_scaled adds value + hpScaling × HP ratio to ATK stat_mods", () => {
    const base = withEffects(burstBattle([], []), [
      { id: "passive.atk_hp_scaled", value: 0, hpScaling: 0.5, target: "self", source: "extra" },
    ]);
    const start = {
      ...base,
      party: base.party.map((unit) => (unit.slot === "p0" ? { ...unit, hp: 2000 } : unit)),
    };
    const { events } = step(start, normal);
    // HP 2000 / 4000 → +25% ATK.
    const expected = hitDamage(core(start.rng, 0.25, 0, 0), 50);
    expect(landed(events).map((hit) => hit.damage)).toEqual([expected, expected]);
  });

  it("a burst buff with an element reaches only party units of that element", () => {
    const base = burstBattle(
      [],
      [{ id: "buff.elem_weak_dmg", value: 0.75, turns: 3, target: "party", element: "fire" }],
    );
    const start = {
      ...base,
      party: base.party.map((unit) =>
        unit.slot === "p1" ? { ...unit, element: "water" as const } : unit,
      ),
    };
    const { state } = step(start, burst);
    const has = (slot: string) =>
      state.party
        .find((unit) => unit.slot === slot)
        ?.effects.some((effect) => effect.id === "buff.elem_weak_dmg");
    expect([has("p0"), has("p1")]).toEqual([true, false]);
  });

  it("a debuff chance draws one [0, 99] integer per living target", () => {
    const start = burstBattle(
      [],
      [{ id: "debuff.atk_down", value: 0.5, turns: 1, target: "enemies", chance: 30 }],
    );
    const { state } = step(start, burst);
    const first = nextInt(start.rng, 0, 99);
    const second = nextInt(first.rng, 0, 99);
    const debuffed = state.enemies.map((enemy) =>
      enemy.effects.some((effect) => effect.id === "debuff.atk_down"),
    );
    expect(debuffed).toEqual([first.value < 30, second.value < 30]);
    // A 100% (or chance-less) debuff draws nothing.
    const sure = burstBattle(
      [],
      [{ id: "debuff.atk_down", value: 0.8, turns: 2, target: "enemies" }],
    );
    expect(step(sure, burst).state.rng).toEqual(sure.rng);
  });
});
