import type { Element } from "@bfr/data";
import { PORTRAIT_ART, UI_ASSETS, type UiAsset } from "../../components/menu/ui-assets.ts";

/**
 * The locked battle HUD pieces (legacy/ART_GUIDE_BFR.md → Battle HUD art), exported by `bfr_ui.py` to
 * `public/assets/ui/<name>.webp` at 2× their logical size. Each is a Phaser texture keyed
 * `ui-<name>`.
 */
export const BATTLE_UI_PIECES = [
  "battle-top",
  "top-crest",
  "btn-pill",
  "btn-pill-lit",
  "boss-band",
  "boss-crest",
  "boss-hp-frame",
  "od-frame",
  "fill-boss",
  "fill-od",
  "unit-card",
  "unit-card-empty",
  "fill-hp",
  "fill-bb",
  "fill-sbb",
  "fill-ubb",
  "badge-leader",
  "item-panel",
  "item-slot",
  "orb-fire",
  "orb-water",
  "orb-thunder",
  "orb-earth",
  "orb-light",
  "orb-dark",
  // Drops, hit feedback, icons, status badges, and banners (M2-07B).
  "crystal-bc",
  "crystal-hc",
  "fx-hit",
  "fx-spark",
  "fx-crit",
  "target-reticle",
  "icon-guard",
  // Weakness/resist arrows from each hit's engine `element` relation.
  "icon-weak",
  "icon-resist",
  "status-poison",
  "status-weak",
  "status-sick",
  "status-injury",
  "status-curse",
  "status-paralysis",
  "buff-atk",
  "buff-def",
  "buff-rec",
  "buff-crit",
  "buff-spark",
  "buff-bb-atk",
  "buff-element",
  "buff-regen",
  "buff-mitigation",
  "buff-elem-guard",
  "buff-barrier",
  "buff-last-stand",
  "buff-gauge-fill",
  "buff-gauge-rate",
  "buff-drop-rate",
  "debuff-atk",
  "debuff-def",
  "debuff-spark-vuln",
  "debuff-dot",
  "banner-wave",
  "banner-boss",
  "cutin-ribbon-bb",
  "cutin-ribbon-sbb",
  "cutin-ribbon-ubb",
  "cutin-streaks",
  // Battle item icons in the item bar (M6-10B).
  "item-dew-tonic",
  "item-bright-tonic",
  "item-grand-tonic",
  "item-rekindle-ash",
  "item-valor-draught",
  "item-bitterleaf",
  // Wave transition panel (M6-07Q, RESOLVED-91).
  "wave-panel",
  "wave-track",
  "wave-track-fill",
  "wave-marker",
  "emblem-boss",
  "emblem-start",
] as const satisfies readonly UiAsset[];

export type BattleUiPiece = (typeof BATTLE_UI_PIECES)[number];

export interface UiTexture {
  readonly key: string;
  readonly imageUrl: string;
}

export function uiPiece(name: BattleUiPiece): UiTexture {
  return { key: `ui-${name}`, imageUrl: `/assets/ui/${name}.webp` };
}

/** Pixel size of a piece's 2× export. */
export function uiPieceSize(name: BattleUiPiece): { width: number; height: number } {
  return UI_ASSETS[name];
}

/** A battle item's icon piece, or undefined for an item without one (its name still shows). */
export function itemIconPiece(itemId: string): BattleUiPiece | undefined {
  const name = `item-${itemId}`;
  return (BATTLE_UI_PIECES as readonly string[]).includes(name)
    ? (name as BattleUiPiece)
    : undefined;
}

export function elementOrb(element: Element): BattleUiPiece {
  return `orb-${element}`;
}

/**
 * A unit form's battle portrait (M2-06D), `public/assets/ui/cards/battle/<art>-<form>.webp`, for an
 * `art/legacy/units/<art>` id and its exported form (`3star`…`7star`, `omni`). Undefined without an art id.
 */
export function unitPortrait(art: string | undefined, form = "6star"): UiTexture | undefined {
  if (!art) return undefined;
  return {
    key: `portrait-${art}-${form}`,
    imageUrl: `/assets/ui/cards/battle/${art}-${form}.webp`,
  };
}

/** Transparent 640×520 logical burst portrait for the same form worn in battle. */
export function unitCutinPortrait(art: string | undefined, form = "6star"): UiTexture | undefined {
  if (!art) return undefined;
  return { key: `cutin-${art}-${form}`, imageUrl: `/assets/ui/cards/cutin/${art}-${form}.webp` };
}

/** Portrait pixel size and its top-left offset inside the 2× `unit-card` export. */
export { PORTRAIT_ART };

/**
 * Queues every HUD piece and the given portraits on the scene's loader (skipping loaded ones).
 * A portrait that fails to load simply has no texture, and its card shows an empty window.
 */
export function preloadBattleUi(
  load: { image(key: string, url: string): unknown },
  textures: { exists(key: string): boolean },
  portraits: readonly (UiTexture | undefined)[],
): void {
  for (const texture of [...BATTLE_UI_PIECES.map(uiPiece), ...portraits]) {
    if (texture && !textures.exists(texture.key)) load.image(texture.key, texture.imageUrl);
  }
}

/** Texture keys to switch to linear filtering: HUD art is drawn at non-integer scales. */
export function battleUiTextureKeys(portraits: readonly (UiTexture | undefined)[]): string[] {
  return [
    ...BATTLE_UI_PIECES.map((name) => uiPiece(name).key),
    ...portraits.flatMap((texture) => (texture ? [texture.key] : [])),
  ];
}
