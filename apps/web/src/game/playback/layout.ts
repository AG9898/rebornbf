import type { BattleState, EnemySlotId, PlayerSlotId } from "@bfr/engine";
import type { HitRegion } from "../input/index.ts";

/**
 * A rectangle on the 640×1136 logical grid (RESOLVED-40). The screen follows the Battle Screen
 * bands in ART_GUIDE.md (M2-03C): top bar, battle field, boss bar, unit cards, OD bar, item bar.
 */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Native sprite frame size; drawn at scale 1 on the grid, which is exactly 2× on the canvas. */
export const SPRITE_SIZE = 128;
/** Party slots on the field and in the card panel. */
export const PARTY_SLOTS = 6;

/** The screen's horizontal bands, top to bottom (logical px). */
export const BANDS = {
  topBar: { x: 0, y: 0, width: 640, height: 88 },
  field: { x: 0, y: 88, width: 640, height: 432 },
  bossBar: { x: 0, y: 520, width: 640, height: 44 },
  cards: { x: 0, y: 564, width: 640, height: 345 },
  odBar: { x: 0, y: 909, width: 640, height: 44 },
  itemBar: { x: 0, y: 953, width: 640, height: 183 },
} as const satisfies Record<string, Rect>;

/** Enemy sprite frames on the left of the field, by wave position. */
const ENEMY_RECTS: readonly Rect[] = [
  { x: 24, y: 306, width: 128, height: 128 },
  { x: 164, y: 210, width: 128, height: 128 },
  { x: 40, y: 116, width: 128, height: 128 },
];

/** Enemy placement for the `index`-th enemy of the wave. */
export function enemyRect(index: number): Rect {
  return ENEMY_RECTS[index % ENEMY_RECTS.length] ?? { x: 0, y: 0, width: 1, height: 1 };
}

/** Bosses use the locked 256×256 canvas, with their feet above the rock band. */
export function bossEnemyRect(): Rect {
  return { x: 28, y: 190, width: 256, height: 256 };
}

/**
 * The party's staggered formation on the right of the field (party order): two columns of three,
 * the back column set half a row lower than the front one (nearer the enemies), like the original.
 */
const FORMATION: readonly { readonly x: number; readonly y: number }[] = [
  { x: 350, y: 96 },
  { x: 490, y: 108 },
  { x: 334, y: 208 },
  { x: 474, y: 220 },
  { x: 318, y: 320 },
  { x: 458, y: 332 },
];

/** The 128×128 sprite frame of the `index`-th party unit; its feet sit on the bottom edge. */
export function unitSpriteRect(index: number): Rect {
  const at = FORMATION[index % PARTY_SLOTS] ?? { x: 0, y: 0 };
  return { x: at.x, y: at.y, width: SPRITE_SIZE, height: SPRITE_SIZE };
}

/**
 * The touch region of a party unit's sprite: the figure inside the frame, so neighbouring units
 * in the staggered formation never share a touch point.
 */
export function unitTouchRect(index: number): Rect {
  const frame = unitSpriteRect(index);
  return { x: frame.x + 16, y: frame.y + 14, width: 96, height: 110 };
}

/** Unit cards in the card band: 2 columns × 3 rows of about 320×115, in party order. */
export function unitCardRect(index: number): Rect {
  const slot = index % PARTY_SLOTS;
  return {
    x: 4 + (slot % 2) * 320,
    y: BANDS.cards.y + 2 + Math.floor(slot / 2) * 115,
    width: 312,
    height: 111,
  };
}

/**
 * The locked HUD pieces are 2× exports cut from the approved keyframe (ART_GUIDE.md → Battle HUD
 * art), which is 1024×1536: squatter than the 640×1136 grid. Panels, frames, and bars are drawn at
 * half width and `PANEL_STRETCH`× half height so they land on the keyframe's bands; round emblems
 * (crests, orbs, the leader crown, portraits) keep their aspect.
 */
export const ART_SCALE = 0.5;
export const PANEL_STRETCH = 1136 / 1536 / (640 / 1024);

/** Height (logical px) of a panel piece whose 2× export is `pixels` tall. */
export function panelHeight(pixels: number): number {
  return pixels * ART_SCALE * PANEL_STRETCH;
}

/** Where each HUD piece sits (logical px), measured from `battle-keyframe-v2.png`. */
export const HUD = {
  topPlate: { x: 0, y: 0, width: 640, height: panelHeight(117) },
  /** Top crest centre and top edge; its shield runs off the top of the screen, as in the keyframe. */
  topCrest: { x: 320, y: -28 },
  /** Top-row pills on the field's top edge: Damage and Spark counters, and Menu (right). */
  damagePill: { x: 6, y: 68, width: 150, height: panelHeight(63) },
  sparkPill: { x: 245, y: 68, width: 150, height: panelHeight(63) },
  menuPill: { x: 484, y: 68, width: 150, height: panelHeight(63) },
  bossBand: { x: 0, y: 442, width: 640, height: panelHeight(138) },
  /** Boss crest top-left; its ring (the boss orb) is centred at `bossOrb`. */
  bossCrest: { x: -15, y: 462, width: 120, height: 66 },
  bossOrb: { x: 45, y: 498, size: 37 },
  bossName: { x: 98, y: 505 },
  autoPill: { x: 420, y: 480, width: 98, height: 35 },
  speedPill: { x: 527, y: 480, width: 98, height: 35 },
  bossHpFrame: { x: 0, y: 522, width: 640, height: panelHeight(67) },
  /** The dark trough inside `boss-hp-frame` (2× px 23–1254 × 15–52). */
  bossHpTrough: {
    x: 11.5,
    y: 522 + 15 * ART_SCALE * PANEL_STRETCH,
    width: 616,
    height: 38 * ART_SCALE * PANEL_STRETCH,
  },
  odFrame: { x: 0, y: 911, width: 640, height: panelHeight(67) },
  /** The dark trough inside `od-frame` (2× px 24–1255 × 14–52). */
  odTrough: {
    x: 12,
    y: 911 + 14 * ART_SCALE * PANEL_STRETCH,
    width: 616,
    height: 39 * ART_SCALE * PANEL_STRETCH,
  },
  itemPanel: { x: 0, y: 948, width: 640, height: panelHeight(318) },
  /** Five item slots; the first five inventory items fill them in setup order (M2-02D). */
  itemSlot: { x: 13, y: 972, width: 116, height: panelHeight(248), pitch: 123 },
} as const;

/**
 * Parts of a unit card relative to its top-left, for a card drawn at `unitCardRect` size
 * (the 624×186 `unit-card` export at 0.5 × 111/93).
 */
const CARD_SY = 111 / 186;
export const CARD_PARTS = {
  /** Scale of the 2× card export's height onto the 111 px card. */
  scaleY: CARD_SY,
  /** The transparent portrait window (2× px 14–229 × 13–172). */
  window: { x: 7, y: 13 * CARD_SY, width: 108, height: 160 * CARD_SY },
  /** Bar troughs (2× px 249–595; HP 76–97, brave 119–140). */
  hpTrough: { x: 124.5, y: 76 * CARD_SY, width: 173, height: 22 * CARD_SY },
  bbTrough: { x: 124.5, y: 119 * CARD_SY, width: 173, height: 22 * CARD_SY },
  orb: { x: 22, y: 84, size: 34 },
  leader: { x: 9, y: 8, width: 29, height: 18 },
  name: { x: 128, y: 13 },
  hp: { x: 298, y: 15 },
  tier: { x: 296, y: 85 },
} as const;

/** The OD gauge is its own touch region: the whole `od-frame`. */
export const OD_BUTTON: Rect = { x: 0, y: 911, width: 640, height: 40 };

/** Item bar slots drawn and touchable. */
export const ITEM_SLOTS = 5;

/** The `index`-th item slot's rectangle. */
export function itemSlotRect(index: number): Rect {
  const { x, y, width, height, pitch } = HUD.itemSlot;
  return { x: x + index * pitch, y, width, height };
}

/**
 * Touch regions for the current battle: unit sprites and cards, enemies, the OD button, the item
 * slots holding items, and the Auto and Speed pills.
 */
export function hitRegions(state: BattleState, enemyBounds = enemyRect): HitRegion[] {
  const regions: HitRegion[] = [];
  state.enemies.forEach((enemy, i) => {
    regions.push({ target: { kind: "enemy", slot: enemy.slot }, ...enemyBounds(i) });
  });
  state.party.forEach((unit, i) => {
    const target = { kind: "unit", slot: unit.slot } as const;
    regions.push({ target, ...unitTouchRect(i) }, { target, ...unitCardRect(i) });
  });
  regions.push({ target: { kind: "od" }, ...OD_BUTTON });
  state.items.slice(0, ITEM_SLOTS).forEach((stack, i) => {
    regions.push({ target: { kind: "item", item: stack.item.id }, ...itemSlotRect(i) });
  });
  const { autoPill, speedPill } = HUD;
  regions.push(
    { target: { kind: "auto" }, ...autoPill },
    { target: { kind: "speed" }, ...speedPill },
  );
  return regions;
}

/** Index lookups so cues (which carry slot IDs) find their drawings. */
export function partyIndex(state: BattleState, slot: PlayerSlotId): number {
  return state.party.findIndex((unit) => unit.slot === slot);
}

export function enemyIndex(state: BattleState, slot: EnemySlotId): number {
  return state.enemies.findIndex((enemy) => enemy.slot === slot);
}
