import type { Effect, Form } from "@bfr/data";
import { describe, expect, it } from "vitest";
import { burstThreshold, gaugeAfterBurst } from "../gauge/index.ts";
import { actionOdYield, turnEndOdYield } from "../gauge/overdrive.ts";
import { createRng, nextInt } from "../rng.ts";
import { createBattle } from "../state/create-battle.ts";
import type { BattleState } from "../state/types.ts";
import { step } from "../step.ts";
import { makeSetup, makeUnit } from "../test/factories.ts";
import type { ActiveEffect } from "./buffs.ts";
import {
  bcFillOnGuard,
  bcFillPerTurn,
  fillGauge,
  GAUGE_HANDLERS,
  GAUGE_IDS,
  gaugeModifiersFromEffects,
  odFillRate,
  rollBcFillWhenAttacked,
  rollConsumptionReduction,
} from "./gauge.ts";
import { applyEffect, EFFECT_REGISTRY, tickEffects } from "./index.ts";

const effect = (
  id: Effect["id"],
  value: number,
  turns?: number,
  target: Effect["target"] = "party",
): Effect => ({ id, value, ...(turns === undefined ? {} : { turns }), target });

const active = (id: Effect["id"], value: number, source: ActiveEffect["source"] = "bb") => ({
  ...effect(id, value, 3),
  source,
});

const INSTANT = ["bb.fill_instant", "od.fill_instant"];

function fixtureForm(overrides: Partial<Form["bursts"]> = {}): Form {
  const form = makeUnit("fixture").forms[0];
  if (!form) throw new Error("fixture needs a form");
  return { ...form, bursts: { ...form.bursts, ...overrides } };
}

/** A two-unit battle whose p0 BB carries `effects`; unit fields are overridden per slot. */
function battleWith(
  effects: Effect[],
  party: Partial<Record<"p0" | "p1", Partial<BattleState["party"][number]>>> = {},
): BattleState {
  const setup = makeSetup(2);
  const [first, second] = setup.squad;
  const form = first?.unit.forms[0];
  if (!first || !second || !form) throw new Error("setup needs two units");
  const burster = {
    ...first,
    unit: {
      ...first.unit,
      forms: [{ ...form, bursts: { bb: { ...form.bursts.bb, effects } } }],
    },
  };
  const initial = createBattle({ ...setup, squad: [burster, second] }, 7);
  return {
    ...initial,
    party: initial.party.map((unit) => ({
      ...unit,
      ...party[unit.slot as "p0" | "p1"],
    })),
  };
}

describe("gauge effects", () => {
  it("registers one handler per gauge ID", () => {
    for (const id of GAUGE_IDS) {
      expect(EFFECT_REGISTRY[id]).toBe(GAUGE_HANDLERS[id]);
    }
  });

  it.each(GAUGE_IDS.filter((id) => !INSTANT.includes(id)))(
    "stores %s with BB/SBB replacement and a separate UBB slot",
    (id) => {
      const bb = applyEffect([], effect(id, 0.2, 3), "bb");
      expect(bb).toEqual([{ ...effect(id, 0.2, 3), source: "bb" }]);
      const sbb = applyEffect(bb, effect(id, 0.3, 2), "sbb");
      expect(sbb).toEqual([{ ...effect(id, 0.3, 2), source: "sbb" }]);
      expect(applyEffect(sbb, effect(id, 0.1, 1), "ubb")).toHaveLength(2);
      expect(tickEffects(tickEffects(sbb))).toEqual([]);
    },
  );

  it.each(INSTANT)("%s stores nothing", (id) => {
    expect(applyEffect([], effect(id as Effect["id"], 10), "bb")).toEqual([]);
  });

  it("bb.cost_reduction and bb.consumption_reduction reproduce reference case Fill 3", () => {
    const form = fixtureForm({
      bb: { name: "BB", cost: 25, attacks: [], effects: [] },
      sbb: { name: "SBB", cost: 20, attacks: [], effects: [] },
    });
    const modifiers = gaugeModifiersFromEffects([
      active("bb.cost_reduction", 0.1),
      active("bb.cost_reduction", 0.1, "ubb"),
      active("bb.consumption_reduction", 0.5),
    ]);
    expect(modifiers).toEqual({ costReduction: 0.2, consumptionReduction: 0.5 });
    expect(burstThreshold(form, "bb", modifiers)).toBe(20);
    expect(burstThreshold(form, "sbb", modifiers)).toBe(36);
    expect(gaugeAfterBurst(form, "bb", modifiers)).toBe(10);
  });

  it("od.fill_rate boosts action and turn-end yields", () => {
    const rate = odFillRate([active("od.fill_rate", 0.2)]);
    expect(actionOdYield("attack", 0, rate)).toBe(360);
    expect(turnEndOdYield(rate)).toBe(600);
    expect(odFillRate([])).toBe(0);
  });

  it("bb.fill_per_turn, bb.fill_on_hit, and bb.fill_on_guard sum their slots", () => {
    const effects = [
      active("bb.fill_per_turn", 4),
      active("bb.fill_per_turn", 8, "ubb"),
      active("bb.fill_on_hit", 5),
      active("bb.fill_on_guard", 10),
    ];
    expect(bcFillPerTurn(effects)).toBe(12);
    expect(rollBcFillWhenAttacked(effects, createRng(1))).toEqual({ value: 5, rng: createRng(1) });
    expect(bcFillOnGuard(effects)).toBe(10);
    expect([
      bcFillPerTurn([]),
      rollBcFillWhenAttacked([], createRng(1)).value,
      bcFillOnGuard([]),
    ]).toEqual([0, 0, 0]);
  });

  it("fillGauge clamps to the gauge range and skips KO'd units", () => {
    const form = fixtureForm();
    expect(fillGauge({ form, bc: 5, hp: 100 }, 8)).toBe(13);
    expect(fillGauge({ form, bc: 15, hp: 100 }, 999)).toBe(20);
    expect(fillGauge({ form, bc: 5, hp: 0 }, 8)).toBe(5);
  });

  it("an active bb.cost_reduction lets step accept a cheaper burst and refunds consumption", () => {
    const state = battleWith([], {
      p0: {
        bc: 16,
        effects: [active("bb.cost_reduction", 0.2), active("bb.consumption_reduction", 0.5)],
      },
    });
    const result = step(state, [{ type: "burst", tick: 0, actor: "p0", tier: "bb" }]);
    expect(result.events.find((event) => event.type === "BurstUsed")).toMatchObject({
      gaugeBefore: 16,
      gaugeAfter: 8,
    });
    const plain = battleWith([], { p0: { bc: 16 } });
    expect(
      step(plain, [{ type: "burst", tick: 0, actor: "p0", tier: "bb" }]).events[0],
    ).toMatchObject({ type: "ActionRejected", reason: "insufficient_gauge" });
  });

  it("a ranged bb.consumption_reduction refunds a drawn share as the burst's first draw", () => {
    const ranged = { ...active("bb.consumption_reduction", 0), min: 0.2, max: 0.25 };
    const effects = [active("bb.consumption_reduction", 0.1), ranged];
    const state = battleWith([], { p0: { bc: 20, effects } });
    // Hand-worked: seed 7's next RandomBetween(20, 25) is 21, so the share is 0.1 + 0.21 = 0.31
    // and the 20 BC BB refunds 20 × 0.31 = 6.2 BC.
    const draw = nextInt(state.rng, 20, 25);
    expect(draw.value).toBe(21);
    const refund = rollConsumptionReduction(effects, state.rng);
    expect(refund.value).toBeCloseTo(0.31);
    expect(refund.rng).toEqual(draw.rng);
    const result = step(state, [{ type: "burst", tick: 0, actor: "p0", tier: "bb" }]);
    const used = result.events.find((event) => event.type === "BurstUsed");
    expect(used).toMatchObject({ gaugeBefore: 20 });
    expect(used && "gaugeAfter" in used ? used.gaugeAfter : undefined).toBeCloseTo(6.2);
    // The draw comes first: a fixed-only burst from the advanced RNG replays the rest exactly.
    const fixed = battleWith([], {
      p0: { bc: 20, effects: [active("bb.consumption_reduction", 0.31)] },
    });
    const replay = step({ ...fixed, rng: draw.rng }, [
      { type: "burst", tick: 0, actor: "p0", tier: "bb" },
    ]);
    expect(replay.state.rng).toEqual(result.state.rng);
    expect(replay.events.filter((event) => event.type === "HitLanded")).toEqual(
      result.events.filter((event) => event.type === "HitLanded"),
    );
  });

  it("a burst bb.fill_instant fills living targets after the burst empties the gauge", () => {
    const state = battleWith([effect("bb.fill_instant", 8)], {
      p0: { bc: 20 },
      p1: { bc: 15 },
    });
    const result = step(state, [{ type: "burst", tick: 0, actor: "p0", tier: "bb" }]);
    expect(result.events.filter((event) => event.type === "GaugeFilled")).toMatchObject([
      { actionId: 0, actor: "p0", target: "p0", effect: "bb.fill_instant", gained: 8, gauge: 8 },
      { actor: "p0", target: "p1", gained: 5, gauge: 20 },
    ]);
    expect(result.state.party.map((unit) => unit.bc)).toEqual([8, 20]);
    const koed = battleWith([effect("bb.fill_instant", 8)], { p0: { bc: 20 }, p1: { hp: 0 } });
    const skipped = step(koed, [{ type: "burst", tick: 0, actor: "p0", tier: "bb" }]);
    expect(skipped.state.party[1]?.bc).toBe(0);
  });

  it("a burst od.fill_instant adds a share of the OD limit to the action's OdGained", () => {
    const state = battleWith([effect("od.fill_instant", 0.1)], { p0: { bc: 20 } });
    const result = step(state, [{ type: "burst", tick: 0, actor: "p0", tier: "bb" }]);
    expect(result.events.filter((event) => event.type === "OdGained")).toMatchObject([
      { gained: 1000 + 100, points: 1100, limit: 10_000 },
    ]);
  });

  it("an active od.fill_rate boosts the OD yield of an attack in step", () => {
    const state = battleWith([], { p0: { effects: [active("od.fill_rate", 0.2)] } });
    const plain = step(battleWith([]), [{ type: "attack", tick: 0, actor: "p0" }]);
    const boosted = step(state, [{ type: "attack", tick: 0, actor: "p0" }]);
    const gained = (events: typeof plain.events) =>
      events.find((event) => event.type === "OdGained")?.gained ?? 0;
    expect(gained(boosted.events) - gained(plain.events)).toBe(60);
  });

  it("guarding with bb.fill_on_guard fills the gauge and emits GaugeFilled", () => {
    const state = battleWith([], { p0: { bc: 3, effects: [active("bb.fill_on_guard", 10)] } });
    const result = step(state, [{ type: "guard", tick: 0, actor: "p0" }]);
    expect(result.events).toMatchObject([
      { type: "Guarded", actor: "p0" },
      { type: "GaugeFilled", actor: "p0", target: "p0", effect: "bb.fill_on_guard", gained: 10 },
    ]);
    expect(result.state.party[0]?.bc).toBe(13);
    const plain = step(battleWith([]), [{ type: "guard", tick: 0, actor: "p0" }]);
    expect(plain.events).toHaveLength(1);
  });
});
