import {
  attackTimingFromSheet,
  type SheetAttackTiming,
  type SpriteSheet,
  SpriteSheetSchema,
} from "@bfr/data";
import testBrandSheet from "./test-brand-sheet.json";

/** A unit sprite sheet ready for the Phaser loader: texture key, image URL, and parsed JSON. */
export interface UnitSpriteSheet {
  readonly key: string;
  readonly imageUrl: string;
  readonly sheet: SpriteSheet;
  /** Normal-attack timing read from the sheet's `attack` and `hit` tags; absent on idle-only sheets. */
  readonly attackTiming?: SheetAttackTiming;
}

/** Parses an Aseprite json-hash export, failing loudly when it breaks the sprite spec. */
export function loadUnitSpriteSheet(key: string, imageUrl: string, json: unknown): UnitSpriteSheet {
  const sheet = SpriteSheetSchema.parse(json);
  if (!sheet.meta.frameTags.some((tag) => tag.name === "attack")) return { key, imageUrl, sheet };
  return { key, imageUrl, sheet, attackTiming: attackTimingFromSheet(sheet, "attack") };
}

/**
 * The M2-03 test sheet (Brand's 6★ idle sprite offset into idle and attack frames, built by
 * `art/tools/make_test_sheet.py`). Its hit tags set the test battle's normal-attack timing.
 */
export const TEST_UNIT_SHEET: UnitSpriteSheet = loadUnitSpriteSheet(
  "test-brand",
  "/assets/sprites/test-brand-sheet.png",
  testBrandSheet,
);

/** The test sheet's normal-attack timing (it always has an `attack` tag). */
export const TEST_ATTACK_TIMING: SheetAttackTiming = attackTimingFromSheet(
  TEST_UNIT_SHEET.sheet,
  "attack",
);

/** A locked 128×128 idle sprite exported from `art/units/<id>/` (one frame, no animation). */
export interface UnitIdleSprite {
  readonly key: string;
  readonly imageUrl: string;
}

/** The exported idle sprite of a locked unit form (default 6★), e.g. `unitIdleSprite("maren")`. */
export function unitIdleSprite(artId: string, form = "6star"): UnitIdleSprite {
  return {
    key: `idle-${artId}-${form}`,
    imageUrl: `/assets/units/${artId}/battle-idle-${form}.png`,
  };
}
