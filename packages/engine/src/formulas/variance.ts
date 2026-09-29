import { nextFloat, nextInt, type RngDraw, type RngState } from "../rng.ts";

/** Non-critical damage variance range: `random[0.9, 1.0]` (GAME_DESIGN §2 Critical hits). */
export const VARIANCE_MIN = 0.9;
export const VARIANCE_MAX = 1.0;
/** Range of the ATK bonus divisor: `randomInt[25, 32]` inclusive (GAME_DESIGN §3). */
export const ATK_DIVISOR_MIN = 25;
export const ATK_DIVISOR_MAX = 32;

/** Draws the non-critical variance, continuous in `[0.9, 1.0)` (RESOLVED-37 item 7). */
export function rollVariance(rng: RngState): RngDraw<number> {
  const draw = nextFloat(rng);
  return { value: VARIANCE_MIN + (VARIANCE_MAX - VARIANCE_MIN) * draw.value, rng: draw.rng };
}

/** Draws the integer divisor of the `atk_total / randomInt[25, 32]` bonus. */
export function rollAtkDivisor(rng: RngState): RngDraw<number> {
  return nextInt(rng, ATK_DIVISOR_MIN, ATK_DIVISOR_MAX);
}
