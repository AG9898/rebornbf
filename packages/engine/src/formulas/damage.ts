import type { RngDraw, RngState } from "../rng.ts";
import { critMultiplier, rollCrit, rollCritBase } from "./crit.ts";
import { defenseTerm } from "./defense.ts";
import { floorDamage } from "./rounding.ts";
import { rollAtkDivisor, rollVariance } from "./variance.ts";

/** Minimum damage of a hit that DEF, mitigation, or guard bring to 0 or below (RESOLVED-37 item 5). */
export const MIN_HIT_DAMAGE = 1;

/** The random terms of one attack, drawn once per attack (GAME_DESIGN §2 Critical hits, §3). */
export type AttackRolls =
  | { readonly critical: true; readonly critBase: number; readonly divisor: number }
  | { readonly critical: false; readonly variance: number; readonly divisor: number };

/**
 * Draws an attack's random terms in a fixed order: crit roll against `critRate`, then the crit
 * base (critical) or the variance (non-critical), then the ATK bonus divisor. An attack that
 * cannot crit (random-target hits, BF Wiki *Random Target Damage*) skips the crit roll.
 */
export function rollAttack(rng: RngState, critRate: number, canCrit = true): RngDraw<AttackRolls> {
  const crit = canCrit ? rollCrit(rng, critRate) : { value: false, rng };
  if (crit.value) {
    const base = rollCritBase(crit.rng);
    const divisor = rollAtkDivisor(base.rng);
    return {
      value: { critical: true, critBase: base.value, divisor: divisor.value },
      rng: divisor.rng,
    };
  }
  const variance = rollVariance(crit.rng);
  const divisor = rollAtkDivisor(variance.rng);
  return {
    value: { critical: false, variance: variance.value, divisor: divisor.value },
    rng: divisor.rng,
  };
}

export interface AttackCoreInput {
  /** `atk_total` from `attackTotal`. */
  readonly atkTotal: number;
  /** Target total DEF (buffs/debuffs applied). */
  readonly targetDef: number;
  readonly defIgnore?: boolean;
  readonly rolls: AttackRolls;
  /** Crit-damage buffs as a fraction (+50% → 0.5). */
  readonly critDamageBuffs?: number;
  /** The target's crit resistance (`crit_resist`, 0–1), scaling the crit bonus. */
  readonly critResist?: number;
  /** From `elementMultiplier`, decided once per attack. */
  readonly elementMult: number;
}

/**
 * Per-attack damage before hit distribution (GAME_DESIGN §3):
 * `((atk_total − def_term) × (crit ? crit_mult : variance) + atk_total / divisor) × element_mult`.
 * Not rounded; `hitDamage` floors each hit once.
 */
export function attackCore(input: AttackCoreInput): number {
  const {
    atkTotal,
    targetDef,
    defIgnore = false,
    rolls,
    critDamageBuffs = 0,
    critResist = 0,
    elementMult,
  } = input;
  const base = atkTotal - defenseTerm(targetDef, defIgnore);
  const scaled = rolls.critical
    ? base * critMultiplier(rolls.critBase, critDamageBuffs, critResist)
    : base * rolls.variance;
  return (scaled + atkTotal / rolls.divisor) * elementMult;
}

export interface HitModifiers {
  /** `1.5 + spark-damage buffs` if the hit sparked, else 1. */
  readonly sparkMult?: number;
  /** From `mitigationMultiplier`. */
  readonly mitigation?: number;
  /** From `guardMultiplier`. */
  readonly guard?: number;
}

/**
 * `hit_i = floor(core × spark_mult_i × mitigation × guard × dist_i)`, at least 1
 * (GAME_DESIGN §3). `distribution` is the hit's share in % (`damageDistribution[i]`).
 */
export function hitDamage(core: number, distribution: number, mods: HitModifiers = {}): number {
  const { sparkMult = 1, mitigation = 1, guard = 1 } = mods;
  const damage = floorDamage(core * sparkMult * mitigation * guard * (distribution / 100));
  return Math.max(MIN_HIT_DAMAGE, damage);
}
