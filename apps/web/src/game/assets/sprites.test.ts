import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SPRITE_FRAME_SIZE, SpriteSheetSchema } from "@bfr/data";
import type { HitLandedEvent } from "@bfr/engine";
import { step } from "@bfr/engine";
import { describe, expect, it } from "vitest";
import { createTestBattle } from "../playback/test-battle.ts";
import idleSheets from "./idle-sheets.json";
import {
  loadUnitIdleSheet,
  loadUnitSpriteSheet,
  TEST_ATTACK_TIMING,
  TEST_UNIT_SHEET,
  unitIdleSheet,
  unitIdleSprite,
} from "./sprites.ts";

describe("TEST_UNIT_SHEET", () => {
  it("reads the attack timing from the sheet's hit tags", () => {
    expect(TEST_ATTACK_TIMING).toEqual({ startDelayFrames: 20, hitFrames: [0, 10, 20] });
  });

  it("drives the engine's hit ticks in the test battle", () => {
    const state = createTestBattle(1);
    const { events } = step(state, [{ type: "attack", tick: 30, actor: "p0" }], { untilTick: 200 });
    const ticks = events
      .filter((e): e is HitLandedEvent => e.type === "HitLanded")
      .map((e) => e.tick);
    const { startDelayFrames, hitFrames } = TEST_ATTACK_TIMING;
    expect(ticks).toEqual(hitFrames.map((frame) => 30 + startDelayFrames + frame));
  });

  it("loads an idle-only sheet without attack timing", () => {
    const idle = { ...TEST_UNIT_SHEET.sheet.meta.frameTags[0], name: "idle", from: 0, to: 3 };
    const json = {
      ...TEST_UNIT_SHEET.sheet,
      meta: { ...TEST_UNIT_SHEET.sheet.meta, frameTags: [idle] },
    };
    const loaded = loadUnitSpriteSheet("idle-only", "/idle.png", json);
    expect(loaded.attackTiming).toBeUndefined();
    expect(TEST_UNIT_SHEET.attackTiming).toEqual(TEST_ATTACK_TIMING);
  });

  it("rejects a sheet that breaks the sprite spec", () => {
    expect(() => loadUnitSpriteSheet("bad", "/bad.png", { frames: {}, meta: {} })).toThrow();
  });
});

const UNITS_DIR = join(import.meta.dirname, "../../../public/assets/units");

/** Width and height from a PNG's IHDR chunk. */
function pngSize(file: string): { w: number; h: number } {
  const bytes = readFileSync(file);
  return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) };
}

describe("exported idle sheets (M6-05B)", () => {
  const listed = Object.entries(idleSheets).flatMap(([art, forms]) =>
    forms.map((form) => ({ art, form })),
  );

  it("lists Aurelle's Omni idle", () => {
    expect(listed).toContainEqual({ art: "aurelle", form: "omni" });
  });

  it.each(listed)("$art $form passes SpriteSheetSchema and matches its image", ({ art, form }) => {
    const json = JSON.parse(readFileSync(join(UNITS_DIR, art, `battle-${form}.json`), "utf8"));
    const sheet = SpriteSheetSchema.parse(json);
    expect(sheet.meta.image).toBe(`battle-${form}.png`);
    expect(sheet.meta.frameTags.find((tag) => tag.name === "idle")).toBeDefined();
    expect(pngSize(join(UNITS_DIR, art, sheet.meta.image))).toEqual(sheet.meta.size);
    expect(sheet.meta.size).toEqual({
      w: Object.keys(sheet.frames).length * SPRITE_FRAME_SIZE,
      h: SPRITE_FRAME_SIZE,
    });
    // The still sprite stays exported for everything else that shows the form.
    expect(existsSync(join(UNITS_DIR, art, `battle-idle-${form}.png`))).toBe(true);
    const files = unitIdleSheet(art, form);
    expect(files?.jsonUrl).toBe(`/assets/units/${art}/battle-${form}.json`);
    expect(files && loadUnitIdleSheet(files, json).attackTiming).toBeUndefined();
  });

  it("lists every exported sheet in the index", () => {
    const onDisk = readdirSync(UNITS_DIR).flatMap((art) =>
      readdirSync(join(UNITS_DIR, art))
        .map((name) => /^battle-(?!idle-)(.+)\.json$/.exec(name)?.[1])
        .filter((form): form is string => form !== undefined)
        .map((form) => ({ art, form })),
    );
    expect(onDisk.sort((a, b) => `${a.art}${a.form}`.localeCompare(`${b.art}${b.form}`))).toEqual(
      [...listed].sort((a, b) => `${a.art}${a.form}`.localeCompare(`${b.art}${b.form}`)),
    );
  });

  it("leaves forms without a sheet on their still sprite", () => {
    // No unit has an 8★ form, so it is never listed in idle-sheets.json.
    expect(unitIdleSheet("brand", "8star")).toBeUndefined();
    expect(unitIdleSheet("aurelle", "8star")).toBeUndefined();
    expect(unitIdleSprite("brand", "8star").imageUrl).toBe(
      "/assets/units/brand/battle-idle-8star.png",
    );
  });
});
