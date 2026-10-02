import type { BurstTier } from "@bfr/engine";
import type Phaser from "phaser";
import { type Box, fitScale, pieceTextBox } from "../../components/menu/text-box.ts";
import {
  type BattleUiPiece,
  elementOrb,
  itemIconPiece,
  PORTRAIT_ART,
  uiPiece,
  uiPieceSize,
} from "../assets/ui.ts";
import { BATTLE_HEIGHT, BATTLE_WIDTH, CANVAS_ZOOM } from "../bridge.ts";
import {
  ART_SCALE,
  CARD_PARTS,
  enemyRect,
  HUD,
  ITEM_SLOTS,
  itemSlotRect,
  PARTY_SLOTS,
  type Rect,
  unitCardRect,
} from "../playback/layout.ts";
import { type BattleControls, speedLabel } from "./controls.ts";
import { bossEnemy, gaugeView, type HudState, type HudUnit, resultTitle } from "./model.ts";

/** The menu's outlined label style (ART_GUIDE.md → UI): white with a dark brown outline. */
export const OUTLINE = "#2a1606";
/** Used until the Lilita One webfont is known to be loaded (it always is by `mountBattle`). */
export const FALLBACK_FONT = "sans-serif";
/** Item icons fill 70% of the slot's width, like sphere icons in their sockets (ART_GUIDE → UI). */
const ITEM_ICON_SCALE = 0.7;

export const HUD_COLORS = {
  window: 0x10152a,
  mark: 0xf5e4b2,
  overlay: 0x0b0d17,
  /** Card and portrait tints: acted (dimmed), downed (dark red), Overdrive Mode (pink glow). */
  acted: 0x70707e,
  downCard: 0x806060,
  downPortrait: 0x5a3434,
  overdrive: 0xffc0ea,
  /** Item slots: the selected single-target item (gold), and an item with none left (dimmed). */
  itemSelected: 0xffd36a,
  itemEmpty: 0x6a6a78,
} as const;

/** Top counter label colours (ART_GUIDE.md → Effects): Damage orange, Spark green. */
const DAMAGE_LABEL = "#ff9a2e";
const SPARK_LABEL = "#72e05a";

/** Brave gauge fill for the highest charged tier; an uncharged gauge fills blue like BB. */
const TIER_FILL: Readonly<Record<BurstTier, BattleUiPiece>> = {
  bb: "fill-bb",
  sbb: "fill-sbb",
  ubb: "fill-ubb",
};

const TIER_LABEL_COLOR: Readonly<Record<BurstTier, string>> = {
  bb: "#8fd0ff",
  sbb: "#d8a8ff",
  ubb: "#ff7a8a",
};

/** Outlined Lilita One text at the canvas resolution, so the 2× camera draws it 1:1 and sharp. */
export function hudTextStyle(
  fontFamily: string,
  size: number,
  color = "#ffffff",
): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    color,
    fontFamily,
    fontSize: `${size}px`,
    stroke: OUTLINE,
    strokeThickness: Math.max(3, Math.round(size / 5)),
    resolution: CANVAS_ZOOM,
  };
}

/**
 * Fits a label inside a piece's text box (`pieceTextBox`): vertically centred, left-aligned or
 * centred, and scaled down (never up) until it fits. Call again after `setText`.
 */
export function fitTextToBox(
  text: Phaser.GameObjects.Text,
  box: Box,
  align: "left" | "center" = "center",
): Phaser.GameObjects.Text {
  text.setScale(1);
  text.setScale(fitScale(text, box));
  text.setOrigin(align === "left" ? 0 : 0.5, 0.5);
  return text.setPosition(align === "left" ? box.x : box.x + box.width / 2, box.y + box.height / 2);
}

/** A square-cut fill strip laid over a trough and cropped (never squashed) to its ratio. */
interface Fill {
  readonly image: Phaser.GameObjects.Image;
}

interface CardView {
  readonly card: Phaser.GameObjects.Image;
  readonly portrait?: Phaser.GameObjects.Image;
  readonly hp: Fill;
  readonly bc: Fill;
  readonly hpText: Phaser.GameObjects.Text;
  readonly name: Phaser.GameObjects.Text;
  readonly marks: Phaser.GameObjects.Rectangle[];
  readonly tier: Phaser.GameObjects.Text;
}

interface ItemSlotView {
  readonly slot: Phaser.GameObjects.Image;
  readonly icon: Phaser.GameObjects.Image | undefined;
  readonly name: Phaser.GameObjects.Text;
  readonly count: Phaser.GameObjects.Text;
}

interface PillView {
  readonly rect: Rect;
  parts: readonly Phaser.GameObjects.Image[];
  readonly label: Phaser.GameObjects.Text;
}

/** What the HUD draws besides `HudState`: the font, the top-plate title, and each slot's portrait. */
export interface HudArt {
  readonly fontFamily: string;
  readonly title: string;
  /** Loaded portrait texture key per party index; a slot without one shows an empty window. */
  readonly portraits: readonly (string | undefined)[];
}

function clamp01(ratio: number): number {
  return Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
}

function offset(rect: Rect, by: { x: number; y: number }): Rect {
  return { ...rect, x: rect.x + by.x, y: rect.y + by.y };
}

/**
 * The battle HUD (M2-02C; locked art M2-07A): the top plate with the Damage/Spark counters and
 * Menu pill, the boss band (crest with the boss's element orb, name, Auto/Speed pills) and HP bar,
 * six unit cards (portrait, element orb, leader crown, HP and brave fills), the OD gauge, the item
 * panel, enemy names, and the win/lose screen. It draws only `HudState`, which is built from
 * engine events; it never reads or computes battle outcomes.
 */
export class HudView {
  private cards: CardView[] = [];
  private enemyNames: Phaser.GameObjects.Text[] = [];
  private od!: Fill;
  private odText!: Phaser.GameObjects.Text;
  private odFrame!: Phaser.GameObjects.Image;
  private header!: Phaser.GameObjects.Text;
  private damage!: Phaser.GameObjects.Text;
  private sparks!: Phaser.GameObjects.Text;
  private bossName!: Phaser.GameObjects.Text;
  /** The boss name's measured box on the rock band, right of the crest (`UI_TEXT_BOXES`). */
  private bossNameBox!: Box;
  private bossOrb!: Phaser.GameObjects.Image;
  private bossHp!: Fill;
  private result: Phaser.GameObjects.GameObject[] = [];
  private items: ItemSlotView[] = [];
  private itemIds: string[] = [];
  private itemCounts: number[] = [];
  private selectedItem: string | undefined;
  private autoPill!: PillView;
  private speedPill!: PillView;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly art: HudArt,
    private readonly enemyBounds = enemyRect,
  ) {}

  build(hud: HudState): void {
    this.buildTop();
    this.buildBoss();
    hud.units.forEach((unit, i) => {
      this.cards.push(this.buildCard(unit, unitCardRect(i), this.art.portraits[i]));
    });
    for (let i = hud.units.length; i < PARTY_SLOTS; i++) {
      const r = unitCardRect(i);
      const height = uiPieceSize("unit-card-empty").height * CARD_PARTS.scaleY;
      this.piece("unit-card-empty", { ...r, y: r.y + (r.height - height) / 2, height });
    }
    this.buildOd();
    this.buildItems(hud);
    this.buildEnemies(hud);
    this.render(hud);
  }

  /**
   * Rebuilds the enemy names for the current wave. Enemies have no HP bars of their own: the boss
   * HP bar above the cards is the enemy HP indicator, as in the original.
   */
  buildEnemies(hud: HudState): void {
    for (const name of this.enemyNames) name.destroy();
    this.enemyNames = hud.enemies.map((enemy, i) => {
      const r = this.enemyBounds(i);
      return this.text(r.x, r.y + r.height + 7, enemy.name, 18);
    });
  }

  /** Redraws every bar, counter, and label from the HUD state. */
  render(hud: HudState): void {
    this.header.setText(`BATTLE ${hud.wave + 1}/${hud.waveCount}   TURN ${hud.turn}`);
    this.damage.setText(hud.counters.damage.toLocaleString("en-US"));
    this.sparks.setText(`${hud.counters.sparks}`);
    hud.units.forEach((unit, i) => {
      const view = this.cards[i];
      if (view) this.renderCard(view, unit);
    });
    const boss = bossEnemy(hud);
    fitTextToBox(this.bossName.setText(boss?.name ?? ""), this.bossNameBox, "left");
    this.bossOrb.setVisible(boss !== undefined);
    if (boss) this.bossOrb.setTexture(uiPiece(elementOrb(boss.element)).key);
    this.setFill(this.bossHp, boss ? boss.hp / boss.maxHp : 0);
    const full = hud.od.points >= hud.od.limit;
    this.setFill(this.od, hud.od.points / hud.od.limit);
    this.odText.setText(full ? "OVERDRIVE" : "OD").setColor(full ? "#ffd6f0" : "#ffffff");
    this.itemCounts = hud.items.map((item) => item.count);
    this.items.forEach((view, i) => {
      const item = hud.items[i];
      view.name.setText(item?.name ?? "");
      view.count.setText(item ? `x${item.count}` : "");
    });
    this.paintItems();
  }

  /** The Auto pill lights while auto-battle is on; the Speed pill shows x1 or x2. */
  setControls(controls: BattleControls): void {
    this.lightPill(this.autoPill, controls.auto);
    this.lightPill(this.speedPill, controls.speed === 2);
    this.speedPill.label.setText(speedLabel(controls.speed));
  }

  /** Redraws a pill in the lit or plain art (their heights differ), its label kept on top. */
  private lightPill(view: PillView, lit: boolean): void {
    for (const part of view.parts) part.destroy();
    view.parts = this.pill(view.rect, lit ? "btn-pill-lit" : "btn-pill");
    view.label.setToTop().setColor(lit ? "#fff4b0" : "#ffffff");
  }

  /** Rings the selected single-target item's slot in gold until it is used or deselected. */
  setSelectedItem(item: string | undefined): void {
    this.selectedItem = item;
    this.paintItems();
  }

  /** Dims used-up items and rings the selected one. */
  private paintItems(): void {
    this.items.forEach((view, i) => {
      const empty = (this.itemCounts[i] ?? 0) <= 0;
      view.icon?.setAlpha(empty ? 0.4 : 1);
      view.name.setAlpha(empty ? 0.5 : 1);
      view.count.setAlpha(empty ? 0.5 : 1);
      if (empty) view.slot.setTint(HUD_COLORS.itemEmpty);
      else if (this.itemIds[i] === this.selectedItem) view.slot.setTint(HUD_COLORS.itemSelected);
      else view.slot.clearTint();
    });
  }

  /** Lights the OD gauge while Overdrive selection is armed. */
  setOdArmed(armed: boolean): void {
    if (armed) this.odFrame.setTint(HUD_COLORS.overdrive);
    else this.odFrame.clearTint();
  }

  /** Centre of a unit's card, for crystal pickups. */
  cardCenter(index: number): { x: number; y: number } {
    const r = unitCardRect(index);
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }

  /** The win/lose screen. */
  showResult(result: "win" | "lose", turn: number, replay = true): void {
    this.hideResult();
    const shade = this.scene.add
      .rectangle(0, 0, BATTLE_WIDTH, BATTLE_HEIGHT, HUD_COLORS.overlay, 0.78)
      .setOrigin(0);
    const title = this.text(
      BATTLE_WIDTH / 2,
      419,
      resultTitle(result),
      64,
      result === "win" ? "#ffcf4a" : "#e05050",
    ).setOrigin(0.5);
    const detail = this.text(
      BATTLE_WIDTH / 2,
      504,
      result === "win" ? `Cleared in ${turn} turns` : `Fell on turn ${turn}`,
      26,
    ).setOrigin(0.5);
    this.result = [shade, title, detail];
    if (replay) {
      this.result.push(
        this.text(BATTLE_WIDTH / 2, 575, "Tap to play again", 24, "#d8dcf0").setOrigin(0.5),
      );
    }
    this.scene.tweens.add({ targets: this.result, alpha: { from: 0, to: 1 }, duration: 300 });
  }

  hideResult(): void {
    for (const object of this.result) object.destroy();
    this.result = [];
  }

  /** Top plate and crest, the title and wave/turn header, and the Damage, Spark, and Menu pills. */
  private buildTop(): void {
    this.piece("battle-top", HUD.topPlate);
    const crest = uiPieceSize("top-crest");
    this.piece("top-crest", {
      x: HUD.topCrest.x - (crest.width * ART_SCALE) / 2,
      y: HUD.topCrest.y,
      width: crest.width * ART_SCALE,
      height: crest.height * ART_SCALE,
    });
    const plateMid = HUD.topPlate.y + 30;
    this.text(22, plateMid, this.art.title, 18).setOrigin(0, 0.5);
    this.header = this.text(618, plateMid, "", 18).setOrigin(1, 0.5);

    const counter = (pill: Rect, label: string, color: string): Phaser.GameObjects.Text => {
      this.piece("btn-pill", pill);
      const mid = pill.y + pill.height / 2;
      this.text(pill.x + 13, mid, label, 15, color).setOrigin(0, 0.5);
      return this.text(pill.x + pill.width - 13, mid, "0", 17).setOrigin(1, 0.5);
    };
    this.damage = counter(HUD.damagePill, "Damage", DAMAGE_LABEL);
    this.sparks = counter(HUD.sparkPill, "Spark", SPARK_LABEL);
    this.piece("btn-pill", HUD.menuPill);
    this.text(
      HUD.menuPill.x + HUD.menuPill.width / 2,
      HUD.menuPill.y + HUD.menuPill.height / 2,
      "Menu",
      21,
    ).setOrigin(0.5);
  }

  /** The rock band with the boss crest, orb, and name, the Auto/Speed pills, and the boss HP bar. */
  private buildBoss(): void {
    this.piece("boss-band", HUD.bossBand);
    this.piece("boss-crest", HUD.bossCrest);
    const orb = HUD.bossOrb;
    this.bossOrb = this.scene.add
      .image(orb.x, orb.y, uiPiece("orb-fire").key)
      .setDisplaySize(orb.size, orb.size);
    this.bossNameBox = pieceTextBox("boss-band", HUD.bossBand);
    this.bossName = this.text(0, 0, "", 22);
    // Tapped through the scene's hit regions; `setControls` shows their state (M2-02D).
    const pill = (rect: Rect, label: string): PillView => ({
      rect,
      parts: this.pill(rect, "btn-pill"),
      label: this.text(rect.x + rect.width / 2, rect.y + rect.height / 2, label, 19).setOrigin(0.5),
    });
    this.autoPill = pill(HUD.autoPill, "Auto");
    this.speedPill = pill(HUD.speedPill, "x1");
    this.piece("boss-hp-frame", HUD.bossHpFrame);
    this.bossHp = this.fill("fill-boss", HUD.bossHpTrough);
  }

  private buildOd(): void {
    this.odFrame = this.piece("od-frame", HUD.odFrame);
    this.od = this.fill("fill-od", HUD.odTrough);
    const t = HUD.odTrough;
    this.odText = this.text(t.x + 12, t.y + t.height / 2, "OD", 17).setOrigin(0, 0.5);
  }

  /**
   * The item panel and its five slots (M2-02D): the first five inventory items in setup order,
   * each with its icon (M6-10B), name, and count; slots past the inventory stay empty. An item
   * without an icon shows its name in the middle of the slot instead.
   */
  private buildItems(hud: HudState): void {
    this.piece("item-panel", HUD.itemPanel);
    this.itemIds = hud.items.slice(0, ITEM_SLOTS).map((item) => item.id);
    this.items = [];
    for (let i = 0; i < ITEM_SLOTS; i++) {
      const r = itemSlotRect(i);
      const slot = this.piece("item-slot", r);
      const id = this.itemIds[i];
      if (id === undefined) continue;
      const iconPiece = itemIconPiece(id);
      const size = r.width * ITEM_ICON_SCALE;
      const icon = iconPiece
        ? this.scene.add
            .image(r.x + r.width / 2, r.y + r.height * 0.42, uiPiece(iconPiece).key)
            .setDisplaySize(size, size)
        : undefined;
      const name = icon
        ? this.text(r.x + r.width / 2, r.y + r.height * 0.84, "", 14).setOrigin(0.5)
        : this.text(r.x + r.width / 2, r.y + r.height * 0.42, "", 16).setOrigin(0.5);
      name.setAlign("center").setWordWrapWidth(r.width - 12);
      const count = icon
        ? this.text(r.x + r.width - 10, r.y + 12, "", 18).setOrigin(1, 0)
        : this.text(r.x + r.width - 10, r.y + r.height - 10, "", 18).setOrigin(1, 1);
      this.items.push({ slot, icon, name, count });
    }
  }

  private buildCard(unit: HudUnit, r: Rect, portraitKey: string | undefined): CardView {
    const at = { x: r.x, y: r.y };
    const window = offset(CARD_PARTS.window, at);
    this.scene.add
      .rectangle(window.x, window.y, window.width, window.height, HUD_COLORS.window)
      .setOrigin(0);
    let portrait: Phaser.GameObjects.Image | undefined;
    if (portraitKey && this.scene.textures.exists(portraitKey)) {
      // Placed by PORTRAIT_ART's offset in the 2× card, kept at its aspect (at the card's height
      // scale, so it covers the stretched window), and clipped to the window.
      portrait = this.scene.add
        .image(
          r.x + (PORTRAIT_ART.x + PORTRAIT_ART.width / 2) * ART_SCALE,
          r.y + PORTRAIT_ART.y * CARD_PARTS.scaleY,
          portraitKey,
        )
        .setOrigin(0.5, 0)
        .setScale(CARD_PARTS.scaleY);
      portrait.setMask(this.roundedMask(window, 6));
    }
    const card = this.piece("unit-card", r);
    const hp = this.fill("fill-hp", offset(CARD_PARTS.hpTrough, at));
    const bbTrough = offset(CARD_PARTS.bbTrough, at);
    const bc = this.fill("fill-bb", bbTrough);
    const marks = gaugeView(unit).marks.map(() =>
      this.scene.add
        .rectangle(0, bbTrough.y + 1, 2, bbTrough.height - 2, HUD_COLORS.mark, 0.9)
        .setOrigin(0.5, 0),
    );
    const orb = offset({ ...CARD_PARTS.orb, width: 0, height: 0 }, at);
    this.scene.add
      .image(orb.x, orb.y, uiPiece(elementOrb(unit.element)).key)
      .setDisplaySize(CARD_PARTS.orb.size, CARD_PARTS.orb.size);
    if (unit.leader) this.piece("badge-leader", offset(CARD_PARTS.leader, at));
    const name = this.text(r.x + CARD_PARTS.name.x, r.y + CARD_PARTS.name.y, unit.name, 20);
    const hpText = this.text(r.x + CARD_PARTS.hp.x, r.y + CARD_PARTS.hp.y, "", 17).setOrigin(1, 0);
    const tier = this.text(r.x + CARD_PARTS.tier.x, r.y + CARD_PARTS.tier.y, "", 14).setOrigin(
      1,
      0,
    );
    return {
      card,
      ...(portrait ? { portrait } : {}),
      hp,
      bc,
      hpText,
      name,
      marks,
      tier,
    };
  }

  private renderCard(view: CardView, unit: HudUnit): void {
    const down = unit.hp <= 0;
    this.setFill(view.hp, unit.hp / unit.maxHp);
    view.hpText.setText(`${unit.hp}`).setColor(down ? "#ff7070" : "#ffffff");
    const gauge = gaugeView(unit);
    view.bc.image.setTexture(uiPiece(gauge.ready ? TIER_FILL[gauge.ready] : "fill-bb").key);
    this.setFill(view.bc, down ? 0 : gauge.fill);
    const trough = view.bc.image;
    view.marks.forEach((mark, i) => {
      const at = gauge.marks[i]?.at;
      mark.setVisible(!down && at !== undefined && at < 1);
      if (at !== undefined) mark.setX(trough.x + Math.round(trough.displayWidth * at));
    });
    const ready = !down && gauge.ready ? gauge.ready : undefined;
    view.tier.setText(ready ? `${ready.toUpperCase()} READY` : "");
    if (ready) view.tier.setColor(TIER_LABEL_COLOR[ready]);

    let cardTint: number | undefined;
    let portraitTint: number | undefined;
    if (down) {
      cardTint = HUD_COLORS.downCard;
      portraitTint = HUD_COLORS.downPortrait;
    } else if (unit.acted) {
      cardTint = HUD_COLORS.acted;
      portraitTint = HUD_COLORS.acted;
    } else if (unit.overdrive) {
      cardTint = HUD_COLORS.overdrive;
    }
    if (cardTint === undefined) view.card.clearTint();
    else view.card.setTint(cardTint);
    if (view.portrait) {
      if (portraitTint === undefined) view.portrait.clearTint();
      else view.portrait.setTint(portraitTint);
    }
    view.name.setAlpha(down || unit.acted ? 0.6 : 1);
  }

  /** A locked piece stretched onto `rect` (2× exports: half width, panel-stretched height). */
  private piece(name: BattleUiPiece, rect: Rect): Phaser.GameObjects.Image {
    return this.scene.add
      .image(rect.x, rect.y, uiPiece(name).key)
      .setOrigin(0)
      .setDisplaySize(rect.width, rect.height);
  }

  /**
   * A pill narrower than its art: the two rounded caps at the art's scale and the plain middle
   * stretched between them, so the ends are not squashed.
   */
  private pill(rect: Rect, piece: "btn-pill" | "btn-pill-lit"): Phaser.GameObjects.Image[] {
    const key = uiPiece(piece).key;
    const { width, height } = uiPieceSize(piece);
    const cap = 32;
    const sy = rect.height / height;
    const left = this.scene.add.image(rect.x, rect.y, key).setOrigin(0).setScale(ART_SCALE, sy);
    left.setCrop(0, 0, cap, height);
    const right = this.scene.add
      .image(rect.x + rect.width - width * ART_SCALE, rect.y, key)
      .setOrigin(0)
      .setScale(ART_SCALE, sy);
    right.setCrop(width - cap, 0, cap, height);
    const middleScale = (rect.width - 2 * cap * ART_SCALE) / (width - 2 * cap);
    const middle = this.scene.add
      .image(rect.x + cap * ART_SCALE - cap * middleScale, rect.y, key)
      .setOrigin(0)
      .setScale(middleScale, sy);
    middle.setCrop(cap, 0, width - 2 * cap, height);
    return [left, right, middle];
  }

  /** A fill strip fitted to its trough, clipped to the trough's rounded ends. */
  private fill(name: BattleUiPiece, trough: Rect): Fill {
    const image = this.scene.add
      .image(trough.x, trough.y, uiPiece(name).key)
      .setOrigin(0)
      .setDisplaySize(trough.width, trough.height);
    image.setMask(this.roundedMask(trough, Math.min(trough.height / 2, 8)));
    return { image };
  }

  /** Crops a fill to `ratio` of its width: the strip keeps its look and gets a square-cut end. */
  private setFill(fill: Fill, ratio: number): void {
    const frame = fill.image.frame;
    const r = clamp01(ratio);
    fill.image.setCrop(0, 0, Math.round(frame.width * r), frame.height).setVisible(r > 0);
  }

  private roundedMask(rect: Rect, radius: number): Phaser.Display.Masks.GeometryMask {
    const shape = this.scene.make.graphics({}, false);
    shape.fillStyle(0xffffff).fillRoundedRect(rect.x, rect.y, rect.width, rect.height, radius);
    return shape.createGeometryMask();
  }

  private text(
    x: number,
    y: number,
    value: string,
    size: number,
    color = "#ffffff",
  ): Phaser.GameObjects.Text {
    return this.scene.add.text(x, y, value, hudTextStyle(this.art.fontFamily, size, color));
  }
}
