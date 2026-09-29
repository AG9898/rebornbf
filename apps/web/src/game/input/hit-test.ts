import type { EnemySlotId, PlayerSlotId } from "@bfr/engine";

/** What a gesture landed on. */
export type InputTarget =
  | { readonly kind: "unit"; readonly slot: PlayerSlotId }
  | { readonly kind: "enemy"; readonly slot: EnemySlotId }
  | { readonly kind: "od" };

/** A rectangular touch area on the 640×1136 logical grid. */
export interface HitRegion {
  readonly target: InputTarget;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Returns the target of the last region containing the point (later regions draw on top). */
export function hitTest(
  regions: readonly HitRegion[],
  x: number,
  y: number,
): InputTarget | undefined {
  for (let i = regions.length - 1; i >= 0; i--) {
    const r = regions[i];
    if (r && x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height) {
      return r.target;
    }
  }
  return undefined;
}
