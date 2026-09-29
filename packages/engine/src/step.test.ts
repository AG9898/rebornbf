import type { Attack } from "@bfr/data";
import { describe, expect, it } from "vitest";
import { rollHitDrops } from "./drops/roll.ts";
import type { BattleEvent, CrystalDroppedEvent, HitLandedEvent } from "./events.ts";
import { attackTotal } from "./formulas/attack-stat.ts";
import { attackCore, hitDamage, rollAttack } from "./formulas/damage.ts";
import { createBattle } from "./state/create-battle.ts";
import type { BattleSetup, BattleState } from "./state/types.ts";
import { BattleInputError, step } from "./step.ts";
import { makeSetup, makeUnit, singleTargetShapes } from "./test/factories.ts";
import type { BattleInput } from "./timeline/types.ts";

// Factory normal attack: startDelayFrames 20, hitFrames [0, 10] → hits at tap + 20 and tap + 30.

function hitsOf(events: readonly BattleEvent[]): HitLandedEvent[] {
  return events.filter((e): e is HitLandedEvent => e.type === "HitLanded");
}

/** Drops unrelated events when checking hit ordering. */
function withoutDrops(events: readonly BattleEvent[]): BattleEvent[] {
  return events.filter(
    (e) =>
      e.type !== "CrystalDropped" &&
      e.type !== "BurstUsed" &&
      e.type !== "EffectApplied" &&
      e.type !== "OdGained",
  );
}

function battle(setup: BattleSetup = makeSetup(3)): BattleState {
  return chargedBattle(setup, 7);
}

function chargedBattle(setup: BattleSetup, seed: number): BattleState {
  const start = createBattle(setup, seed);
  if (setup.squad[0]?.unit.id !== "burster") return start;
  return {
    ...start,
    party: start.party.map((u) => (u.slot === "p0" ? { ...u, bc: u.form.bursts.bb.cost } : u)),
  };
}

/** A setup whose p0 has a two-attack BB (self-overlapping) and whose enemies have `hp`. */
function burstSetup(hp = 10000): BattleSetup {
  const base = makeSetup(2);
  const unit = makeUnit("burster");
  const form = unit.forms[0];
  if (!form) throw new Error("factory form missing");
  const attacks: Attack[] = [
    {
      moveType: "ranged",
      startDelayFrames: 5,
      hitFrames: [0, 4, 8],
      damageDistribution: [30, 30, 40],
      dropChecks: 3,
    },
    {
      moveType: "ranged",
      startDelayFrames: 7,
      hitFrames: [0],
      damageDistribution: [100],
      dropChecks: 1,
    },
  ];
  const burstUnit = {
    ...unit,
    forms: [
      {
        ...form,
        bursts: {
          bb: {
            ...form.bursts.bb,
            attacks,
            effects: [...form.bursts.bb.effects, ...singleTargetShapes(attacks.length)],
          },
        },
      },
    ],
  };
  return {
    ...base,
    squad: [
      { ...base.squad[0], unit: burstUnit, formId: form.id } as BattleSetup["squad"][number],
      ...base.squad.slice(1),
    ],
    waves: base.waves.map((wave) => wave.map((e) => ({ ...e, stats: { ...e.stats, hp } }))),
  };
}

describe("step: tick timeline", () => {
  it("resolves hits from overlapping actions in tick order", () => {
    const inputs: BattleInput[] = [
      { type: "attack", tick: 5, actor: "p1" },
      { type: "attack", tick: 0, actor: "p0" },
      { type: "attack", tick: 12, actor: "p2", target: "e1" },
    ];
    const { state, events } = step(battle(), inputs);

    expect(hitsOf(events).map((h) => [h.tick, h.actor, h.target, h.hitIndex])).toEqual([
      [20, "p0", "e0", 0],
      [25, "p1", "e0", 0],
      [30, "p0", "e0", 1],
      [32, "p2", "e1", 0],
      [35, "p1", "e0", 1],
      [42, "p2", "e1", 1],
    ]);
    const ticks = events.map((e) => e.tick);
    expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
    expect(
      withoutDrops(events)
        .slice(0, 3)
        .map((e) => e.type),
    ).toEqual(Array(3).fill("ActionStarted"));
    expect(state.tick).toBe(42);
    expect(state.timeline).toEqual([]);
    expect(state.acted).toEqual(["p0", "p1", "p2"]);
    const dealt = (slot: string) =>
      hitsOf(events)
        .filter((h) => h.target === slot)
        .reduce((sum, h) => sum + h.damage, 0);
    expect(state.enemies.map((e) => e.hp)).toEqual([10000 - dealt("e0"), 10000 - dealt("e1")]);
  });

  it("orders same-tick hits by action, then attack, then hit", () => {
    const inputs: BattleInput[] = [
      { type: "burst", tick: 0, actor: "p0", tier: "bb" },
      { type: "attack", tick: 0, actor: "p1" },
    ];
    const { events } = step(battle(burstSetup()), inputs);
    // BB attack 0 hits at 5, 9, 13; attack 1 hits at 7; p1's normal attack at 20, 30.
    expect(hitsOf(events).map((h) => [h.tick, h.actionId, h.attackIndex, h.hitIndex])).toEqual([
      [5, 0, 0, 0],
      [7, 0, 1, 0],
      [9, 0, 0, 1],
      [13, 0, 0, 2],
      [20, 1, 0, 0],
      [30, 1, 0, 1],
    ]);
    expect(events[0]).toMatchObject({
      type: "ActionStarted",
      action: "burst",
      tier: "bb",
      hits: 4,
    });
  });

  it("resolves an action whose first hit lands on its start tick after the action starts", () => {
    const setup = burstSetup();
    const { events } = step(battle(setup), [{ type: "burst", tick: 3, actor: "p0", tier: "bb" }], {
      untilTick: 8,
    });
    expect(withoutDrops(events).map((e) => [e.type, e.tick])).toEqual([
      ["ActionStarted", 3],
      ["HitLanded", 8],
    ]);
  });

  it("gives the same result when the clock is advanced in slices", () => {
    const inputs: BattleInput[] = [
      { type: "attack", tick: 0, actor: "p0" },
      { type: "attack", tick: 25, actor: "p1" },
    ];
    const whole = step(battle(), inputs);
    const first = step(battle(), [inputs[0] as BattleInput], { untilTick: 24 });
    expect(first.state.tick).toBe(24);
    expect(first.state.timeline.map((h) => h.tick)).toEqual([30]);
    const second = step(first.state, [inputs[1] as BattleInput], { untilTick: 30 });
    expect(second.state.timeline.map((h) => h.tick)).toEqual([45, 55]);
    const third = step(second.state, []);
    expect([...first.events, ...second.events, ...third.events]).toEqual(whole.events);
    expect(third.state).toEqual(whole.state);
  });

  it("emits EnemyDefeated once and lets overkill hits land", () => {
    const { state, events } = step(battle(burstSetup(1)), [
      { type: "burst", tick: 0, actor: "p0", tier: "bb" },
    ]);
    expect(withoutDrops(events).map((e) => e.type)).toEqual([
      "ActionStarted",
      "HitLanded",
      "EnemyDefeated",
      "HitLanded",
      "HitLanded",
      "HitLanded",
    ]);
    expect(hitsOf(events).map((h) => h.targetHp)).toEqual([0, 0, 0, 0]);
    expect(state.enemies[0]?.hp).toBe(0);
  });

  it("retargets from a defeated enemy to the first living one", () => {
    const first = step(battle(burstSetup(1)), [
      { type: "burst", tick: 0, actor: "p0", tier: "bb" },
    ]);
    const { events } = step(first.state, [{ type: "attack", tick: 20, actor: "p1", target: "e0" }]);
    expect(events[0]).toMatchObject({ type: "ActionStarted", target: "e1" });
  });

  it("rejects a second action by the same unit and a missing burst tier", () => {
    const { events, state } = step(battle(), [
      { type: "attack", tick: 0, actor: "p0" },
      { type: "attack", tick: 1, actor: "p0" },
      { type: "burst", tick: 2, actor: "p1", tier: "sbb" },
    ]);
    const rejected = events.filter((e) => e.type === "ActionRejected");
    expect(rejected).toEqual([
      { type: "ActionRejected", tick: 1, actor: "p0", reason: "already_acted" },
      { type: "ActionRejected", tick: 2, actor: "p1", reason: "no_burst_tier" },
    ]);
    expect(state.nextActionId).toBe(1);
  });

  it("throws on malformed inputs without touching state", () => {
    const state = step(battle(), [], { untilTick: 10 }).state;
    expect(() => step(state, [{ type: "attack", tick: 9, actor: "p0" }])).toThrow(BattleInputError);
    expect(() => step(state, [{ type: "attack", tick: 10, actor: "p7" }])).toThrow(/actor/);
    expect(() => step(state, [{ type: "attack", tick: 10, actor: "p0", target: "e9" }])).toThrow(
      /target/,
    );
    expect(() =>
      step(state, [{ type: "attack", tick: 20, actor: "p0" }], { untilTick: 15 }),
    ).toThrow(/untilTick/);
    expect(() => step(state, [], { untilTick: 5 })).toThrow(BattleInputError);
    expect(state.tick).toBe(10);
  });

  it("is deterministic: same setup, seed, and inputs yield identical event logs", () => {
    const inputs: BattleInput[] = [
      { type: "burst", tick: 0, actor: "p0", tier: "bb" },
      { type: "attack", tick: 3, actor: "p1", target: "e1" },
    ];
    const run = () => step(chargedBattle(burstSetup(), 1234), inputs);
    const a = run();
    const b = run();
    expect(b.events).toEqual(a.events);
    expect(b.state).toEqual(a.state);

    // A JSON round-trip of mid-battle state resumes identically.
    const mid = step(chargedBattle(burstSetup(), 1234), inputs, { untilTick: 9 });
    const revived = JSON.parse(JSON.stringify(mid.state)) as BattleState;
    const rest = step(revived, []);
    expect([...mid.events, ...rest.events]).toEqual(a.events);
  });

  it("deals formula damage: per-attack rolls from the battle RNG, each hit floored", () => {
    // Factory p0: fire, ATK 1400; enemy: earth, DEF 500 → element ×1.5. Crit rate is 0 until
    // crit buffs exist (M1-06A), so the attack draws crit, variance, and divisor.
    const start = battle();
    const draw = rollAttack(start.rng, 0);
    expect(draw.value.critical).toBe(false);
    const core = attackCore({
      atkTotal: attackTotal({ atk: 1400 }),
      targetDef: 500,
      rolls: draw.value,
      elementMult: 1.5,
    });
    const { state, events } = step(start, [{ type: "attack", tick: 0, actor: "p0" }]);
    expect(hitsOf(events).map((h) => [h.damage, h.critical])).toEqual([
      [hitDamage(core, 50), false],
      [hitDamage(core, 50), false],
    ]);
    // Then each hit rolls its drops: 4 checks / 2 hits → 2 checks per hit at 35%, HC at 10%.
    const drops1 = rollHitDrops(draw.rng, { checks: 2, bcRate: 35, hcRate: 10 });
    const drops2 = rollHitDrops(drops1.rng, { checks: 2, bcRate: 35, hcRate: 10 });
    expect(state.rng).toEqual(drops2.rng);
    expect(state.enemies[0]?.hp).toBe(10000 - 2 * hitDamage(core, 50));
  });
});

describe("step: sparks", () => {
  // Factory normal attack from tap T hits at T + 20 and T + 30 (see top of file).
  function sparksOf(events: readonly BattleEvent[]) {
    return events.filter((e) => e.type === "Sparked");
  }

  it("sparks same-tick hits from different units on one target and multiplies damage ×1.5", () => {
    const start = battle();
    const p0 = rollAttack(start.rng, 0);
    const p1 = rollAttack(p0.rng, 0);
    const coreOf = (draw: typeof p0) =>
      attackCore({
        atkTotal: attackTotal({ atk: 1400 }),
        targetDef: 500,
        rolls: draw.value,
        elementMult: 1.5,
      });
    const { events } = step(start, [
      { type: "attack", tick: 0, actor: "p0" },
      { type: "attack", tick: 0, actor: "p1" },
    ]);
    expect(sparksOf(events)).toEqual([
      { type: "Sparked", tick: 20, target: "e0", hits: 2, actors: ["p0", "p1"] },
      { type: "Sparked", tick: 30, target: "e0", hits: 2, actors: ["p0", "p1"] },
    ]);
    const spark = { sparkMult: 1.5 };
    expect(hitsOf(events).map((h) => [h.tick, h.actor, h.sparked, h.damage])).toEqual([
      [20, "p0", true, hitDamage(coreOf(p0), 50, spark)],
      [20, "p1", true, hitDamage(coreOf(p1), 50, spark)],
      [30, "p0", true, hitDamage(coreOf(p0), 50, spark)],
      [30, "p1", true, hitDamage(coreOf(p1), 50, spark)],
    ]);
    // The Sparked event precedes that tick's hits.
    expect(
      withoutDrops(events)
        .map((e) => e.type)
        .slice(2, 5),
    ).toEqual(["Sparked", "HitLanded", "HitLanded"]);
  });

  it("does not spark hits one tick apart (window boundary)", () => {
    const { events } = step(battle(), [
      { type: "attack", tick: 0, actor: "p0" },
      { type: "attack", tick: 1, actor: "p1" },
    ]);
    expect(sparksOf(events)).toEqual([]);
    expect(hitsOf(events).map((h) => [h.tick, h.sparked])).toEqual([
      [20, false],
      [21, false],
      [30, false],
      [31, false],
    ]);
  });

  it("sparks only the overlapping hit when actions partly overlap", () => {
    const { events } = step(battle(), [
      { type: "attack", tick: 0, actor: "p0" },
      { type: "attack", tick: 10, actor: "p1" },
    ]);
    expect(hitsOf(events).map((h) => [h.tick, h.actor, h.sparked])).toEqual([
      [20, "p0", false],
      [30, "p0", true],
      [30, "p1", true],
      [40, "p1", false],
    ]);
  });

  it("does not spark same-tick hits on different targets", () => {
    const { events } = step(battle(), [
      { type: "attack", tick: 0, actor: "p0", target: "e0" },
      { type: "attack", tick: 0, actor: "p1", target: "e1" },
    ]);
    expect(sparksOf(events)).toEqual([]);
    expect(hitsOf(events).every((h) => !h.sparked)).toBe(true);
  });

  it("self-sparks two attacks of one burst landing on the same tick", () => {
    // Burst attack 0 hits at T+5, T+9, T+13; attack 1 at T+7. Shift attack 1 onto T+9.
    const setup = burstSetup();
    const member = setup.squad[0];
    const form = member?.unit.forms[0];
    if (!member || !form) throw new Error("factory form missing");
    const attacks = form.bursts.bb.attacks.map((a, i) =>
      i === 1 ? { ...a, startDelayFrames: 9 } : a,
    );
    const unit = {
      ...member.unit,
      forms: [{ ...form, bursts: { bb: { ...form.bursts.bb, attacks } } }],
    };
    const selfSetup: BattleSetup = {
      ...setup,
      squad: [{ ...member, unit }, ...setup.squad.slice(1)],
    };
    const { events } = step(battle(selfSetup), [
      { type: "burst", tick: 0, actor: "p0", tier: "bb" },
    ]);
    expect(sparksOf(events)).toEqual([
      { type: "Sparked", tick: 9, target: "e0", hits: 2, actors: ["p0", "p0"] },
    ]);
    expect(hitsOf(events).map((h) => [h.tick, h.sparked])).toEqual([
      [5, false],
      [9, true],
      [9, true],
      [13, false],
    ]);
  });

  it("detects sparks identically when the clock is advanced in slices", () => {
    const inputs: BattleInput[] = [
      { type: "attack", tick: 0, actor: "p0" },
      { type: "attack", tick: 10, actor: "p1" },
    ];
    const whole = step(battle(), inputs);
    const first = step(battle(), [inputs[0] as BattleInput], { untilTick: 10 });
    const rest = step(first.state, [inputs[1] as BattleInput]);
    expect([...first.events, ...rest.events]).toEqual(whole.events);
  });
});

describe("step: crystal drops", () => {
  function dropsOf(events: readonly BattleEvent[]): CrystalDroppedEvent[] {
    return events.filter((e): e is CrystalDroppedEvent => e.type === "CrystalDropped");
  }

  /** p0 uses its two-attack BB and p1 a normal attack on the first enemy. */
  function run(seed: number, setup: BattleSetup = burstSetup()) {
    return step(chargedBattle(setup, seed), [
      { type: "burst", tick: 0, actor: "p0", tier: "bb" },
      { type: "attack", tick: 2, actor: "p1" },
    ]);
  }

  it("is deterministic under a fixed seed", () => {
    const a = run(42);
    const b = run(42);
    expect(b.events).toEqual(a.events);
    expect(b.state).toEqual(a.state);
    expect(dropsOf(a.events).length).toBeGreaterThan(0);
  });

  it("credits BC to the attacker's gauge and HC healing, matching the events", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { state, events } = run(seed);
      for (const slot of ["p0", "p1"] as const) {
        const mine = dropsOf(events).filter((d) => d.collector === slot);
        const unit = state.party.find((u) => u.slot === slot);
        expect(unit?.bc).toBe(mine.reduce((n, d) => n + d.bcGained, 0));
        // Full HP: HC heals are capped to 0.
        expect(mine.every((d) => d.healed === 0 && d.hp === unit?.stats.hp)).toBe(true);
        // BC efficacy is 0, so each BC fills exactly 1 (the factory gauge max is 20).
        for (const d of mine) {
          expect(d.bcGained).toBeLessThanOrEqual(d.bc);
        }
      }
    }
  });

  it("heals a damaged collector by floor(REC / random[3.0, 4.2]) per HC", () => {
    let healedTotal = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const start = chargedBattle(burstSetup(), seed);
      const hurt = { ...start, party: start.party.map((u) => ({ ...u, hp: 100 })) };
      const { state, events } = step(hurt, [{ type: "burst", tick: 0, actor: "p0", tier: "bb" }]);
      const heals = dropsOf(events).filter((d) => d.hc > 0);
      for (const d of heals) {
        // Factory REC 900: floor(900 / 4.2) = 214 … floor(900 / 3.0) = 300 per HC.
        expect(d.healed).toBeGreaterThanOrEqual(214 * d.hc);
        expect(d.healed).toBeLessThanOrEqual(300 * d.hc);
      }
      const healed = heals.reduce((n, d) => n + d.healed, 0);
      expect(state.party[0]?.hp).toBe(100 + healed);
      healedTotal += healed;
    }
    expect(healedTotal).toBeGreaterThan(0);
  });

  it("emits CrystalDropped right after the hit's HitLanded, only when a crystal dropped", () => {
    const { events } = run(42);
    events.forEach((e, i) => {
      if (e.type === "CrystalDropped") {
        const prev = events[i - 1];
        expect(prev?.type).toBe("HitLanded");
        const hit = prev as HitLandedEvent;
        expect([hit.actionId, hit.attackIndex, hit.hitIndex, hit.tick]).toEqual([
          e.actionId,
          e.attackIndex,
          e.hitIndex,
          e.tick,
        ]);
        expect(e.bc + e.hc).toBeGreaterThan(0);
      }
    });
  });

  it("drops no BC from an enemy with 100% base BC resistance", () => {
    const setup = burstSetup();
    const resistant: BattleSetup = {
      ...setup,
      waves: setup.waves.map((wave) => wave.map((e) => ({ ...e, bcResistance: 1 }))),
    };
    for (const seed of [1, 2, 3, 4, 5]) {
      const { state, events } = run(seed, resistant);
      expect(dropsOf(events).every((d) => d.bc === 0)).toBe(true);
      expect(state.party.every((u) => u.bc === 0)).toBe(true);
    }
  });
});
