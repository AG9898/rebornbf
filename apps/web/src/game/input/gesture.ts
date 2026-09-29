/** One pointer position on the 640×1136 logical grid, stamped in battle time (ms since battle start). */
export interface PointerSample {
  readonly x: number;
  readonly y: number;
  readonly timeMs: number;
}

/**
 * A classified pointer gesture. `x`/`y` are where the pointer went down (what the player touched);
 * `timeMs` is when it was released, since a tap and a swipe are only distinguishable on release.
 */
export type Gesture =
  | {
      readonly kind: "tap" | "swipe-up" | "swipe-down";
      readonly x: number;
      readonly y: number;
      readonly timeMs: number;
    }
  | { readonly kind: "none" };

/** Maximum pointer travel (logical px) for a tap (6 px on the old 180×320 canvas, ×3.55). */
export const TAP_SLOP_PX = 21;
/** Minimum vertical travel (logical px) for a swipe (16 px on the old canvas, ×3.55). */
export const SWIPE_MIN_PX = 57;
/** Longest press-to-release time for a swipe; slower drags are ignored. */
export const SWIPE_MAX_MS = 600;

/**
 * Classifies a press/release pair. Travel within `TAP_SLOP_PX` is a tap (any duration). A swipe
 * needs at least `SWIPE_MIN_PX` of vertical travel, more vertical than horizontal travel, and a
 * release within `SWIPE_MAX_MS`; up means towards the top of the canvas (smaller `y`). Anything
 * else (horizontal drags, slow drags, short wobbles past the tap slop) is `none`.
 */
export function classifyGesture(down: PointerSample, up: PointerSample): Gesture {
  const dx = up.x - down.x;
  const dy = up.y - down.y;
  const at = { x: down.x, y: down.y, timeMs: up.timeMs };
  if (Math.hypot(dx, dy) <= TAP_SLOP_PX) {
    return { kind: "tap", ...at };
  }
  const duration = up.timeMs - down.timeMs;
  if (Math.abs(dy) >= SWIPE_MIN_PX && Math.abs(dy) > Math.abs(dx) && duration <= SWIPE_MAX_MS) {
    return { kind: dy < 0 ? "swipe-up" : "swipe-down", ...at };
  }
  return { kind: "none" };
}
