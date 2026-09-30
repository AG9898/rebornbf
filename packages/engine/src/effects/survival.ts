import type { Effect } from "@bfr/data";
import type { MitigationInput } from "../formulas/mitigation.ts";
import { floorDamage } from "../formulas/rounding.ts";
import { nextInt, type RngState } from "../rng.ts";
import type { BattleUnit } from "../state/types.ts";
import { type ActiveEffect, effectSlot, replaceBuff } from "./buffs.ts";
import { crossesThreshold } from "./gauge.ts";

/**
 * Survival effects (GAME_DESIGN §4 → Survival effects). Heal ranges, healer REC bonuses, and proc
 * chances use the optional `min`/`max`/`recBonus`/`chance` fields (RESOLVED-34); without them the
 * single-value encodings apply and no RNG is drawn.
 */
export const SURVIVAL_IDS = [
  "heal.instant",
  "heal.over_time",
  "mitigation",
  "elemental_mitigation",
  "angel_idol",
  "damage_to_heal",
  "chance_mitigation",
  "mitigation_after_damage",
  "barrier",
  "crit_resist",
  "guard_mitigation",
  "hp_drain",
  "elem_weak_resist",
  "damage_reflect",
] as const satisfies readonly Effect["id"][];

export type SurvivalId = (typeof SURVIVAL_IDS)[number];
export type SurvivalHandler = (
  effects: readonly ActiveEffect[],
  effect: ActiveEffect,
) => ActiveEffect[];

/** `heal.instant` changes HP at burst start (`burstHealAmount`); nothing is stored. */
const instant: SurvivalHandler = (effects) => [...effects];

/** A new barrier replaces any barrier the combatant has, whatever its slot (one barrier at a time). */
const replaceBarrier: SurvivalHandler = (effects, effect) => [
  ...effects.filter((active) => active.id !== "barrier"),
  effect,
];

/**
 * One registered handler per survival ID. Lasting ones use the BB/SBB vs UBB slot rule, except
 * `barrier` (one at a time).
 */
export const SURVIVAL_HANDLERS: Readonly<Record<SurvivalId, SurvivalHandler>> = {
  "heal.instant": instant,
  "heal.over_time": replaceBuff,
  mitigation: replaceBuff,
  elemental_mitigation: replaceBuff,
  angel_idol: replaceBuff,
  damage_to_heal: replaceBuff,
  chance_mitigation: replaceBuff,
  mitigation_after_damage: replaceBuff,
  barrier: replaceBarrier,
  crit_resist: replaceBuff,
  guard_mitigation: replaceBuff,
  hp_drain: replaceBuff,
  elem_weak_resist: replaceBuff,
  // Stored only until M1-06M (GAME_DESIGN §4 → Kit additions (M2-04H)): no counter damage yet.
  damage_reflect: replaceBuff,
};

export function isSurvivalId(id: Effect["id"]): id is SurvivalId {
  return (SURVIVAL_IDS as readonly string[]).includes(id);
}

function slotTotal(
  effects: readonly ActiveEffect[],
  id: SurvivalId,
  slot: "bb" | "ubb" | "passive",
): number {
  return effects.reduce(
    (total, effect) => total + (effect.id === id && effectSlot(effect) === slot ? effect.value : 0),
    0,
  );
}

/** A result that may have drawn from the battle RNG. */
export interface RngResult<T> {
  readonly value: T;
  readonly rng: RngState;
}

/** RandomBetween(min, max) when the effect has a range, else its `value`. Draws only with a range. */
function baseAmount(
  effect: Pick<Effect, "value" | "min" | "max">,
  rng: RngState,
): RngResult<number> {
  if (effect.min === undefined || effect.max === undefined) return { value: effect.value, rng };
  return nextInt(rng, effect.min, effect.max);
}

/**
 * Burst heal for one living target (*Burst Healing*): `RandomBetween(min, max)` (or `value`)
 * `+ healed unit's total REC + healer's total REC × recBonus`, floored. Draws one integer when
 * the effect has a range. The caller clamps to max HP and skips KO'd units.
 */
export function burstHealAmount(
  effect: Pick<Effect, "value" | "min" | "max" | "recBonus">,
  targetRecTotal: number,
  healerRecTotal: number,
  rng: RngState,
): RngResult<number> {
  const base = baseAmount(effect, rng);
  const bonus = healerRecTotal * (effect.recBonus ?? 0);
  return { value: Math.max(0, floorDamage(base.value + targetRecTotal + bonus)), rng: base.rng };
}

/**
 * End-of-turn heal over time (*Gradual Healing*): per active `heal.over_time`, in stored order,
 * `RandomBetween(min, max)` (or `value`) `+ REC × recBonus`, where REC is the snapshotted
 * `healerRec` or else the recipient's own total REC; the sum is floored.
 */
export function healOverTimeAmount(
  effects: readonly ActiveEffect[],
  recipientRecTotal: number,
  rng: RngState,
): RngResult<number> {
  let current = rng;
  let total = 0;
  for (const effect of effects) {
    if (effect.id !== "heal.over_time") continue;
    const base = baseAmount(effect, current);
    current = base.rng;
    total += base.value + (effect.healerRec ?? recipientRecTotal) * (effect.recBonus ?? 0);
  }
  return { value: Math.max(0, floorDamage(total)), rng: current };
}

/** Draws one integer in [0, 99] for a proc chance below 100; true when it procs. */
function rollChance(chance: number | undefined, rng: RngState): RngResult<boolean> {
  if (chance === undefined || chance >= 100) return { value: true, rng };
  const draw = nextInt(rng, 0, 99);
  return { value: draw.value < chance, rng: draw.rng };
}

/**
 * Mitigation terms for `mitigationMultiplier`. Leader-skill, Extra Skill, and triggered
 * `mitigation` is the passive term unless `passive` overrides it; `chanceMitigation` (procced
 * `chance_mitigation`) adds to it (the 50% cap applies to the sum). `elemental_mitigation` applies
 * to every element, but only when the hit uses the attacker's own element (`ownElement`).
 */
export function mitigationFromEffects(
  effects: readonly ActiveEffect[],
  options: {
    readonly passive?: number;
    readonly ownElement?: boolean;
    readonly chanceMitigation?: number;
  } = {},
): MitigationInput {
  const {
    passive = slotTotal(effects, "mitigation", "passive"),
    ownElement = true,
    chanceMitigation = 0,
  } = options;
  return {
    bb: slotTotal(effects, "mitigation", "bb"),
    ubb: slotTotal(effects, "mitigation", "ubb"),
    passive: passive + chanceMitigation,
    bbElemental: ownElement ? slotTotal(effects, "elemental_mitigation", "bb") : 0,
    ubbElemental: ownElement ? slotTotal(effects, "elemental_mitigation", "ubb") : 0,
  };
}

export interface KoCheck {
  readonly hp: number;
  readonly effects: ActiveEffect[];
  /** True when an `angel_idol` was consumed to survive. */
  readonly survived: boolean;
  readonly rng: RngState;
}

/**
 * SP's once-per-battle save is separate from burst idols and has sourced priority over bursts;
 * only a successful passive save consumes its allowance. Protection clamps HP to 1, not damage
 * to zero, and draws/consumes nothing on subsequent lethal hits in this turn (RESOLVED-76).
 */
export function takeUnitDamage(
  unit: Pick<BattleUnit, "hp" | "stats" | "passiveAngelIdol">,
  effects: readonly ActiveEffect[],
  damage: number,
  rng: RngState,
): KoCheck & Pick<BattleUnit, "passiveAngelIdol"> {
  const passive = unit.passiveAngelIdol;
  const fields = passive ? { passiveAngelIdol: passive } : {};
  if (passive?.protected && unit.hp > 0) {
    return {
      hp: Math.max(1, unit.hp - Math.max(0, damage)),
      effects: [...effects],
      survived: false,
      rng,
      ...fields,
    };
  }
  if (unit.hp > damage || unit.hp <= 0 || !passive || passive.consumed) {
    return { ...takeDamage(effects, unit.hp, unit.stats.hp, damage, rng), ...fields };
  }
  const save = takeDamage(
    [{ id: "angel_idol", value: 0, chance: passive.chance, target: "self", source: "sp" }],
    unit.hp,
    unit.stats.hp,
    damage,
    rng,
  );
  if (!save.survived) {
    return { ...takeDamage(effects, unit.hp, unit.stats.hp, damage, save.rng), ...fields };
  }
  return {
    ...save,
    effects: [...effects],
    passiveAngelIdol: { ...passive, consumed: true, protected: true },
  };
}

/**
 * Applies `damage` to a combatant at `hp`. A lethal hit tries each `angel_idol` oldest first: a
 * guaranteed one (no `chance`) always saves, a chance one draws one integer in [0, 99] and saves
 * when it is below `chance` (a failed one stays). The saving idol is consumed and leaves
 * `max(1, floor(maxHp × value))` HP (value 0 → the sourced 1 HP).
 */
export function takeDamage(
  effects: readonly ActiveEffect[],
  hp: number,
  maxHp: number,
  damage: number,
  rng: RngState,
): KoCheck {
  const after = Math.max(0, hp - Math.max(0, damage));
  if (after > 0 || hp <= 0) return { hp: after, effects: [...effects], survived: false, rng };
  let current = rng;
  for (const [index, idol] of effects.entries()) {
    if (idol.id !== "angel_idol") continue;
    const roll = rollChance(idol.chance, current);
    current = roll.rng;
    if (!roll.value) continue;
    return {
      hp: Math.min(maxHp, Math.max(1, floorDamage(maxHp * idol.value))),
      effects: effects.filter((_, i) => i !== index),
      survived: true,
      rng: current,
    };
  }
  return { hp: 0, effects: [...effects], survived: false, rng: current };
}

/**
 * The share of `damage` that active effects of `id` turn into HP: each one, in stored order, first
 * draws its proc (`chance` below 100), then on a proc its share — `RandomBetween(min, max)` whole
 * percents, or `value`. Returns `floor(damage × Σ shares)`.
 */
function rollDamageShare(
  effects: readonly ActiveEffect[],
  id: "damage_to_heal" | "hp_drain" | "damage_reflect",
  damage: number,
  rng: RngState,
): RngResult<number> {
  let current = rng;
  let share = 0;
  for (const effect of effects) {
    if (effect.id !== id) continue;
    const proc = rollChance(effect.chance, current);
    current = proc.rng;
    if (!proc.value) continue;
    if (effect.min === undefined || effect.max === undefined) {
      share += effect.value;
      continue;
    }
    const pct = nextInt(current, Math.round(effect.min * 100), Math.round(effect.max * 100));
    current = pct.rng;
    share += pct.value / 100;
  }
  return { value: Math.max(0, floorDamage(Math.max(0, damage) * share)), rng: current };
}

/**
 * HP restored after taking an attack's `damage` (*Heal when attacked*): each active
 * `damage_to_heal`, in stored order, first draws its proc (`chance` below 100), then on a proc its
 * share — `RandomBetween(min, max)` whole percents, or `value`. Heals `floor(damage × Σ shares)`.
 */
export function damageToHealAmount(
  effects: readonly ActiveEffect[],
  damage: number,
  rng: RngState,
): RngResult<number> {
  return rollDamageShare(effects, "damage_to_heal", damage, rng);
}

/**
 * HP an attacker absorbs from one landed hit's `damage` (*HP Absorption*, GAME_DESIGN §4 Kit
 * additions (M2-04F)): each active `hp_drain`, in stored order, draws its proc (`chance` below
 * 100), then on a proc its `RandomBetween(min, max)` whole percent (or `value`). Heals
 * `floor(damage × Σ shares)`, so a 1-damage hit restores nothing.
 */
export function hpDrainAmount(
  effects: readonly ActiveEffect[],
  damage: number,
  rng: RngState,
): RngResult<number> {
  return rollDamageShare(effects, "hp_drain", damage, rng);
}

/**
 * Counter damage from one enemy attack that cost the unit `damage` HP (*Damage Counter*,
 * GAME_DESIGN §4 Kit additions (M2-04H)): each active `damage_reflect`, in stored order, draws its
 * proc (`chance` below 100) and on a proc adds its `value` share; the counter is
 * `floor(damage × Σ shares)`, capped so the attacker keeps at least 1 HP (it never KOs).
 */
export function rollDamageReflect(
  effects: readonly ActiveEffect[],
  damage: number,
  attackerHp: number,
  rng: RngState,
): RngResult<number> {
  const share = rollDamageShare(effects, "damage_reflect", damage, rng);
  return { value: Math.max(0, Math.min(share.value, attackerHp - 1)), rng: share.rng };
}

/** Σ active `guard_mitigation`: the guard bonuses in `guardMultiplier` (*Guard Mitigation*). */
export function guardBonus(effects: readonly ActiveEffect[]): number {
  return Math.max(
    0,
    effects.reduce((sum, effect) => sum + (effect.id === "guard_mitigation" ? effect.value : 0), 0),
  );
}

/**
 * Σ active `elem_weak_resist` (*Damage Resistance*): subtracted from both the base and the buffed
 * elemental weakness bonus of hits the combatant takes (`elementMultiplier` resistances).
 */
export function elementalWeaknessResistance(effects: readonly ActiveEffect[]): number {
  return Math.max(
    0,
    effects.reduce((sum, effect) => sum + (effect.id === "elem_weak_resist" ? effect.value : 0), 0),
  );
}

/** The combatant's crit resistance: Σ `crit_resist`, clamped to [0, 1] (1 negates crits). */
export function critResistance(effects: readonly ActiveEffect[]): number {
  const total = effects.reduce(
    (sum, effect) => sum + (effect.id === "crit_resist" ? effect.value : 0),
    0,
  );
  return Math.min(1, Math.max(0, total));
}

/**
 * *Chance Mitigation* for one incoming attack: each active `chance_mitigation`, in stored order,
 * draws its proc (one integer in [0, 99] when `chance` is below 100) and on a proc adds its
 * `value` to passive mitigation. Returns the summed extra passive mitigation.
 */
export function rollChanceMitigation(
  effects: readonly ActiveEffect[],
  rng: RngState,
): RngResult<number> {
  let current = rng;
  let total = 0;
  for (const effect of effects) {
    if (effect.id !== "chance_mitigation") continue;
    const proc = rollChance(effect.chance, current);
    current = proc.rng;
    if (proc.value) total += effect.value;
  }
  return { value: total, rng: current };
}

/**
 * The `mitigation` a hit triggers when it moves the damage-taken tally from `before` to `after`
 * (*Conditional Effect after taking damage*): among active `mitigation_after_damage` whose
 * `threshold` is crossed, the one with the highest threshold (the first in stored order on a
 * tie). Stored in the passive slot with source `triggered`; see `triggerMitigation`.
 */
export function triggeredMitigation(
  effects: readonly ActiveEffect[],
  before: number,
  after: number,
): ActiveEffect | undefined {
  let best: ActiveEffect | undefined;
  for (const effect of effects) {
    if (effect.id !== "mitigation_after_damage") continue;
    const threshold = effect.threshold ?? 0;
    if (!crossesThreshold(before, after, threshold)) continue;
    if (!best || threshold > (best.threshold ?? 0)) best = effect;
  }
  if (!best) return undefined;
  // +1: the end-of-turn tick of the turn it fires in does not use up its duration.
  const turns = (best.triggerTurns ?? best.turns ?? 1) + 1;
  return { id: "mitigation", value: best.value, turns, target: "self", source: "triggered" };
}

/**
 * Stores a triggered mitigation: it replaces any earlier triggered one (only one conditional
 * mitigation is active at a time, BF Wiki *Damage Mitigation*).
 */
export function triggerMitigation(
  effects: readonly ActiveEffect[],
  mitigation: ActiveEffect,
): ActiveEffect[] {
  return [
    ...effects.filter((effect) => !(effect.id === "mitigation" && effect.source === "triggered")),
    mitigation,
  ];
}

export interface BarrierAbsorb {
  /** Damage that reaches the combatant's HP. */
  readonly damage: number;
  /** Damage the barrier took (at most its HP). */
  readonly absorbed: number;
  /** Barrier HP left (0 when it broke or there was none). */
  readonly barrierHp: number;
  readonly effects: ActiveEffect[];
}

/**
 * Runs a hit through the combatant's `barrier` (BF Wiki *Barrier*): the barrier takes
 * `barrierHit` (the hit recomputed against the barrier's element and 0 DEF). If that fits in its
 * HP, the barrier absorbs all of it and the combatant takes nothing; otherwise the barrier breaks
 * (and is removed) and the combatant takes `floor(unitHit × (barrierHit − barrierHp) / barrierHit)`,
 * the unabsorbed share. Without a barrier the combatant takes `unitHit`.
 */
export function absorbWithBarrier(
  effects: readonly ActiveEffect[],
  unitHit: number,
  barrierHit: number,
): BarrierAbsorb {
  const index = effects.findIndex((effect) => effect.id === "barrier" && effect.value > 0);
  const barrier = effects[index];
  if (!barrier) return { damage: unitHit, absorbed: 0, barrierHp: 0, effects: [...effects] };
  if (barrierHit < barrier.value) {
    const barrierHp = barrier.value - barrierHit;
    return {
      damage: 0,
      absorbed: barrierHit,
      barrierHp,
      effects: effects.map((effect, i) => (i === index ? { ...effect, value: barrierHp } : effect)),
    };
  }
  const share = barrierHit > 0 ? (barrierHit - barrier.value) / barrierHit : 0;
  return {
    damage: floorDamage(unitHit * share),
    absorbed: barrier.value,
    barrierHp: 0,
    effects: effects.filter((_, i) => i !== index),
  };
}

/** The combatant's active barrier, if any. */
export function activeBarrier(effects: readonly ActiveEffect[]): ActiveEffect | undefined {
  return effects.find((effect) => effect.id === "barrier" && effect.value > 0);
}
