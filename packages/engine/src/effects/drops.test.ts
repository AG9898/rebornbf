import type { Effect, Form } from "@bfr/data";
import { describe, expect, it } from "vitest";
import { bcDropRate, hcDropRate, hcHeal } from "../drops/rates.ts";
import { collectCrystals } from "../drops/roll.ts";
import { createBattle } from "../state/create-battle.ts";
import { step } from "../step.ts";
import { makeSetup, makeUnit } from "../test/factories.ts";
import type { ActiveEffect } from "./buffs.ts";
import {
  bcDropBonusesFromEffects,
  collectModifiersFromEffects,
  DROP_HANDLERS,
  DROP_IDS,
  hcDropBonusFromEffects,
  itemDropBonusFromEffects,
  zelDropBonusFromEffects,
} from "./drops.ts";
import { applyEffect, EFFECT_REGISTRY, tickEffects } from "./index.ts";

const effect = (id: Effect["id"], value: number, turns?: number): Effect => ({
  id,
  value,
  ...(turns === undefined ? {} : { turns }),
  target: "party",
});

const active = (id: Effect["id"], value: number, source: ActiveEffect["source"] = "bb") => ({
  ...effect(id, value, 3),
  source,
});

describe("drop effects", () => {
  it("registers one handler per drop ID", () => {
    for (const id of DROP_IDS) {
      expect(EFFECT_REGISTRY[id]).toBe(DROP_HANDLERS[id]);
    }
  });

  it.each(DROP_IDS)("stores %s with BB/SBB replacement and a separate UBB slot", (id) => {
    const bb = applyEffect([], effect(id, 20, 3), "bb");
    expect(bb).toEqual([{ ...effect(id, 20, 3), source: "bb" }]);
    const sbb = applyEffect(bb, effect(id, 30, 2), "sbb");
    expect(sbb).toEqual([{ ...effect(id, 30, 2), source: "sbb" }]);
    expect(applyEffect(sbb, effect(id, 10, 1), "ubb")).toHaveLength(2);
    expect(tickEffects(tickEffects(sbb))).toEqual([]);
  });

  it("drop.bc fills the BB/SBB and UBB buff slots of the BC rate (reference case Fill 2)", () => {
    const bb = [active("drop.bc", 20)];
    expect(bcDropBonusesFromEffects(bb)).toEqual({ burstBuff: 20, ubbBuff: 0, leaderSkills: 0 });
    expect(bcDropRate(bcDropBonusesFromEffects(bb))).toBe(55);
    expect(bcDropRate({ ...bcDropBonusesFromEffects(bb), overkill: true })).toBe(110);
    const both = [...bb, active("drop.bc", 10, "ubb")];
    expect(bcDropRate(bcDropBonusesFromEffects(both))).toBe(65);
    expect(bcDropRate({ ...bcDropBonusesFromEffects(both), buffedResistance: 0.5 })).toBe(50);
  });

  it("drop.hc adds to the HC rate", () => {
    const effects = [active("drop.hc", 15), active("drop.hc", 5, "ubb")];
    expect(hcDropBonusFromEffects(effects)).toBe(20);
    expect(hcDropRate({ bonus: hcDropBonusFromEffects(effects) })).toBe(30);
  });

  it("drop.zel and drop.item sum their bonuses for the later zel and item rolls", () => {
    const effects = [
      active("drop.zel", 50),
      active("drop.item", 25),
      active("drop.item", 5, "ubb"),
    ];
    expect(zelDropBonusFromEffects(effects)).toBe(50);
    expect(itemDropBonusFromEffects(effects)).toBe(30);
  });

  it("bc.efficacy and bb.fill_rate reproduce reference case Fill 1", () => {
    const base = makeUnit("fixture").forms[0];
    if (!base) throw new Error("fixture needs a form");
    const form: Form = {
      ...base,
      bursts: {
        bb: { ...base.bursts.bb, cost: 25 },
        sbb: { name: "SBB", cost: 20, attacks: [], effects: [] },
      },
    };
    const drops = { bc: 20, hc: 0, hcDivisors: [] };
    const collector = { form, maxHp: 4000, hp: 4000, bc: 0, recTotal: 900 };
    for (const effects of [
      [active("bc.efficacy", 0.75)],
      [active("bb.fill_rate", 0.5), active("bc.efficacy", 0.25)],
    ]) {
      const modifiers = collectModifiersFromEffects(effects);
      expect(modifiers.bcEfficacy).toBe(0.75);
      expect(collectCrystals(collector, drops, modifiers).bc).toBe(35);
    }
  });

  it("hc.efficacy scales HC healing only", () => {
    const modifiers = collectModifiersFromEffects([active("hc.efficacy", 0.5)]);
    expect(modifiers).toEqual({ bcEfficacy: 0, hcEfficacy: 0.5 });
    expect(hcHeal(1200, 3, modifiers.hcEfficacy)).toBe(600);
  });

  it("step uses the attacker's drop.bc and bc.efficacy when rolling and collecting BC", () => {
    const initial = createBattle(makeSetup(1), 11);
    const resisted = {
      ...initial,
      enemies: initial.enemies.map((enemy) => ({ ...enemy, bcResistance: 1 })),
    };
    const drops = (effects: ActiveEffect[]) =>
      step(
        {
          ...resisted,
          party: resisted.party.map((unit) => ({ ...unit, effects })),
        },
        [{ type: "attack", tick: 0, actor: "p0" }],
      ).events.filter((event) => event.type === "CrystalDropped");
    // Base rate 0 under full base resistance: no BC can spawn.
    expect(drops([]).every((event) => event.bc === 0)).toBe(true);
    // +100% drop buff → rate 100: both checks of each hit spawn; +50% efficacy fills 3 per hit.
    const boosted = drops([active("drop.bc", 100), active("bc.efficacy", 0.5)]);
    expect(boosted.map((event) => [event.bc, event.bcGained])).toEqual([
      [2, 3],
      [2, 3],
    ]);
  });
});
