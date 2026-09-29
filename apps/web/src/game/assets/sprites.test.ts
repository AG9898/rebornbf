import type { HitLandedEvent } from "@bfr/engine";
import { step } from "@bfr/engine";
import { describe, expect, it } from "vitest";
import { createTestBattle } from "../playback/test-battle.ts";
import { loadUnitSpriteSheet, TEST_ATTACK_TIMING, TEST_UNIT_SHEET } from "./sprites.ts";

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
