/**
 * Hold-to-repeat timing for the fusion fodder picker and its slot bar (RESOLVED-90 item 2,
 * M4-01F). A press shorter than `HOLD_START_MS` is a tap (one copy on release); a longer press
 * repeats, starting at `HOLD_FIRST_REPEAT_MS` between copies and speeding up to `HOLD_FASTEST_MS`.
 */
export const HOLD_START_MS = 350;
export const HOLD_FIRST_REPEAT_MS = 180;
export const HOLD_FASTEST_MS = 30;
/** Each repeat waits this fraction of the previous wait. */
export const HOLD_ACCELERATION = 0.85;

/** The wait before repeat `n` (0-based) of a held press, never below `HOLD_FASTEST_MS`. */
export function holdRepeatDelay(n: number): number {
  const step = Math.max(0, Math.trunc(n));
  return Math.max(HOLD_FASTEST_MS, Math.round(HOLD_FIRST_REPEAT_MS * HOLD_ACCELERATION ** step));
}
