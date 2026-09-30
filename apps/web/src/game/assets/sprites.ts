import {
  attackTimingFromSheet,
  type SheetAttackTiming,
  type SpriteSheet,
  SpriteSheetSchema,
} from "@bfr/data";
import idleSheets from "./idle-sheets.json";
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

/**
 * Unit forms with an exported idle sheet (`art/tools/bfr_anim.py bake <id> <form> --web` writes the
 * sheet and this index), by art id.
 */
const IDLE_SHEETS: Readonly<Record<string, readonly string[]>> = idleSheets;

/** Where a baked idle sheet lives: the Phaser loader reads its image and json-hash JSON. */
export interface UnitIdleSheetFiles {
  readonly key: string;
  readonly imageUrl: string;
  readonly jsonUrl: string;
}

/**
 * The exported idle sheet of a unit form (`battle-<form>.png` + `.json`, next to the still
 * `battle-idle-<form>.png`), or `undefined` when the form has only its still sprite.
 */
export function unitIdleSheet(artId: string, form = "6star"): UnitIdleSheetFiles | undefined {
  if (!IDLE_SHEETS[artId]?.includes(form)) return undefined;
  const base = `/assets/units/${artId}/battle-${form}`;
  return { key: `sheet-${artId}-${form}`, imageUrl: `${base}.png`, jsonUrl: `${base}.json` };
}

/**
 * Parses a loaded idle sheet for the battle scene. Exported sheets only loop `idle`: unit data
 * holds the engine's attack timing, so any `attack` tag is left unused and the unit lunges.
 */
export function loadUnitIdleSheet(files: UnitIdleSheetFiles, json: unknown): UnitSpriteSheet {
  return { key: files.key, imageUrl: files.imageUrl, sheet: SpriteSheetSchema.parse(json) };
}
