import { describe, expect, it } from "vitest";
import { attackTotal } from "../formulas/attack-stat.ts";
import { attackCore, hitDamage, rollAttack } from "../formulas/damage.ts";
import { createBattle } from "../state/create-battle.ts";
import type { BattleState } from "../state/types.ts";
import { step } from "../step.ts";
import { makeSetup, makeUnit, singleTargetShapes } from "../test/factories.ts";
import type { BurstTier } from "../timeline/types.ts";
import { burstThreshold, canBurst, gaugeAfterBurst } from "./index.ts";

const attack = {
  moveType: "ranged" as const,
  startDelayFrames: 0,
  hitFrames: [0],
  damageDistribution: [100],
  dropChecks: 0,
};

function setup() {
  const base = makeSetup(1);
  const unit = makeUnit("tiers");
  const form = unit.forms[0];
  if (!form) throw new Error("missing form");
  const shaped = (modifier: number) => [
    ...form.bursts.bb.effects,
    ...singleTargetShapes(1, modifier),
  ];
  const bb = { ...form.bursts.bb, cost: 25, attacks: [attack], effects: shaped(3) };
  const tiered = {
    ...form,
    rarity: "omni" as const,
    bursts: {
      bb,
      sbb: { ...bb, cost: 20, effects: shaped(4) },
      ubb: { ...bb, cost: 30, effects: shaped(5) },
    },
  };
  return {
    ...base,
    squad: [
      {
        unit: { ...unit, forms: [tiered] },
        formId: tiered.id,
        stats: base.squad[0]?.stats ?? form.stats.max,
      },
    ],
  };
}

function withGauge(state: BattleState, bc: number, overdrive = false): BattleState {
  return { ...state, party: state.party.map((unit) => ({ ...unit, bc, overdrive })) };
}

describe("burst gauge tiers", () => {
  it("crosses BB, SBB, and UBB at their exact configured thresholds", () => {
    const form = createBattle(setup(), 1).party[0]?.form;
    if (!form) throw new Error("missing form");
    expect(["bb", "sbb", "ubb"].map((tier) => burstThreshold(form, tier as BurstTier))).toEqual([
      25, 45, 30,
    ]);
    for (const [tier, threshold] of [
      ["bb", 25],
      ["sbb", 45],
      ["ubb", 30],
    ] as const) {
      expect(canBurst(form, tier, threshold - 1, true)).toBe(false);
      expect(canBurst(form, tier, threshold, true)).toBe(true);
    }
    expect(canBurst(form, "ubb", 45, false)).toBe(false);
    // GAME_DESIGN Fill 3: ceil(25×0.8)=20, ceil(20×0.8)=16; BB refund 20×0.5=10.
    const mods = { costReduction: 0.2, consumptionReduction: 0.5 };
    expect(burstThreshold(form, "bb", mods)).toBe(20);
    expect(burstThreshold(form, "sbb", mods)).toBe(36);
    expect(gaugeAfterBurst(form, "bb", mods)).toBe(10);
  });

  it("rejects an underfilled burst without spending gauge or RNG", () => {
    const start = withGauge(createBattle(setup(), 7), 24);
    const { state, events } = step(start, [{ type: "burst", tick: 0, actor: "p0", tier: "bb" }]);
    expect(events).toEqual([
      { type: "ActionRejected", tick: 0, actor: "p0", reason: "insufficient_gauge" },
    ]);
    expect(state.party[0]?.bc).toBe(24);
    expect(state.rng).toEqual(start.rng);
    expect(state.acted).toEqual([]);
    const sbb = step(withGauge(start, 44), [{ type: "burst", tick: 0, actor: "p0", tier: "sbb" }]);
    expect(sbb.events).toEqual([
      { type: "ActionRejected", tick: 0, actor: "p0", reason: "insufficient_gauge" },
    ]);
  });

  it("spends the full gauge, emits BurstUsed, and applies the burst damage modifier", () => {
    const start = withGauge(createBattle(setup(), 7), 45);
    const draw = rollAttack(start.rng, 0);
    const core = attackCore({
      atkTotal: attackTotal({ atk: 1400, statMods: 0.5, bbModifier: 4 }),
      targetDef: 500,
      rolls: draw.value,
      elementMult: 1.5,
    });
    const { state, events } = step(start, [{ type: "burst", tick: 0, actor: "p0", tier: "sbb" }]);
    expect(events[1]).toEqual({
      type: "BurstUsed",
      tick: 0,
      actionId: 0,
      actor: "p0",
      tier: "sbb",
      gaugeBefore: 45,
      gaugeAfter: 0,
    });
    expect(events.find((event) => event.type === "HitLanded")).toMatchObject({
      damage: hitDamage(core, 100),
    });
    expect(state.party[0]?.bc).toBe(0);
  });

  it("requires Overdrive for UBB and exits it after use", () => {
    const start = withGauge(createBattle(setup(), 7), 30);
    const input = [{ type: "burst" as const, tick: 0, actor: "p0" as const, tier: "ubb" as const }];
    expect(step(start, input).events).toEqual([
      { type: "ActionRejected", tick: 0, actor: "p0", reason: "overdrive_required" },
    ]);
    expect(step(withGauge(start, 29, true), input).events).toEqual([
      { type: "ActionRejected", tick: 0, actor: "p0", reason: "insufficient_gauge" },
    ]);
    const { state, events } = step(withGauge(start, 30, true), input);
    expect(events.some((event) => event.type === "BurstUsed" && event.tier === "ubb")).toBe(true);
    expect(state.party[0]?.overdrive).toBe(false);
  });
});
