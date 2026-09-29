import { EFFECT_IDS, type Effect, ELEMENTS } from "@bfr/data";
import { AILMENT_HANDLERS, isAilmentId } from "./ailments.ts";
import { ATTACK_HANDLERS, isAttackId } from "./attack.ts";
import {
  type ActiveEffect,
  BUFF_HANDLERS,
  type BurstSource,
  isBuffId,
  isPassiveSource,
} from "./buffs.ts";
import { COND_HANDLERS, isCondId } from "./conditional.ts";
import { DROP_HANDLERS, isDropId } from "./drops.ts";
import { GAUGE_HANDLERS, isGaugeId } from "./gauge.ts";
import { isPassiveId, PASSIVE_HANDLERS } from "./passive.ts";
import { isSurvivalId, SURVIVAL_HANDLERS } from "./survival.ts";

export * from "./ailments.ts";
export * from "./attack.ts";
export * from "./buffs.ts";
export * from "./conditional.ts";
export * from "./drops.ts";
export * from "./gauge.ts";
export * from "./passive.ts";
export * from "./spark.ts";
export * from "./survival.ts";

/** Every catalog ID has a registered handler (one-shot IDs store nothing). */
export const EFFECT_REGISTRY: Readonly<
  Record<Effect["id"], (effects: readonly ActiveEffect[], effect: ActiveEffect) => ActiveEffect[]>
> = Object.fromEntries(
  EFFECT_IDS.map((id) => [
    id,
    isBuffId(id)
      ? BUFF_HANDLERS[id]
      : isSurvivalId(id)
        ? SURVIVAL_HANDLERS[id]
        : isGaugeId(id)
          ? GAUGE_HANDLERS[id]
          : isDropId(id)
            ? DROP_HANDLERS[id]
            : isAilmentId(id)
              ? AILMENT_HANDLERS[id]
              : isPassiveId(id)
                ? PASSIVE_HANDLERS[id]
                : isCondId(id)
                  ? COND_HANDLERS[id]
                  : isAttackId(id)
                    ? ATTACK_HANDLERS[id]
                    : (effects: readonly ActiveEffect[]) => [...effects],
  ]),
) as Record<
  Effect["id"],
  (effects: readonly ActiveEffect[], effect: ActiveEffect) => ActiveEffect[]
>;

export function assertKnownEffect(id: string): asserts id is Effect["id"] {
  if (!Object.hasOwn(EFFECT_REGISTRY, id))
    throw new Error(`unknown effect ID ${JSON.stringify(id)}`);
}

/** Applies a burst effect to one combatant. Zero-turn buffs have no active duration. */
export function applyEffect(
  effects: readonly ActiveEffect[],
  effect: Effect | Omit<ActiveEffect, "source">,
  source: BurstSource,
): ActiveEffect[] {
  assertKnownEffect(effect.id);
  if (
    effect.id === "buff.add_element" &&
    (!Number.isInteger(effect.value) || !ELEMENTS[effect.value])
  ) {
    throw new Error(`buff.add_element.value: expected an element index 0–${ELEMENTS.length - 1}`);
  }
  if (effect.turns === 0) return [...effects];
  return EFFECT_REGISTRY[effect.id](effects, { ...effect, source });
}

/** Called once at end of turn, after poison, healing, BB fill, and OD fill. */
export function tickEffects(effects: readonly ActiveEffect[]): ActiveEffect[] {
  return effects.flatMap((effect) => {
    if (effect.turns === undefined) return [effect];
    return effect.turns > 1 ? [{ ...effect, turns: effect.turns - 1 }] : [];
  });
}

/**
 * Effect IDs that were active (from a burst, skill, or trigger; passives are ignored) in `before`
 * and have no active effect left in `after`, in `before` order: what `EffectEnded` reports.
 */
export function endedEffectIds(
  before: readonly ActiveEffect[],
  after: readonly ActiveEffect[],
): Effect["id"][] {
  const live = (effects: readonly ActiveEffect[]) =>
    new Set(effects.filter((e) => !isPassiveSource(e.source)).map((e) => e.id));
  const remaining = live(after);
  return [...live(before)].filter((id) => !remaining.has(id));
}
