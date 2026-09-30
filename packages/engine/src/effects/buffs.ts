import { type Effect, ELEMENTS, type Element } from "@bfr/data";

/** Burst tiers that apply effects. */
export type BurstSource = "bb" | "sbb" | "ubb";
/** Skill/equipment/SP sources rebuilt on each passive refresh. */
export type PassiveSource = "leader" | "ally_leader" | "extra" | "sphere" | "sp";
/**
 * Effects a passive grants when its trigger fires (`mitigation_after_damage` → `mitigation`). They
 * count in the passive slot but survive `refreshPassives` and expire by their own `turns`.
 */
export type TriggeredSource = "triggered";

export function isPassiveSource(source: ActiveEffect["source"]): source is PassiveSource {
  return (
    source === "leader" ||
    source === "ally_leader" ||
    source === "extra" ||
    source === "sphere" ||
    source === "sp"
  );
}

/** An effect currently attached to a combatant. Omitted turns means permanent. */
export interface ActiveEffect extends Effect {
  readonly source: BurstSource | PassiveSource | TriggeredSource;
  /**
   * `heal.over_time` with `recBonus` from a burst: the healer's total REC when it was applied
   * (GAME_DESIGN §4 → Survival effects). Absent → the recipient's own total REC.
   */
  readonly healerRec?: number;
  /**
   * `mitigation_after_damage` from a skill: the duration of the mitigation it grants when its
   * threshold is reached (the skill's `turns`; passives otherwise store no turns).
   */
  readonly triggerTurns?: number;
  /**
   * `debuff.dot`: the inflicter's unbuffed ATK (base ATK including imps) and element, snapshotted
   * when the burst or skill applies it (GAME_DESIGN §4 → Ailments and debuffs; RESOLVED-49).
   */
  readonly dotAtk?: number;
  readonly dotElement?: Element;
}

/**
 * The stacking slot of an active effect: BB and SBB share `bb`, UBB has `ubb`, and every
 * leader-skill, Extra Skill, and triggered effect is `passive` (GAME_DESIGN §3 buff stacking).
 */
export function effectSlot(effect: ActiveEffect): "bb" | "ubb" | "passive" {
  if (effect.source === "ubb") return "ubb";
  return effect.source === "bb" || effect.source === "sbb" ? "bb" : "passive";
}

export type BuffId = Extract<Effect["id"], `buff.${string}`>;
export type BuffHandler = (
  effects: readonly ActiveEffect[],
  effect: ActiveEffect,
) => ActiveEffect[];

/** BB and SBB share a slot per effect ID; UBB buffs have their own slot. */
export function replaceBuff(
  effects: readonly ActiveEffect[],
  effect: ActiveEffect,
): ActiveEffect[] {
  const category = effectSlot(effect);
  return [
    ...effects.filter((active) => active.id !== effect.id || effectSlot(active) !== category),
    effect,
  ];
}

/**
 * `buff.add_element` (GAME_DESIGN §4 Kit additions (M2-04E)): added elements of different
 * elements coexist in a slot; the same element in the same slot replaces. A new burst's set of
 * added elements replaces the slot's old set via `clearAddedElements` before its first one applies.
 */
export function addElementBuff(
  effects: readonly ActiveEffect[],
  effect: ActiveEffect,
): ActiveEffect[] {
  const category = effectSlot(effect);
  return [
    ...effects.filter(
      (active) =>
        active.id !== "buff.add_element" ||
        effectSlot(active) !== category ||
        active.value !== effect.value,
    ),
    effect,
  ];
}

/**
 * `buff.add_ailment` (GAME_DESIGN §4 Kit additions (M2-04G)): added ailments of different
 * ailments coexist in a slot; the same ailment in the same slot replaces. A new burst's set
 * replaces the slot's old set via `clearSlotEffects` before its first one applies.
 */
export function addAilmentBuff(
  effects: readonly ActiveEffect[],
  effect: ActiveEffect,
): ActiveEffect[] {
  const category = effectSlot(effect);
  return [
    ...effects.filter(
      (active) =>
        active.id !== "buff.add_ailment" ||
        effectSlot(active) !== category ||
        active.ailment !== effect.ailment,
    ),
    effect,
  ];
}

/** Effect IDs whose several effects coexist in one slot, and whose burst set replaces as a whole. */
export type SetBuffId = "buff.add_element" | "buff.add_ailment";

export function isSetBuffId(id: Effect["id"]): id is SetBuffId {
  return id === "buff.add_element" || id === "buff.add_ailment";
}

/** Removes the `id` effects that share `source`'s slot (a new burst's set replaces them). */
export function clearSlotEffects(
  effects: readonly ActiveEffect[],
  id: SetBuffId,
  source: ActiveEffect["source"],
): ActiveEffect[] {
  const category = effectSlot({ id, value: 0, target: "self", source });
  return effects.filter((active) => active.id !== id || effectSlot(active) !== category);
}

/** Removes the `buff.add_element` effects that share `source`'s slot (a new set replaces them). */
export function clearAddedElements(
  effects: readonly ActiveEffect[],
  source: ActiveEffect["source"],
): ActiveEffect[] {
  return clearSlotEffects(effects, "buff.add_element", source);
}

/** One registered handler per stat buff ID in the content catalog. */
export const BUFF_HANDLERS: Readonly<Record<BuffId, BuffHandler>> = {
  "buff.atk": replaceBuff,
  "buff.def": replaceBuff,
  "buff.rec": replaceBuff,
  "buff.crit_rate": replaceBuff,
  "buff.crit_dmg": replaceBuff,
  "buff.spark_dmg": replaceBuff,
  "buff.elem_weak_dmg": replaceBuff,
  "buff.add_element": addElementBuff,
  "buff.bb_atk": replaceBuff,
  "buff.atk_from_def": replaceBuff,
  // Rolled per sparked hit by `rollSparkCritical` (effects/spark.ts).
  "buff.spark_crit": replaceBuff,
  // Rolled on the attacker's hits by `rollAddedAilments` (effects/ailments.ts).
  "buff.add_ailment": addAilmentBuff,
};

export function isBuffId(id: Effect["id"]): id is BuffId {
  return id.startsWith("buff.");
}

export function buffTotal(
  effects: readonly ActiveEffect[],
  id: Exclude<BuffId, SetBuffId>,
): number {
  return effects.reduce((total, effect) => total + (effect.id === id ? effect.value : 0), 0);
}

/** `buff.add_element.value` is a zero-based index into `ELEMENTS`. */
export function addedElements(effects: readonly ActiveEffect[]): Element[] {
  return effects.flatMap((effect) => {
    if (effect.id !== "buff.add_element") return [];
    const element = ELEMENTS[effect.value];
    return element ? [element] : [];
  });
}

/**
 * Flat ATK from Parameter Conversion (BF Wiki *Parameter Conversion*): Σ `buff.atk_from_def`
 * × the unit's total DEF (its own DEF buffs and passives applied), added after the ATK % sum.
 */
export function defConversionAtk(effects: readonly ActiveEffect[], defTotal: number): number {
  return Math.max(0, buffTotal(effects, "buff.atk_from_def") * defTotal);
}
