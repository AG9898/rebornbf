import Phaser from "phaser";
import type { BattleBridge } from "./bridge.ts";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "./bridge.ts";
import { BattleScene, type BattleSpec } from "./playback/battle-scene.ts";

/**
 * Mounts the battle scene playing `spec` on the 1280×2272 canvas (RESOLVED-40). `pixelArt` gives textures
 * nearest-neighbour filtering; the scene's camera zooms the 640×1136 grid by 2. The `FIT` scale
 * mode sizes the canvas to its 9:16 host (which `canvasDisplaySize` keeps at or below 1×), and
 * `image-rendering` is reset from Phaser's `pixelated` so that downscale stays smooth. `fontFamily`
 * is the HUD's webfont, which the caller must have loaded: Phaser rasterises text once, so text drawn
 * before the font arrives would keep the fallback.
 */
export function mountBattle(
  parent: HTMLElement,
  bridge: BattleBridge,
  spec: BattleSpec,
  fontFamily?: string,
): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    pixelArt: true,
    backgroundColor: "#161b33",
    scale: { mode: Phaser.Scale.FIT },
    scene: new BattleScene(bridge, spec, fontFamily),
    callbacks: {
      postBoot: (game) => {
        game.canvas.style.imageRendering = "auto";
      },
    },
  });
}
