import { describe, expect, it } from "vitest";
import {
  BATTLE_HEIGHT,
  BATTLE_WIDTH,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  canvasDisplaySize,
} from "./bridge.ts";
import {
  enemyRect,
  hitRegions,
  OD_BUTTON,
  unitCardRect,
  unitSpriteRect,
} from "./playback/layout.ts";
import { createTestBattle } from "./playback/test-battle.ts";

describe("battle canvas (RESOLVED-40)", () => {
  it("is a 640×1136 grid drawn on a 1280×2272 canvas", () => {
    expect([BATTLE_WIDTH, BATTLE_HEIGHT]).toEqual([640, 1136]);
    expect([CANVAS_WIDTH, CANVAS_HEIGHT]).toEqual([1280, 2272]);
  });

  it("fits a phone viewport as a 9:16 column, shrinking the 2× canvas", () => {
    // 390×796 CSS px stage at DPR 3: width-limited, 1170 device px wide (< 1280).
    const size = canvasDisplaySize(390, 796, 3);
    expect(size.width).toBeCloseTo(390);
    expect(size.height).toBeCloseTo((390 * 1136) / 640);
  });

  it("fits a wide desktop viewport by height, leaving the sides for the backdrop", () => {
    const size = canvasDisplaySize(1920, 1032, 1);
    expect(size.height).toBeCloseTo(1032);
    expect(size.width).toBeCloseTo((1032 * 640) / 1136);
  });

  it("is never displayed larger than 1280×2272 device pixels", () => {
    for (const dpr of [1, 1.5, 2, 3]) {
      const size = canvasDisplaySize(5000, 9000, dpr);
      expect(size.width * dpr).toBeCloseTo(CANVAS_WIDTH);
      expect(size.height * dpr).toBeCloseTo(CANVAS_HEIGHT);
    }
  });

  it("keeps every placeholder layout rectangle and touch region on the grid", () => {
    const rects = [
      ...[0, 1, 2].map(enemyRect),
      ...[0, 1, 2, 3, 4, 5].flatMap((i) => [unitSpriteRect(i), unitCardRect(i)]),
      OD_BUTTON,
      ...hitRegions(createTestBattle(1)),
    ];
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(BATTLE_WIDTH);
      expect(r.y + r.height).toBeLessThanOrEqual(BATTLE_HEIGHT);
    }
  });
});
