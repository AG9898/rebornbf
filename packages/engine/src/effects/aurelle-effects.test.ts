import type { Burst, Effect } from "@bfr/data";
import { describe, expect, it } from "vitest";
import { bcDropRate, hcDropRate } from "../drops/rates.ts";
import { rollHitDrops } from "../drops/roll.ts";
import type { BattleEvent } from "../events.ts";
import { nextInt } from "../rng.ts";
import { createBattle } from "../state/create-battle.ts";
import type { BattleState, BattleUnit } from "../state/types.ts";
import { applyBurstEffect, step } from "../step.ts";
import { makeEnemy, makeMember } from "../test/factories.ts";
import { addedAilmentChances, rollAddedAilments } from "./ailments.ts";
import type { ActiveEffect } from "./buffs.ts";
import { applyEffect } from "./index.ts";

// Aurelle's attack procs (M1-06L, GAME_DESIGN §4 Kit additions (M2-04G)). The test unit has a
// 2-hit (50/50) normal attack landing at ticks 20 and 30 with 4 drop checks (2 per hit).

function ofType<T extends BattleEvent["type"]>(
  events: readonly BattleEvent[],
  type: T,
): Extract<BattleEvent, { type: T }>[] {
  return events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);
}

const add = (ailment: Effect["ailment"], value: number): Effect => ({
  id: "buff.add_ailment",
  ailment,
  value,
  turns: 3,
  target: "party",
});

function duel(seed = 5): BattleState {
  return createBattle(
    { squad: [makeMember("solo")], leaderIndex: 0, waves: [[makeEnemy("dummy")]] },
    seed,
  );
}

function patchUnit(state: BattleState, patch: Partial<BattleUnit>): BattleState {
  return { ...state, party: state.party.map((u, i) => (i === 0 ? { ...u, ...patch } : u)) };
}

/** Gives the unit a one-attack BB (cost 20, gauge full) with the given hits and shape. */
function withBurst(state: BattleState, hits: number, shape: Effect): BattleState {
  const unit = state.party[0];
  if (!unit) throw new Error("no unit");
  const bb: Burst = {
    name: "Test Burst",
    cost: 20,
    attacks: [
      {
        moveType: "melee",
        startDelayFrames: 20,
        hitFrames: Array.from({ length: hits }, (_, i) => i * 10),
        damageDistribution: Array.from({ length: hits }, (_, i) =>
          i === 0 ? 100 - Math.floor(100 / hits) * (hits - 1) : Math.floor(100 / hits),
        ),
        dropChecks: hits * 5,
      },
    ],
    effects: [shape],
  };
  const form = { ...unit.form, bursts: { ...unit.form.bursts, bb } };
  return patchUnit(state, { form, bc: 20 });
}

const attack = [{ type: "attack" as const, tick: 0, actor: "p0" as const }];
const burst = [{ type: "burst" as const, tick: 0, actor: "p0" as const, tier: "bb" as const }];

describe("buff.add_ailment stacking", () => {
  it("keeps different ailments in one slot; the same ailment replaces within its slot", () => {
    let effects = applyEffect([], add("paralysis", 10), "bb");
    effects = applyEffect(effects, add("weak", 20), "bb");
    expect(effects.map((e) => e.ailment)).toEqual(["paralysis", "weak"]);
    effects = applyEffect(effects, add("paralysis", 15), "sbb");
    expect(effects.map((e) => [e.ailment, e.value, e.source])).toEqual([
      ["weak", 20, "bb"],
      ["paralysis", 15, "sbb"],
    ]);
    // The UBB slot is separate: its Paralysis joins the SBB's.
    effects = applyEffect(effects, add("paralysis", 10), "ubb");
    expect(effects).toHaveLength(3);
  });

  it("adds each ailment's chances across slots, capped at 100, in AILMENTS order", () => {
    const leader: ActiveEffect = { ...add("paralysis", 10), source: "leader" };
    const effects = [
      ...applyEffect(applyEffect([], add("paralysis", 10), "bb"), add("weak", 60), "bb"),
      ...applyEffect([], add("weak", 60), "ubb"),
      leader,
    ];
    expect(addedAilmentChances(effects)).toEqual([
      { ailment: "weak", chance: 100 },
      { ailment: "paralysis", chance: 20 },
    ]);
  });

  it("lets a burst add six ailments at once, and a later burst's set replace them", () => {
    const m = { rng: duel().rng };
    const target = { effects: [] as ActiveEffect[], hp: 100, slot: "p0" };
    const sets = new Set<string>();
    const six = ["poison", "weak", "sick", "injury", "curse", "paralysis"] as const;
    for (const ailment of six) {
      target.effects = applyBurstEffect(m, target, add(ailment, 5), "bb", "party", sets);
    }
    expect(target.effects.map((e) => e.ailment)).toEqual([...six]);
    // A new burst (fresh action set) replaces the BB slot's whole set.
    const next = applyBurstEffect(m, target, add("curse", 10), "sbb", "party", new Set());
    expect(next.map((e) => [e.ailment, e.value])).toEqual([["curse", 10]]);
  });
});

describe("buff.add_ailment infliction", () => {
  it("rolls once per ailment in AILMENTS order and lands below the chance", () => {
    const { rng } = duel();
    const effects = applyEffect(applyEffect([], add("paralysis", 100), "bb"), add("weak", 1), "bb");
    const weak = nextInt(rng, 0, 99);
    const paralysis = nextInt(weak.rng, 0, 99);
    const roll = rollAddedAilments(rng, effects, "enemy");
    expect(roll.rng).toEqual(paralysis.rng);
    expect(roll.value).toEqual([
      ...(weak.value < 1
        ? [{ id: "ailment.inflict.weak", value: 1, turns: 3, target: "enemies" }]
        : []),
      // Paralysis lasts 1 turn on enemies.
      { id: "ailment.inflict.paralysis", value: 100, turns: 1, target: "enemies" },
    ]);
  });

  it("rolls on a normal attack's first hit, after that hit's drop draws, not per hit", () => {
    const effects = applyEffect(
      applyEffect([], add("paralysis", 100), "bb"),
      add("weak", 50),
      "bb",
    );
    const start = patchUnit(duel(), { effects });
    const begun = step(start, attack, { untilTick: 0 });
    // Hit 1 (tick 20): 2 BC checks + HC roll, then the Weak draw, then the Paralysis draw.
    const hit1 = rollHitDrops(begun.state.rng, { checks: 2, bcRate: 0, hcRate: hcDropRate() });
    const weak = nextInt(hit1.rng, 0, 99);
    const paralysis = nextInt(weak.rng, 0, 99);
    // Hit 2 (tick 30): drops only.
    const hit2 = rollHitDrops(paralysis.rng, { checks: 2, bcRate: 0, hcRate: hcDropRate() });
    const { state, events } = step(begun.state, []);
    expect(state.rng).toEqual(hit2.rng);
    const applied = ofType(events, "EffectApplied");
    expect(applied.map((e) => [e.tick, e.target, e.effect.id])).toEqual([
      ...(weak.value < 50 ? [[20, "e0", "ailment.inflict.weak"]] : []),
      [20, "e0", "ailment.inflict.paralysis"],
    ]);
    const enemy = state.enemies[0];
    expect(enemy?.effects.find((e) => e.id === "ailment.inflict.paralysis")?.turns).toBe(1);
    expect(enemy?.effects.some((e) => e.id === "ailment.inflict.weak")).toBe(weak.value < 50);
  });

  it("draws nothing when the attacker adds no ailment or the hit KOs the foe", () => {
    const plain = step(duel(), attack);
    const effects = applyEffect([], add("paralysis", 100), "bb");
    const buffed = step(patchUnit(duel(), { effects }), attack);
    expect(buffed.state.rng).not.toEqual(plain.state.rng);
    const weakFoe = (state: BattleState): BattleState => ({
      ...state,
      enemies: state.enemies.map((e) => ({ ...e, hp: 1 })),
    });
    const bare = step(weakFoe(duel()), attack);
    const killed = step(weakFoe(patchUnit(duel(), { effects })), attack);
    expect(killed.state.rng).toEqual(bare.state.rng);
    expect(ofType(killed.events, "EffectApplied")).toHaveLength(0);
  });

  it("rolls every hit of a random-target attack, but once per single-target attack", () => {
    const effects = applyEffect([], add("paralysis", 100), "bb");
    const random = withBurst(patchUnit(duel(), { effects }), 3, {
      id: "attack.random",
      value: 1,
      target: "enemies",
    });
    const single = withBurst(patchUnit(duel(), { effects }), 3, {
      id: "attack.st",
      value: 1,
      target: "enemy",
    });
    const inflicted = (state: BattleState): number =>
      ofType(step(state, burst).events, "EffectApplied").filter(
        (e) => e.effect.id === "ailment.inflict.paralysis",
      ).length;
    expect(inflicted(random)).toBe(3);
    expect(inflicted(single)).toBe(1);
  });
});

describe("bcDrop on attack shapes", () => {
  it("adds the attack's own bonus to the BC rate: 35 + 10 = 45, 35 + 50 = 85", () => {
    expect(bcDropRate({ inherent: 10 })).toBe(45);
    expect(bcDropRate({ inherent: 50, overkill: true })).toBe(170);
  });

  it("raises each of the attack's hits' BC rate by its bcDrop", () => {
    const start = withBurst(duel(9), 1, {
      id: "attack.st",
      value: 1,
      target: "enemy",
      bcDrop: 50,
    });
    const begun = step(start, burst, { untilTick: 0 });
    expect(begun.state.timeline.map((h) => h.bcDrop)).toEqual([50]);
    // One hit with 5 checks: draws in [0, 100] spawn a BC when ≤ 85 (not ≤ 35).
    const params = { checks: 5, hcRate: hcDropRate() };
    const drops = rollHitDrops(begun.state.rng, { ...params, bcRate: 85 });
    const base = rollHitDrops(begun.state.rng, { ...params, bcRate: 35 });
    expect(drops.value.bc).toBeGreaterThan(base.value.bc);
    const { state, events } = step(begun.state, []);
    expect(state.rng).toEqual(drops.rng);
    expect(ofType(events, "CrystalDropped")[0]?.bc).toBe(drops.value.bc);
  });
});
