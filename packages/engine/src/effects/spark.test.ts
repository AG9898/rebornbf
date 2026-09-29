import { describe, expect, it } from "vitest";
import { rollHitDrops } from "../drops/roll.ts";
import type { BattleEvent, GaugeFilledEvent, HitLandedEvent } from "../events.ts";
import { attackTotal } from "../formulas/attack-stat.ts";
import { attackCore, hitDamage, rollAttack } from "../formulas/damage.ts";
import { createRng, nextInt, type RngState } from "../rng.ts";
import { createBattle } from "../state/create-battle.ts";
import type { BattleState } from "../state/types.ts";
import { step } from "../step.ts";
import { makeSetup } from "../test/factories.ts";
import type { ActiveEffect } from "./buffs.ts";
import { rollBcFillOnSpark, rollSparkCritical, sparkVulnerability } from "./spark.ts";

// Factory normal attack from tap T hits at T + 20 and T + 30 (50% each), so p0 and p1 tapping on
// tick 0 spark both hits on e0. Each hit rolls 2 drop checks at 35% BC / 10% HC.

const sparkCrit = (value: number, chance: number, source: ActiveEffect["source"] = "bb") =>
  ({ id: "buff.spark_crit", value, chance, turns: 3, target: "party", source }) as ActiveEffect;
const vuln = (value: number): ActiveEffect => ({
  id: "debuff.spark_vuln",
  value,
  turns: 1,
  target: "enemies",
  source: "ubb",
});
const fillOnSpark = (value: number, range?: [number, number]): ActiveEffect => ({
  id: "bb.fill_on_spark",
  value,
  ...(range ? { min: range[0], max: range[1] } : {}),
  target: "party",
  source: "leader",
});

function battle(p0Effects: ActiveEffect[] = [], e0Effects: ActiveEffect[] = []): BattleState {
  const start = createBattle(makeSetup(3), 7);
  return {
    ...start,
    party: start.party.map((u) => (u.slot === "p0" ? { ...u, effects: p0Effects } : u)),
    enemies: start.enemies.map((e) => (e.slot === "e0" ? { ...e, effects: e0Effects } : e)),
  };
}

function bothAttack(start: BattleState) {
  return step(start, [
    { type: "attack", tick: 0, actor: "p0" },
    { type: "attack", tick: 0, actor: "p1" },
  ]);
}

function hitsOf(events: readonly BattleEvent[]): HitLandedEvent[] {
  return events.filter((e): e is HitLandedEvent => e.type === "HitLanded");
}

/** The two normal-attack cores (p0 then p1) and the RNG after both attack rolls. */
function cores(start: BattleState): { p0: number; p1: number; rng: RngState } {
  const p0 = rollAttack(start.rng, 0);
  const p1 = rollAttack(p0.rng, 0);
  const core = (rolls: typeof p0.value) =>
    attackCore({ atkTotal: attackTotal({ atk: 1400 }), targetDef: 500, rolls, elementMult: 1.5 });
  return { p0: core(p0.value), p1: core(p1.value), rng: p1.rng };
}

const DROPS = { checks: 2, bcRate: 35, hcRate: 10 };

describe("rollSparkCritical", () => {
  it("adds a guaranteed spark critical without drawing (wiki Zeis example: 150 + 150 + 60 = 360%)", () => {
    const rng = createRng(1);
    const roll = rollSparkCritical([sparkCrit(0.6, 100)], rng);
    expect(roll).toEqual({ value: 0.6, rng });
    // Hand-worked: core 1000 at 50% sparked with Spark +150% and a procced +60% crit → 1800.
    expect(hitDamage(1000, 50, { sparkMult: 1.5 + 1.5 + roll.value })).toBe(1800);
  });

  it("draws one [0, 99] integer per chance effect in stored order and procs below `chance`", () => {
    const rng = createRng(3);
    const first = nextInt(rng, 0, 99);
    const second = nextInt(first.rng, 0, 99);
    const expected = (first.value < 20 ? 0.5 : 0) + (second.value < 50 ? 0.5 : 0);
    const roll = rollSparkCritical([sparkCrit(0.5, 20), sparkCrit(0.5, 50, "ubb")], rng);
    expect(roll).toEqual({ value: expected, rng: second.rng });
    expect(rollSparkCritical([], rng)).toEqual({ value: 0, rng });
  });

  it("raises a sparked hit's spark multiplier in battle and marks it `sparkCritical`", () => {
    const start = battle([sparkCrit(0.5, 100)]);
    const { p0, p1 } = cores(start);
    const { events, state } = bothAttack(start);
    expect(hitsOf(events).map((h) => [h.actor, h.damage, h.sparkCritical])).toEqual([
      ["p0", hitDamage(p0, 50, { sparkMult: 2 }), true],
      ["p1", hitDamage(p1, 50, { sparkMult: 1.5 }), undefined],
      ["p0", hitDamage(p0, 50, { sparkMult: 2 }), true],
      ["p1", hitDamage(p1, 50, { sparkMult: 1.5 }), undefined],
    ]);
    // A guaranteed crit draws nothing: the RNG matches the battle without it.
    expect(state.rng).toEqual(bothAttack(battle()).state.rng);
  });

  it("rolls the chance before the hit's drop draws", () => {
    const start = battle([sparkCrit(0.5, 50)]);
    const { p0, rng } = cores(start);
    const crit1 = nextInt(rng, 0, 99);
    const d1 = rollHitDrops(crit1.rng, DROPS);
    const d2 = rollHitDrops(d1.rng, DROPS);
    const crit2 = nextInt(d2.rng, 0, 99);
    const d3 = rollHitDrops(crit2.rng, DROPS);
    const d4 = rollHitDrops(d3.rng, DROPS);
    const { events, state } = bothAttack(start);
    const mult = (draw: number) => (draw < 50 ? 2 : 1.5);
    expect(
      hitsOf(events)
        .filter((h) => h.actor === "p0")
        .map((h) => h.damage),
    ).toEqual([
      hitDamage(p0, 50, { sparkMult: mult(crit1.value) }),
      hitDamage(p0, 50, { sparkMult: mult(crit2.value) }),
    ]);
    expect(state.rng).toEqual(d4.rng);
  });

  it("does not draw for an unsparked hit", () => {
    const start = battle([sparkCrit(0.5, 50)]);
    const alone = step(start, [{ type: "attack", tick: 0, actor: "p0" }]);
    const plain = step(battle(), [{ type: "attack", tick: 0, actor: "p0" }]);
    expect(alone.state.rng).toEqual(plain.state.rng);
    expect(hitsOf(alone.events).map((h) => h.damage)).toEqual(
      hitsOf(plain.events).map((h) => h.damage),
    );
  });
});

describe("sparkVulnerability", () => {
  it("sums the target's debuffs as an additive spark bonus", () => {
    expect(sparkVulnerability([vuln(1), vuln(0.3)])).toBeCloseTo(1.3);
    expect(sparkVulnerability([])).toBe(0);
    // Wiki example: Spark +150% on a foe with 30% vulnerability → 150 + 150 + 30 = 330%.
    expect(hitDamage(1000, 100, { sparkMult: 1.5 + 1.5 + 0.3 })).toBe(3300);
  });

  it("raises every sparked hit on the debuffed foe, from any attacker, without drawing", () => {
    const start = battle([], [vuln(1)]);
    const { p0, p1 } = cores(start);
    const { events, state } = bothAttack(start);
    expect(hitsOf(events).map((h) => h.damage)).toEqual([
      hitDamage(p0, 50, { sparkMult: 2.5 }),
      hitDamage(p1, 50, { sparkMult: 2.5 }),
      hitDamage(p0, 50, { sparkMult: 2.5 }),
      hitDamage(p1, 50, { sparkMult: 2.5 }),
    ]);
    expect(state.rng).toEqual(bothAttack(battle()).state.rng);
    // Unsparked hits ignore it.
    const alone = step(start, [{ type: "attack", tick: 0, actor: "p0" }]);
    expect(hitsOf(alone.events).map((h) => h.damage)).toEqual([
      hitDamage(p0, 50),
      hitDamage(p0, 50),
    ]);
  });
});

describe("rollBcFillOnSpark", () => {
  it("adds fixed values without drawing and draws RandomBetween(min, max) for ranges", () => {
    const rng = createRng(5);
    expect(rollBcFillOnSpark([fillOnSpark(2)], rng)).toEqual({ value: 2, rng });
    const draw = nextInt(rng, 2, 3);
    expect(rollBcFillOnSpark([fillOnSpark(0, [2, 3]), fillOnSpark(1)], rng)).toEqual({
      value: draw.value + 1,
      rng: draw.rng,
    });
  });

  function gaugeFills(events: readonly BattleEvent[]): GaugeFilledEvent[] {
    return events.filter((e): e is GaugeFilledEvent => e.type === "GaugeFilled");
  }

  it("fills the attacker's gauge per sparked hit, after that hit's drops", () => {
    const start = battle([fillOnSpark(0, [2, 3])]);
    const { rng } = cores(start);
    const d1 = rollHitDrops(rng, DROPS);
    const f1 = nextInt(d1.rng, 2, 3);
    const d2 = rollHitDrops(f1.rng, DROPS);
    const d3 = rollHitDrops(d2.rng, DROPS);
    const f2 = nextInt(d3.rng, 2, 3);
    const d4 = rollHitDrops(f2.rng, DROPS);
    const { events, state } = bothAttack(start);
    const fills = gaugeFills(events);
    expect(fills.map((e) => [e.tick, e.target, e.effect, e.gained])).toEqual([
      [20, "p0", "bb.fill_on_spark", f1.value],
      [30, "p0", "bb.fill_on_spark", f2.value],
    ]);
    expect(state.rng).toEqual(d4.rng);
    // The fill is an effect fill: the gauge is the crystal BC plus exactly the fills.
    const plain = bothAttack(battle()).state;
    expect(state.party[0]?.bc).toBe((plain.party[0]?.bc ?? 0) + f1.value + f2.value);
  });

  it("does not fill on unsparked hits or for a cursed unit", () => {
    const alone = step(battle([fillOnSpark(2)]), [{ type: "attack", tick: 0, actor: "p0" }]);
    expect(gaugeFills(alone.events)).toEqual([]);
    const curse: ActiveEffect = {
      id: "ailment.inflict.curse",
      value: 100,
      turns: 3,
      target: "party",
      source: "bb",
    };
    const cursed = bothAttack(battle([fillOnSpark(2), curse]));
    expect(gaugeFills(cursed.events)).toEqual([]);
    expect(cursed.state.party[0]?.bc).toBe(0);
  });
});
