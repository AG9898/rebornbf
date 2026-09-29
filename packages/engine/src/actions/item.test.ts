import type { Item } from "@bfr/data";
import { describe, expect, it } from "vitest";
import type { ActiveEffect } from "../effects/buffs.ts";
import type { BattleEvent } from "../events.ts";
import { BattleSetupError, createBattle } from "../state/create-battle.ts";
import type { BattleState, BattleUnit, PlayerSlotId } from "../state/types.ts";
import { step } from "../step.ts";
import { makeSetup } from "../test/factories.ts";
import type { ItemInput } from "../timeline/types.ts";

const HEAL: Item = {
  id: "test-heal",
  name: "Test Heal",
  target: "single",
  effects: [{ kind: "heal", amount: 1000 }],
};
const PARTY_HEAL: Item = { ...HEAL, id: "test-party-heal", target: "party" };
const CURE: Item = {
  id: "test-cure",
  name: "Test Cure",
  target: "single",
  effects: [{ kind: "cure" }],
};
const POISON_CURE: Item = {
  ...CURE,
  id: "test-poison-cure",
  effects: [{ kind: "cure", ailments: ["poison"] }],
};
const REVIVE: Item = {
  id: "test-revive",
  name: "Test Revive",
  target: "single",
  effects: [{ kind: "revive", hpPercent: 25 }],
};
const FILL: Item = {
  id: "test-fill",
  name: "Test Fill",
  target: "single",
  effects: [{ kind: "bb_fill", bc: 8 }],
};

function battle(items: { item: Item; count: number }[]): BattleState {
  return createBattle({ ...makeSetup(2), items }, 7);
}

function patch(state: BattleState, slot: PlayerSlotId, change: Partial<BattleUnit>): BattleState {
  return { ...state, party: state.party.map((u) => (u.slot === slot ? { ...u, ...change } : u)) };
}

function use(state: BattleState, item: string, actor: PlayerSlotId = "p0") {
  const input: ItemInput = { type: "item", tick: state.tick, actor, item };
  return step(state, [input]);
}

function unit(state: BattleState, slot: PlayerSlotId): BattleUnit {
  const found = state.party.find((u) => u.slot === slot);
  if (!found) throw new Error(`no unit ${slot}`);
  return found;
}

function count(state: BattleState, id: string): number | undefined {
  return state.items.find((stack) => stack.item.id === id)?.count;
}

function types(events: readonly BattleEvent[]): string[] {
  return events.map((e) => e.type);
}

const poison: ActiveEffect = {
  id: "ailment.inflict.poison",
  value: 0,
  turns: 3,
  target: "self",
  source: "bb",
};
const curse: ActiveEffect = { ...poison, id: "ailment.inflict.curse" };
const atkDown: ActiveEffect = { ...poison, id: "debuff.atk_down", value: 0.3 };

describe("battle items (GAME_DESIGN §2 → Battle items)", () => {
  it("heal restores flat HP up to max HP and consumes one item", () => {
    const start = patch(battle([{ item: HEAL, count: 2 }]), "p0", { hp: 3500 });
    const { state, events } = use(start, "test-heal");
    expect(unit(state, "p0").hp).toBe(4000);
    expect(count(state, "test-heal")).toBe(1);
    expect(events).toEqual([
      { type: "ItemUsed", tick: 0, actor: "p0", item: "test-heal", remaining: 1 },
      { type: "HpRestored", tick: 0, target: "p0", effect: "item", amount: 500, hp: 4000 },
    ]);
  });

  it("a party heal reaches every living unit but not KO'd ones", () => {
    let start = patch(battle([{ item: PARTY_HEAL, count: 1 }]), "p0", { hp: 1000 });
    start = patch(start, "p1", { hp: 0 });
    const { state, events } = use(start, "test-party-heal");
    expect(unit(state, "p0").hp).toBe(2000);
    expect(unit(state, "p1").hp).toBe(0);
    expect(types(events)).toEqual(["ItemUsed", "HpRestored"]);
  });

  it("cure removes every ailment but leaves stat debuffs", () => {
    const start = patch(battle([{ item: CURE, count: 1 }]), "p0", {
      effects: [poison, curse, atkDown],
    });
    const { state, events } = use(start, "test-cure");
    expect(unit(state, "p0").effects.map((e) => e.id)).toEqual(["debuff.atk_down"]);
    expect(events.slice(1)).toEqual([
      { type: "EffectEnded", tick: 0, target: "p0", effect: "ailment.inflict.poison" },
      { type: "EffectEnded", tick: 0, target: "p0", effect: "ailment.inflict.curse" },
    ]);
  });

  it("a listed cure removes only its ailments", () => {
    const start = patch(battle([{ item: POISON_CURE, count: 1 }]), "p0", {
      effects: [poison, curse],
    });
    const { state } = use(start, "test-poison-cure");
    expect(unit(state, "p0").effects.map((e) => e.id)).toEqual(["ailment.inflict.curse"]);
  });

  it("revive brings a KO'd unit back with a share of max HP; it may still act", () => {
    const start = patch(battle([{ item: REVIVE, count: 1 }]), "p1", { hp: 0 });
    const { state, events } = use(start, "test-revive", "p1");
    expect(unit(state, "p1").hp).toBe(1000);
    expect(events[1]).toEqual({ type: "UnitRevived", tick: 0, target: "p1", hp: 1000 });
    const attack = step(state, [{ type: "attack", tick: 0, actor: "p1" }]);
    expect(types(attack.events)[0]).toBe("ActionStarted");
  });

  it("revive does nothing to a living unit and is not consumed", () => {
    const { state, events } = use(battle([{ item: REVIVE, count: 1 }]), "test-revive");
    expect(count(state, "test-revive")).toBe(1);
    expect(events).toEqual([
      { type: "ActionRejected", tick: 0, actor: "p0", reason: "item_no_effect" },
    ]);
  });

  it("BB fill adds crystals up to the gauge maximum", () => {
    const start = patch(battle([{ item: FILL, count: 3 }]), "p0", { bc: 15 });
    const { state, events } = use(start, "test-fill");
    expect(unit(state, "p0").bc).toBe(20);
    expect(events[1]).toEqual({
      type: "GaugeFilled",
      tick: 0,
      actor: "p0",
      target: "p0",
      effect: "item",
      gained: 5,
      gauge: 20,
    });
  });

  it("BB fill is blocked by Curse, so a cursed unit's fill is refused", () => {
    const start = patch(battle([{ item: FILL, count: 1 }]), "p0", { effects: [curse] });
    const { state, events } = use(start, "test-fill");
    expect(unit(state, "p0").bc).toBe(0);
    expect(count(state, "test-fill")).toBe(1);
    expect(types(events)).toEqual(["ActionRejected"]);
  });

  it("items do not use the unit's action or draw RNG", () => {
    const start = patch(battle([{ item: HEAL, count: 1 }]), "p0", { hp: 100 });
    const { state } = step(start, [
      { type: "item", tick: 0, actor: "p0", item: "test-heal" },
      { type: "attack", tick: 0, actor: "p0" },
    ]);
    expect(state.acted).toEqual(["p0"]);
    expect(use(start, "test-heal").state.rng).toEqual(start.rng);
  });

  it("the inventory never goes negative: an empty or unknown item is refused", () => {
    let state = patch(battle([{ item: HEAL, count: 1 }]), "p0", { hp: 100 });
    state = use(state, "test-heal").state;
    expect(count(state, "test-heal")).toBe(0);
    const again = use(patch(state, "p0", { hp: 100 }), "test-heal");
    expect(count(again.state, "test-heal")).toBe(0);
    expect(unit(again.state, "p0").hp).toBe(100);
    expect(again.events).toEqual([
      { type: "ActionRejected", tick: 0, actor: "p0", reason: "no_item" },
    ]);
    expect(use(state, "missing").events[0]).toMatchObject({ reason: "no_item" });
  });

  it("items are refused once the battle is over", () => {
    const over = {
      ...patch(battle([{ item: HEAL, count: 1 }]), "p0", { hp: 100 }),
      result: "win" as const,
    };
    const { state, events } = use(over, "test-heal");
    expect(count(state, "test-heal")).toBe(1);
    expect(events[0]).toMatchObject({ reason: "battle_over" });
  });

  it("setup rejects invalid items, duplicates, and bad counts; omitted means none", () => {
    expect(createBattle(makeSetup(1), 1).items).toEqual([]);
    expect(() => battle([{ item: HEAL, count: 0 }])).toThrow(BattleSetupError);
    expect(() => battle([{ item: HEAL, count: 1.5 }])).toThrow(BattleSetupError);
    expect(() =>
      battle([
        { item: HEAL, count: 1 },
        { item: HEAL, count: 2 },
      ]),
    ).toThrow(/already in the inventory/);
    expect(() => battle([{ item: { ...HEAL, effects: [] }, count: 1 }])).toThrow(BattleSetupError);
  });
});
