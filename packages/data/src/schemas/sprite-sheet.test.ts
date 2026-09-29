import { describe, expect, it } from "vitest";
import {
  attackTimingFromSheet,
  msToTicks,
  SPRITE_FRAME_SIZE,
  type SpriteSheet,
  SpriteSheetSchema,
} from "./sprite-sheet.ts";

const SIZE = SPRITE_FRAME_SIZE;

/** A json-hash sheet with one frame per duration and the given tags. */
function sheet(durations: number[], tags: { name: string; from: number; to: number }[]) {
  const frames: Record<string, unknown> = {};
  durations.forEach((duration, i) => {
    frames[`unit ${i}.aseprite`] = {
      frame: { x: i * SIZE, y: 0, w: SIZE, h: SIZE },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: SIZE, h: SIZE },
      sourceSize: { w: SIZE, h: SIZE },
      duration,
    };
  });
  return {
    frames,
    meta: {
      app: "https://www.aseprite.org/",
      image: "unit.png",
      size: { w: SIZE * durations.length, h: SIZE },
      frameTags: tags.map((tag) => ({ ...tag, direction: "forward" })),
    },
  };
}

// idle 0–1, attack 2–7 with hits on frames 4, 5, and twice on 7.
const VALID = sheet(
  [100, 100, 100, 100, 50, 200, 100, 100],
  [
    { name: "idle", from: 0, to: 1 },
    { name: "attack", from: 2, to: 7 },
    { name: "hit", from: 4, to: 4 },
    { name: "hit", from: 7, to: 7 },
    { name: "hit", from: 5, to: 5 },
    { name: "hit", from: 7, to: 7 },
  ],
);

describe("SpriteSheetSchema", () => {
  it("accepts an Aseprite json-hash export", () => {
    expect(SpriteSheetSchema.safeParse(VALID).success).toBe(true);
  });

  it("rejects frames off the fixed canvas", () => {
    const bad = sheet(
      [100],
      [
        { name: "idle", from: 0, to: 0 },
        { name: "attack", from: 0, to: 0 },
      ],
    );
    const frame = bad.frames["unit 0.aseprite"] as { sourceSize: { w: number; h: number } };
    frame.sourceSize = { w: 96, h: 96 };
    const result = SpriteSheetSchema.safeParse(bad);
    expect(result.error?.issues.map((i) => i.message)).toEqual([
      `must be ${SIZE}×${SIZE} (got 96×96)`,
    ]);
  });

  it("accepts an idle-only sheet", () => {
    const idleOnly = sheet([125, 125, 125, 125], [{ name: "idle", from: 0, to: 3 }]);
    expect(SpriteSheetSchema.safeParse(idleOnly).success).toBe(true);
  });

  it("rejects missing animations and tags outside the frames", () => {
    const bad = sheet([100, 100], [{ name: "attack", from: 1, to: 2 }]);
    const messages = SpriteSheetSchema.safeParse(bad).error?.issues.map((i) => i.message);
    expect(messages).toEqual([
      "frames 1–2 are outside the sheet's 2 frames",
      'is missing the "idle" animation tag',
    ]);
  });
});

describe("msToTicks", () => {
  it.each([
    [0, 0],
    [100, 6],
    [333, 20],
    [500, 30],
    [667, 40],
    [25, 2], // 1.5 ticks rounds half up
  ])("%i ms is %i ticks", (ms, ticks) => {
    expect(msToTicks(ms)).toBe(ticks);
  });
});

describe("attackTimingFromSheet", () => {
  it("maps hit tags to a start delay and hit offsets from the attack start", () => {
    const parsed: SpriteSheet = SpriteSheetSchema.parse(VALID);
    // Frame 4 starts 200 ms (12 ticks) in, frame 5 at 250 ms (15), frame 7 at 550 ms (33).
    expect(attackTimingFromSheet(parsed, "attack")).toEqual({
      startDelayFrames: 12,
      hitFrames: [0, 3, 21, 21],
    });
  });

  it("ignores hit tags outside the animation", () => {
    const withIdleHit = sheet(
      [100, 100, 100],
      [
        { name: "idle", from: 0, to: 0 },
        { name: "hit", from: 0, to: 0 },
        { name: "attack", from: 1, to: 2 },
        { name: "hit", from: 2, to: 2 },
      ],
    );
    expect(attackTimingFromSheet(SpriteSheetSchema.parse(withIdleHit), "attack")).toEqual({
      startDelayFrames: 6,
      hitFrames: [0],
    });
  });

  it("fails without the animation or its hit tags", () => {
    const parsed = SpriteSheetSchema.parse(
      sheet(
        [100],
        [
          { name: "idle", from: 0, to: 0 },
          { name: "attack", from: 0, to: 0 },
        ],
      ),
    );
    expect(() => attackTimingFromSheet(parsed, "bb")).toThrow('no "bb" tag');
    expect(() => attackTimingFromSheet(parsed, "attack")).toThrow('no "hit" tags');
  });
});
