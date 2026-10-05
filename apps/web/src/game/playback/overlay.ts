import type Phaser from "phaser";
import { uiPiece, uiPieceSize } from "../assets/ui.ts";
import type { HudState } from "../hud/model.ts";
import { type StatusBadge, statusBadges } from "../hud/status.ts";
import { ART_SCALE, enemyRect, type Rect, unitSpriteRect } from "./layout.ts";

/** Status badge size and pitch (logical px; ART_GUIDE.md → Battle HUD art). */
const BADGE_PX = 32;
const BADGE_PITCH = 30;

interface BadgeRow {
  key: string;
  images: Phaser.GameObjects.Image[];
}

/**
 * Where a row of `count` badges sits over a party sprite frame (above the head) or an enemy
 * (above its top edge): the centre of the first badge and the pitch.
 */
export function badgeRowStart(
  anchor: Rect,
  count: number,
  enemy: boolean,
): { x: number; y: number } {
  const y = enemy ? anchor.y - BADGE_PX / 2 - 4 : anchor.y + BADGE_PX / 2;
  return { x: anchor.x + anchor.width / 2 - ((count - 1) * BADGE_PITCH) / 2, y };
}

/**
 * Field marks that follow `HudState` (M2-07B): status badges over units and enemies from their
 * active effect IDs, the guard shield over a guarding unit, and the target reticle on the selected
 * enemy. It only draws what the event-built HUD state says.
 */
export class FieldOverlay {
  private unitRows: BadgeRow[] = [];
  private enemyRows: BadgeRow[] = [];
  private guards: Phaser.GameObjects.Image[] = [];
  private reticle!: Phaser.GameObjects.Image;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly enemyBounds = enemyRect,
  ) {}

  build(hud: HudState): void {
    this.buildUnits(hud);
    this.reticle = this.scene.add.image(0, 0, uiPiece("target-reticle").key).setVisible(false);
    this.scene.tweens.add({
      targets: this.reticle,
      angle: 360,
      duration: 6000,
      repeat: -1,
    });
    this.resetEnemies();
  }

  /** Clears the wiped party's guard shields and badges for the squad that entered (M6-01L). */
  resetUnits(hud: HudState): void {
    for (const guard of this.guards) guard.destroy();
    for (const row of this.unitRows) for (const image of row.images) image.destroy();
    this.buildUnits(hud);
  }

  private buildUnits(hud: HudState): void {
    this.guards = hud.units.map((_, i) => {
      const frame = unitSpriteRect(i);
      const { width, height } = uiPieceSize("icon-guard");
      return this.scene.add
        .image(frame.x + 22, frame.y + 78, uiPiece("icon-guard").key)
        .setDisplaySize(width * ART_SCALE, height * ART_SCALE)
        .setVisible(false);
    });
    this.unitRows = hud.units.map(() => ({ key: "", images: [] }));
  }

  /** Clears enemy badges (a new wave spawned). */
  resetEnemies(): void {
    for (const row of this.enemyRows) for (const image of row.images) image.destroy();
    this.enemyRows = [];
  }

  render(hud: HudState): void {
    hud.units.forEach((unit, i) => {
      this.guards[i]?.setVisible(unit.guarding && unit.hp > 0);
      const row = this.unitRows[i];
      if (row)
        this.renderRow(
          row,
          unit.hp > 0 ? statusBadges(unit.effects) : [],
          unitSpriteRect(i),
          false,
        );
    });
    hud.enemies.forEach((enemy, i) => {
      this.enemyRows[i] ??= { key: "", images: [] };
      const row = this.enemyRows[i];
      if (row)
        this.renderRow(
          row,
          enemy.hp > 0 ? statusBadges(enemy.effects) : [],
          this.enemyBounds(i),
          true,
        );
    });
  }

  /** Puts the reticle on the `index`-th enemy, or hides it (undefined). */
  target(index: number | undefined): void {
    if (index === undefined) {
      this.reticle.setVisible(false);
      return;
    }
    const r = this.enemyBounds(index);
    const size = Math.max(r.width, r.height) * 0.9;
    this.reticle
      .setPosition(r.x + r.width / 2, r.y + r.height / 2)
      .setDisplaySize(size, size)
      .setVisible(true);
  }

  private renderRow(
    row: BadgeRow,
    badges: readonly StatusBadge[],
    anchor: Rect,
    enemy: boolean,
  ): void {
    const key = badges.join(",");
    if (key === row.key) return;
    for (const image of row.images) image.destroy();
    const start = badgeRowStart(anchor, badges.length, enemy);
    row.key = key;
    row.images = badges.map((badge, i) =>
      this.scene.add
        .image(start.x + i * BADGE_PITCH, start.y, uiPiece(badge).key)
        .setDisplaySize(BADGE_PX, BADGE_PX),
    );
  }
}
