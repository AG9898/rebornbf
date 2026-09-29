/**
 * Tolerance for flooring formula results. Binary floating point can land a hair under a whole
 * number the hand calculation reaches exactly (e.g. `2000 × 4.8`); flooring with this slack keeps
 * GAME_DESIGN's worked values. It is far below any real fractional part a formula produces.
 */
const FLOOR_EPSILON = 1e-9;

/** `Math.floor` that ignores floating-point error just below a whole number. */
export function floorDamage(value: number): number {
  return Math.floor(value + FLOOR_EPSILON);
}
