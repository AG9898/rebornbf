import { nextFloat, type RngDraw, type RngState } from "../rng.ts";

/** Hard cap on the critical multiplier, after resistances (GAME_DESIGN §2 Critical hits). */
export const CRIT_MULT_CAP = 7.0;
/** Range of the random base crit bonus: `random[0.5, 0.6]`. */
export const CRIT_BASE_MIN = 0.5;
export const CRIT_BASE_MAX = 0.6;

/**
 * Rolls whether an attack crits against `critRate` (fraction, base + buffs). Always consumes
 * one draw so the RNG sequence does not depend on the rate.
 */
export function rollCrit(rng: RngState, critRate: number): RngDraw<boolean> {
  const draw = nextFloat(rng);
  return { value: draw.value < critRate, rng: draw.rng };
}

/** Draws the random base crit bonus, continuous in `[0.5, 0.6)` (RESOLVED-37 item 7). */
export function rollCritBase(rng: RngState): RngDraw<number> {
  const draw = nextFloat(rng);
  return { value: CRIT_BASE_MIN + (CRIT_BASE_MAX - CRIT_BASE_MIN) * draw.value, rng: draw.rng };
}

/**
 * `min(7.0, 1 + (base_draw + crit-damage buffs) × (1 − crit_resist))`; buffs stack additively and
 * the target's crit resistance (`crit_resist`, 0–1) scales the bonus before the cap
 * (BF Wiki *Damage Resistance*, *Critical Damage Boost*).
 */
export function critMultiplier(baseDraw: number, critDamageBuffs = 0, critResist = 0): number {
  const resist = Math.min(1, Math.max(0, critResist));
  return Math.min(CRIT_MULT_CAP, 1 + (baseDraw + critDamageBuffs) * (1 - resist));
}
