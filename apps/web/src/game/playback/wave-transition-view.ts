import type Phaser from "phaser";
import type { Box } from "../../components/menu/text-box.ts";
import { uiPiece, uiPieceSize } from "../assets/ui.ts";
import { BATTLE_WIDTH } from "../bridge.ts";
import { fitTextToBox, hudTextStyle } from "../hud/view.ts";
import { BANDS } from "./layout.ts";
import type { StageNames } from "./stage-names.ts";
import {
  PANEL_TRACK,
  panelFill,
  panelLabel,
  panelMarker,
  panelMarkerX,
  type TransitionFrame,
  type TransitionSpec,
} from "./wave-transition.ts";

/** Above banners, flying crystals, and the burst cut-in: the wipe covers the whole field band. */
const CURTAIN_DEPTH = 30;
const PANEL_DEPTH = 31;

/**
 * The panel's layout on the 640-wide grid (logical px), measured from the reference frames
 * (RESOLVED-91; proportions only): a plate across the top of the field band with the area name in
 * its header strip and the quoted stage name below, the boss emblem left and the start emblem right
 * over the track, "BATTLE n/N" between them, and the marker hanging under the track.
 */
export const PANEL_LAYOUT = {
  /** The `wave-panel` art at 552 wide; its ornaments end 30 px down and its face 118 px down. */
  plate: { x: 44, y: 96, width: 552, height: 129 },
  area: { x: 100, y: 128, width: 440, height: 24 },
  stage: { x: 78, y: 158, width: 484, height: 46 },
  emblemBoss: { x: 80, y: 214, width: 147, height: 120 },
  emblemStart: { x: 413, y: 214, width: 147, height: 120 },
  bossWord: { x: 100, y: 312, width: 104, height: 32 },
  startWord: { x: 436, y: 312, width: 104, height: 32 },
  label: { x: 222, y: 324, width: 196, height: 30 },
  track: {
    x: PANEL_TRACK.left,
    y: PANEL_TRACK.y - PANEL_TRACK.height / 2,
    width: PANEL_TRACK.right - PANEL_TRACK.left,
    height: PANEL_TRACK.height,
  },
  /** The marker's box with its x centred on 0: the tip touches the track's middle. */
  marker: { x: -20, y: PANEL_TRACK.y - 4, width: 40, height: 78 },
} as const satisfies Record<string, Box>;

/** The panel's locked pieces (M6-07Q). */
export type WavePanelPiece =
  | "wave-panel"
  | "wave-track"
  | "wave-track-fill"
  | "wave-marker"
  | "emblem-boss"
  | "emblem-start";

/** The track's inner channel, from the `wave-track` art: the fill sits in it (logical px). */
const TRACK_CHANNEL = { height: 10, offsetY: -0.75 } as const;

/** Draws one locked panel piece (M6-07Q) contained in `box`, centred, bottom-aligned for emblems. */
function placePiece(
  scene: Phaser.Scene,
  name: WavePanelPiece,
  box: Box,
  align: "centre" | "bottom" = "centre",
): Phaser.GameObjects.Image {
  const size = uiPieceSize(name);
  const scale = Math.min(box.width / size.width, box.height / size.height);
  const height = size.height * scale;
  const y = align === "bottom" ? box.y + box.height - height / 2 : box.y + box.height / 2;
  return scene.add
    .image(box.x + box.width / 2, y, uiPiece(name).key)
    .setDisplaySize(size.width * scale, height)
    .setName(name);
}

/** What the transition panel shows (RESOLVED-91 item 1). */
export interface PanelInfo {
  readonly spec: Pick<TransitionSpec, "fromWave" | "waveCount">;
  readonly names: StageNames;
}

/**
 * The transition panel (M2-07G): the area name small on top, the stage name in quotes on the
 * gold-trimmed plate, the boss emblem left and start emblem right, the track with its fill and the
 * marker sliding from the cleared wave toward the boss, and "BATTLE n/N" stepping to the next wave
 * while it slides. All text is Lilita One rendered in code and fitted to its box.
 */
export class TransitionPanel {
  private container: Phaser.GameObjects.Container | undefined;
  private label: Phaser.GameObjects.Text | undefined;
  private marker: Phaser.GameObjects.Image | undefined;
  private fill: Phaser.GameObjects.Image | undefined;
  private info: PanelInfo | undefined;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fontFamily: string,
    private readonly motion = true,
  ) {}

  show(info: PanelInfo): void {
    this.hide();
    this.info = info;
    const L = PANEL_LAYOUT;
    const piece = (name: WavePanelPiece, box: Box): Phaser.GameObjects.Image =>
      placePiece(this.scene, name, box);
    const text = (value: string, box: Box, size: number, color: string): Phaser.GameObjects.Text =>
      fitTextToBox(
        this.scene.add.text(0, 0, value, hudTextStyle(this.fontFamily, size, color)),
        box,
      );
    // The fill grows from its left end; `update` sets its width.
    const fill = this.scene.add
      .image(0, 0, uiPiece("wave-track-fill").key)
      .setOrigin(0, 0.5)
      .setName("wave-track-fill");
    // The marker hangs from its tip (the image's top edge); `update` moves it along the track.
    const markerSize = uiPieceSize("wave-marker");
    const marker = this.scene.add
      .image(0, 0, uiPiece("wave-marker").key)
      .setOrigin(0.5, 0)
      .setDisplaySize(L.marker.width, (markerSize.height * L.marker.width) / markerSize.width)
      .setName("wave-marker");
    const label = text("", L.label, 24, "#ffffff");
    this.label = label;
    this.marker = marker;
    this.fill = fill;
    this.container = this.scene.add
      .container(0, 0, [
        piece("wave-panel", L.plate),
        text(info.names.area, L.area, 20, "#f3e3c0"),
        text(`\u201c${info.names.stage}\u201d`, L.stage, 32, "#fff4d6"),
        placePiece(this.scene, "wave-track", {
          x: L.track.x,
          y: PANEL_TRACK.y - L.track.width,
          width: L.track.width,
          height: L.track.width * 2,
        }),
        fill,
        placePiece(this.scene, "emblem-boss", L.emblemBoss, "bottom"),
        placePiece(this.scene, "emblem-start", L.emblemStart, "bottom"),
        text("BOSS", L.bossWord, 24, "#ff8a5a"),
        text("START", L.startWord, 24, "#ffd65a"),
        label,
        marker,
      ])
      .setDepth(PANEL_DEPTH);
    this.update(0);
  }

  /** `progress` 0..1 through the panel beat. */
  update(progress: number): void {
    if (!this.info || !this.label || !this.marker || !this.fill) return;
    fitTextToBox(this.label.setText(panelLabel(this.info.spec, progress)), PANEL_LAYOUT.label);
    const place = panelMarker(this.info.spec, progress, this.motion);
    this.marker.setPosition(panelMarkerX(place), PANEL_LAYOUT.marker.y);
    const fill = panelFill(place);
    this.fill
      .setPosition(fill.x, PANEL_TRACK.y + TRACK_CHANNEL.offsetY)
      .setDisplaySize(Math.max(fill.width, 1), TRACK_CHANNEL.height)
      .setVisible(fill.width > 0);
  }

  hide(): void {
    this.container?.destroy();
    this.container = undefined;
    this.label = undefined;
    this.marker = undefined;
    this.fill = undefined;
    this.info = undefined;
  }
}

/**
 * Draws a transition frame over the battlefield band (logical y 88–520) only: the unit cards, OD
 * bar, and item bar stay. Black enters from the right edge on the wipe out, holds behind the panel,
 * and uncovers the field from the left on the wipe in. Reduced motion swaps both wipes for fades
 * of the same length.
 */
export class WaveTransitionView {
  private curtain: Phaser.GameObjects.Rectangle | undefined;
  readonly panel: TransitionPanel;

  constructor(
    private readonly scene: Phaser.Scene,
    fontFamily: string,
    private readonly motion: boolean,
  ) {
    this.panel = new TransitionPanel(scene, fontFamily, motion);
  }

  render(frame: TransitionFrame): void {
    const { field } = BANDS;
    const covered = (x: number, width: number, alpha: number): void => {
      this.curtain ??= this.scene.add
        .rectangle(0, field.y, BATTLE_WIDTH, field.height, 0x000000)
        .setOrigin(0)
        .setDepth(CURTAIN_DEPTH);
      this.curtain
        .setPosition(x, field.y)
        .setSize(width, field.height)
        .setAlpha(alpha)
        .setVisible(true);
    };
    const p = frame.progress;
    switch (frame.beat) {
      case "wipe-out":
        if (this.motion) covered(BATTLE_WIDTH * (1 - p), BATTLE_WIDTH * p, 1);
        else covered(0, BATTLE_WIDTH, p);
        return;
      case "panel":
        covered(0, BATTLE_WIDTH, 1);
        this.panel.update(p);
        return;
      case "wipe-in":
        if (this.motion) covered(BATTLE_WIDTH * p, BATTLE_WIDTH * (1 - p), 1);
        else covered(0, BATTLE_WIDTH, 1 - p);
        return;
      default:
        this.curtain?.setVisible(false);
    }
  }

  clear(): void {
    this.curtain?.destroy();
    this.curtain = undefined;
    this.panel.hide();
  }
}
