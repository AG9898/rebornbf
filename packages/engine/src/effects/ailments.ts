import { AILMENTS, type Ailment, type Effect, type Element } from "@bfr/data";
import { ELEMENT_STRONG_BASE, ELEMENT_WEAK_MULT, isStrongAgainst } from "../formulas/element.ts";
import { floorDamage } from "../formulas/rounding.ts";
import { nextInt, type RngState } from "../rng.ts";
import { type ActiveEffect, replaceBuff } from "./buffs.ts";
import { type EffectHandler, effectTotal } from "./gauge.ts";

/**
 * Status ailments and debuffs (GAME_DESIGN §4 → Ailments and debuffs). `ailment.inflict.*`
 * values are infliction chances in % (0–100); `debuff.*` values are stat reductions as fractions
 * (0.5 = −50%). Proc chances on debuffs await the optional effect fields (M1-06G).
 */
export { AILMENTS, type Ailment };

export const AILMENT_IDS = [
  "ailment.inflict.poison",
  "ailment.inflict.weak",
  "ailment.inflict.sick",
  "ailment.inflict.injury",
  "ailment.inflict.curse",
  "ailment.inflict.paralysis",
  "ailment.cure",
  "ailment.null",
  "debuff.atk_down",
  "debuff.def_down",
  "debuff.spark_vuln",
  "debuff.dot",
  "debuff.null",
] as const satisfies readonly Effect["id"][];

export type AilmentId = (typeof AILMENT_IDS)[number];
export type InflictId = Extract<AilmentId, `ailment.inflict.${string}`>;
export type DebuffId = "debuff.atk_down" | "debuff.def_down";

/** Poison deals this share of the target's max HP at end of turn (*Status Infliction*). */
export const POISON_MAX_HP_SHARE = 0.1;
/** Weak (DEF), Sick (REC), and Injury (ATK) subtract this from the stat's `stat_mods`. */
export const AILMENT_STAT_PENALTY = 0.5;

export function isAilmentId(id: Effect["id"]): id is AilmentId {
  return (AILMENT_IDS as readonly string[]).includes(id);
}

export function isInflictId(id: Effect["id"]): id is InflictId {
  return id.startsWith("ailment.inflict.");
}

function isDebuffId(id: Effect["id"]): id is DebuffId {
  return id === "debuff.atk_down" || id === "debuff.def_down";
}

export function ailmentOf(id: InflictId): Ailment {
  return id.slice("ailment.inflict.".length) as Ailment;
}

/** Ailments last 3 turns on player units; on enemies, curse and paralysis last 1 turn. */
export function ailmentTurns(ailment: Ailment, side: "party" | "enemy"): number {
  return side === "enemy" && (ailment === "curse" || ailment === "paralysis") ? 1 : 3;
}

export function hasAilment(effects: readonly ActiveEffect[], ailment: Ailment): boolean {
  return effects.some((effect) => effect.id === `ailment.inflict.${ailment}`);
}

/** Only the six status ailments qualify; parameter debuffs and DoT do not. */
export function isAfflicted(effects: readonly ActiveEffect[]): boolean {
  return AILMENTS.some((ailment) => hasAilment(effects, ailment));
}

/** Status negation blocks new ailments; re-inflicting an ailment refreshes its duration. */
const inflict: EffectHandler = (effects, effect) =>
  effects.some((active) => active.id === "ailment.null")
    ? [...effects]
    : [...effects.filter((active) => active.id !== effect.id), effect];

/** Parameter reduction negation blocks new debuffs; debuffs use the buff slot rule. */
const debuff: EffectHandler = (effects, effect) =>
  effects.some((active) => active.id === "debuff.null")
    ? [...effects]
    : replaceBuff(effects, effect);

/** Status cure removes every ailment and stat debuff; nothing is stored. */
const cure: EffectHandler = (effects) =>
  effects.filter((active) => !isInflictId(active.id) && !isDebuffId(active.id));

/** One registered handler per ailment/debuff ID. */
export const AILMENT_HANDLERS: Readonly<Record<AilmentId, EffectHandler>> = {
  "ailment.inflict.poison": inflict,
  "ailment.inflict.weak": inflict,
  "ailment.inflict.sick": inflict,
  "ailment.inflict.injury": inflict,
  "ailment.inflict.curse": inflict,
  "ailment.inflict.paralysis": inflict,
  "ailment.cure": cure,
  "ailment.null": replaceBuff,
  "debuff.atk_down": debuff,
  "debuff.def_down": debuff,
  // Read per sparked hit by `sparkVulnerability` (effects/spark.ts).
  "debuff.spark_vuln": replaceBuff,
  // Ticks at end of turn step 1 (`dotDamage`); blocked by `debuff.null` like the stat debuffs.
  "debuff.dot": debuff,
  "debuff.null": replaceBuff,
};

export interface InflictionRoll {
  readonly rng: RngState;
  /** The effect with its rule-fixed ailment duration, or undefined when the chance roll failed. */
  readonly effect: Effect | undefined;
}

/**
 * Rolls an `ailment.inflict.*` chance: one integer draw in `[0, 99]`, inflicted when the draw is
 * below `value` (so `value` 100 always lands, 0 never). The draw happens even when a status
 * negation will block the ailment. The returned effect carries the §2 duration for `side`.
 */
export function rollInfliction(
  rng: RngState,
  effect: Effect & { readonly id: InflictId },
  side: "party" | "enemy",
): InflictionRoll {
  const draw = nextInt(rng, 0, 99);
  return {
    rng: draw.rng,
    effect:
      draw.value < effect.value
        ? { ...effect, turns: ailmentTurns(ailmentOf(effect.id), side) }
        : undefined,
  };
}

/**
 * The ailment chances a unit's `buff.add_ailment` effects add to its attacks, in % per ailment:
 * each ailment's active effects add (a BB/SBB, UBB, and leader-skill or Extra Skill source of the
 * same ailment stack; RESOLVED-48), capped at 100, listed in `AILMENTS` order and skipping ailments at 0.
 */
export function addedAilmentChances(
  effects: readonly ActiveEffect[],
): { readonly ailment: Ailment; readonly chance: number }[] {
  return AILMENTS.flatMap((ailment) => {
    const chance = effects.reduce(
      (sum, effect) =>
        sum + (effect.id === "buff.add_ailment" && effect.ailment === ailment ? effect.value : 0),
      0,
    );
    return chance > 0 ? [{ ailment, chance: Math.min(100, chance) }] : [];
  });
}

/**
 * *Status Infliction Added to Attack* (GAME_DESIGN §4 Kit additions (M2-04G)): for one attack on
 * one target (each hit of a random-target attack is its own attack), every ailment the attacker
 * adds rolls one `rollInfliction` draw in `AILMENTS` order. Returns the landed ailments as
 * `ailment.inflict.*` effects with the rule duration for `side`, in draw order.
 */
export function rollAddedAilments(
  rng: RngState,
  attackerEffects: readonly ActiveEffect[],
  side: "party" | "enemy",
): { readonly rng: RngState; readonly value: Effect[] } {
  let current = rng;
  const landed: Effect[] = [];
  for (const { ailment, chance } of addedAilmentChances(attackerEffects)) {
    const roll = rollInfliction(
      current,
      { id: `ailment.inflict.${ailment}`, value: chance, target: "enemies" },
      side,
    );
    current = roll.rng;
    if (roll.effect) landed.push(roll.effect);
  }
  return { rng: current, value: landed };
}

/**
 * Total `stat_mods` reduction on one stat from ailments and debuffs, as a positive fraction:
 * Injury (ATK), Weak (DEF), and Sick (REC) each subtract 0.5; `debuff.atk_down` and
 * `debuff.def_down` subtract their summed values.
 */
export function statPenalty(effects: readonly ActiveEffect[], stat: "atk" | "def" | "rec"): number {
  const ailment: Ailment = stat === "atk" ? "injury" : stat === "def" ? "weak" : "sick";
  const fromAilment = hasAilment(effects, ailment) ? AILMENT_STAT_PENALTY : 0;
  const fromDebuff =
    stat === "atk"
      ? effectTotal(effects, "debuff.atk_down")
      : stat === "def"
        ? effectTotal(effects, "debuff.def_down")
        : 0;
  return fromAilment + fromDebuff;
}

/** End-of-turn step 1 (§2): a poisoned combatant loses `floor(maxHp × 0.1)` (turn loop: M1-07B). */
export function poisonDamage(effects: readonly ActiveEffect[], maxHp: number): number {
  return hasAilment(effects, "poison") ? floorDamage(maxHp * POISON_MAX_HP_SHARE) : 0;
}

/**
 * Damage of one `debuff.dot` tick (BF Wiki *DoT*, GAME_DESIGN §4 → Ailments and debuffs):
 * `floor(((dotAtk + flatAtk) × (1 + value) − holderDef / 3) × element)`, at least 1 (RESOLVED-49).
 * `dotAtk` is the inflicter's unbuffed ATK snapshot; `holderDef` the holder's total DEF now;
 * `element` is ×1.5 when the inflicter's element is strong against the holder, ×0.5 when weak,
 * else ×1.0 (no elemental-damage buffs). No crit, variance, or divisor term, so no RNG draw.
 */
export function dotTickDamage(
  effect: ActiveEffect,
  holderDef: number,
  holderElement: Element,
): number {
  const atk = (effect.dotAtk ?? 0) + (effect.flatAtk ?? 0);
  const element = effect.dotElement;
  const mult =
    element === undefined
      ? 1
      : isStrongAgainst(element, holderElement)
        ? ELEMENT_STRONG_BASE
        : isStrongAgainst(holderElement, element)
          ? ELEMENT_WEAK_MULT
          : 1;
  return Math.max(1, floorDamage((atk * (1 + effect.value) - holderDef / 3) * mult));
}

/**
 * End-of-turn step 1 (§2), after poison: the summed ticks of every active `debuff.dot` in stored
 * order (a BB/SBB and a UBB DoT each tick; RESOLVED-49). 0 without one.
 */
export function dotDamage(
  effects: readonly ActiveEffect[],
  holderDef: number,
  holderElement: Element,
): number {
  return effects.reduce(
    (sum, effect) =>
      sum + (effect.id === "debuff.dot" ? dotTickDamage(effect, holderDef, holderElement) : 0),
    0,
  );
}

/** Paralysis: the combatant cannot act (attack, burst, or guard). */
export function isParalyzed(effects: readonly ActiveEffect[]): boolean {
  return hasAilment(effects, "paralysis");
}

/** Curse: the combatant cannot burst and its BB gauge does not fill. */
export function isCursed(effects: readonly ActiveEffect[]): boolean {
  return hasAilment(effects, "curse");
}
