/**
 * Logical portrait grid (RESOLVED-40): layout, positions, and touch regions use these units.
 * The canvas is drawn at `CANVAS_ZOOM`× (1280×2272) and the browser only ever shrinks it to fit.
 */
export const BATTLE_WIDTH = 640;
export const BATTLE_HEIGHT = 1136;
/** Canvas pixels per logical pixel: the camera zoom, sprite scale, and text resolution. */
export const CANVAS_ZOOM = 2;
export const CANVAS_WIDTH = BATTLE_WIDTH * CANVAS_ZOOM;
export const CANVAS_HEIGHT = BATTLE_HEIGHT * CANVAS_ZOOM;

/**
 * CSS size for the canvas host: the largest 9:16 box inside the stage that is never more than
 * `CANVAS_WIDTH`×`CANVAS_HEIGHT` device pixels, so the 2× canvas is only ever scaled down.
 */
export function canvasDisplaySize(
  stageWidth: number,
  stageHeight: number,
  devicePixelRatio: number,
): { width: number; height: number } {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const scale = Math.max(
    0,
    Math.min(stageWidth / BATTLE_WIDTH, stageHeight / BATTLE_HEIGHT, CANVAS_ZOOM / dpr),
  );
  return { width: BATTLE_WIDTH * scale, height: BATTLE_HEIGHT * scale };
}

/** The renderer's callbacks into React. */
export interface BattleBridge {
  onReady(): void;
  onComplete?(
    result: "win" | "lose",
    log: readonly import("../lib/battle/replay.ts").LoggedTurn[],
  ): void;
}
