import { nextInt, type RngDraw, type RngState } from "../rng.ts";
import type { ActiveEffect } from "./buffs.ts";
import { effectTotal } from "./gauge.ts";

/**
 * Spark effects (GAME_DESIGN §4 → Kit additions (M2-04D)): Spark Critical, Spark Vulnerability,
 * and BC Fill on Spark. The engine applies them to a party unit's sparked hits on enemies; extra
 * normal-attack hits get none of them (RESOLVED-42).
 */

/**
 * *Spark Critical*: each active `buff.spark_crit` on the attacker, in stored order, draws one
 * integer in `[0, 99]` (none when `chance` is 100 or more) and on a proc adds its `value` to the
 * hit's spark bonus. Call only for a sparked hit. Returns the summed bonus (0 when none procs).
 */
export function rollSparkCritical(
  effects: readonly ActiveEffect[],
  rng: RngState,
): RngDraw<number> {
  let bonus = 0;
  let current = rng;
  for (const effect of effects) {
    if (effect.id !== "buff.spark_crit") continue;
    const chance = effect.chance ?? 100;
    if (chance >= 100) {
      bonus += effect.value;
      continue;
    }
    const draw = nextInt(current, 0, 99);
    current = draw.rng;
    if (draw.value < chance) bonus += effect.value;
  }
  return { value: bonus, rng: current };
}

/** *Spark Vulnerability*: the extra spark bonus a sparked hit on this target gets (additive). */
export function sparkVulnerability(effects: readonly ActiveEffect[]): number {
  return Math.max(0, effectTotal(effects, "debuff.spark_vuln"));
}

/**
 * *BC Fill on Spark*: BC the attacker fills for one sparked hit. Each active `bb.fill_on_spark`,
 * in stored order, adds `RandomBetween(min, max)` (one integer draw) when it has a range, else
 * its `value` (no draw); the effects stack. Call only for a sparked hit.
 */
export function rollBcFillOnSpark(
  effects: readonly ActiveEffect[],
  rng: RngState,
): RngDraw<number> {
  let fill = 0;
  let current = rng;
  for (const effect of effects) {
    if (effect.id !== "bb.fill_on_spark") continue;
    if (effect.min === undefined || effect.max === undefined) {
      fill += effect.value;
      continue;
    }
    const draw = nextInt(current, effect.min, effect.max);
    current = draw.rng;
    fill += draw.value;
  }
  return { value: Math.max(0, fill), rng: current };
}
