import type { Ailment, ItemEffect } from "@bfr/data";
import { AILMENTS } from "@bfr/data";
import type { ActiveEffect } from "../effects/buffs.ts";
import { fillGauge } from "../effects/gauge.ts";
import type { BattleEvent } from "../events.ts";
import type { BattleItemStack, BattleUnit } from "../state/types.ts";
import type { ItemInput } from "../timeline/types.ts";

/** The mutable battle parts an item touches. */
export interface ItemScope {
  party: BattleUnit[];
  items: BattleItemStack[];
}

/** Every event an item's effects emit for one unit. */
type ItemResultEvent = Extract<
  BattleEvent,
  { type: "UnitRevived" | "HpRestored" | "EffectEnded" | "GaugeFilled" }
>;

function curedIds(ailments: readonly Ailment[] | undefined): Set<string> {
  return new Set((ailments ?? AILMENTS).map((ailment) => `ailment.inflict.${ailment}`));
}

/**
 * Applies one item effect to one unit (GAME_DESIGN §2 → Battle items). `revive` reaches only a
 * KO'd unit; `heal`, `cure`, and `bb_fill` reach only a living one. Returns the unit unchanged
 * when the effect does nothing.
 */
function applyItemEffect(
  unit: BattleUnit,
  effect: ItemEffect,
  tick: number,
  actor: BattleUnit["slot"],
  events: ItemResultEvent[],
): BattleUnit {
  if (effect.kind === "revive") {
    if (unit.hp > 0) return unit;
    const hp = Math.min(
      unit.stats.hp,
      Math.max(1, Math.floor((unit.stats.hp * effect.hpPercent) / 100)),
    );
    events.push({ type: "UnitRevived", tick, target: unit.slot, hp });
    return { ...unit, hp };
  }
  if (unit.hp <= 0) return unit;
  if (effect.kind === "heal") {
    const hp = Math.min(unit.stats.hp, unit.hp + effect.amount);
    if (hp === unit.hp) return unit;
    events.push({
      type: "HpRestored",
      tick,
      target: unit.slot,
      effect: "item",
      amount: hp - unit.hp,
      hp,
    });
    return { ...unit, hp };
  }
  if (effect.kind === "cure") {
    const ids = curedIds(effect.ailments);
    const kept: ActiveEffect[] = unit.effects.filter((active) => !ids.has(active.id));
    if (kept.length === unit.effects.length) return unit;
    const ended = [...new Set(unit.effects.filter((a) => ids.has(a.id)).map((a) => a.id))];
    for (const id of ended)
      events.push({ type: "EffectEnded", tick, target: unit.slot, effect: id });
    return { ...unit, effects: kept };
  }
  const bc = fillGauge(unit, effect.bc);
  if (bc === unit.bc) return unit;
  events.push({
    type: "GaugeFilled",
    tick,
    actor,
    target: unit.slot,
    effect: "item",
    gained: bc - unit.bc,
    gauge: bc,
  });
  return { ...unit, bc };
}

/**
 * Item bar (GAME_DESIGN §2 → Battle items): uses one `input.item` from the inventory on
 * `input.actor`, or on every party unit for a `party` item. Each unit takes the item's effects in
 * order. Rejected with `no_item` when none are left, or `item_no_effect` when no effect would
 * change anything (nothing is consumed either way). Uses no unit's action, draws no RNG, and
 * yields no OD points.
 */
export function useItem(scope: ItemScope, input: ItemInput, events: BattleEvent[]): void {
  const index = scope.items.findIndex((stack) => stack.item.id === input.item);
  const stack = scope.items[index];
  if (!stack || stack.count <= 0) {
    events.push({
      type: "ActionRejected",
      tick: input.tick,
      actor: input.actor,
      reason: "no_item",
    });
    return;
  }
  const results: ItemResultEvent[] = [];
  const party = scope.party.map((unit) => {
    if (stack.item.target === "single" && unit.slot !== input.actor) return unit;
    return stack.item.effects.reduce(
      (current, effect) => applyItemEffect(current, effect, input.tick, input.actor, results),
      unit,
    );
  });
  if (results.length === 0) {
    events.push({
      type: "ActionRejected",
      tick: input.tick,
      actor: input.actor,
      reason: "item_no_effect",
    });
    return;
  }
  scope.party.splice(0, scope.party.length, ...party);
  const remaining = stack.count - 1;
  scope.items[index] = { ...stack, count: remaining };
  events.push({
    type: "ItemUsed",
    tick: input.tick,
    actor: input.actor,
    item: input.item,
    remaining,
  });
  events.push(...results);
}
