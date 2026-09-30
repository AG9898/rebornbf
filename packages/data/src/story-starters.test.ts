import { describe, expect, it } from "vitest";
import { loadContent } from "../scripts/content-seed.ts";
import { StageSchema } from "./schemas/stage.ts";

describe("story starter rewards", () => {
  it("schedules only stages 2/4/6/8/10 at 3/4/5/6/7 stars", () => {
    const grants = loadContent()
      .filter((item) => item.kind === "stage")
      .map((item) => StageSchema.parse(item.data))
      .filter((stage) => stage.firstClear?.starter)
      .sort((a, b) => (a.story?.number ?? 0) - (b.story?.number ?? 0));
    expect(grants.map((stage) => [stage.story?.number, stage.firstClear?.starter])).toEqual([
      [2, { ordinal: 1, rarity: 3 }],
      [4, { ordinal: 2, rarity: 4 }],
      [6, { ordinal: 3, rarity: 5 }],
      [8, { ordinal: 4, rarity: 6 }],
      [10, { ordinal: 5, rarity: 7 }],
    ]);
  });

  it("rejects a starter outside the five reward slots, invalid rarity, or non-story stage", () => {
    const base = { id: "test", name: "Test", waves: [{ enemies: [{ enemy: "enemy" }] }] };
    const story = { chapter: 1, number: 2, text: "Test" };
    for (const starter of [
      { ordinal: 0, rarity: 3 },
      { ordinal: 6, rarity: 3 },
      { ordinal: 1, rarity: 8 },
    ]) {
      expect(
        StageSchema.safeParse({ ...base, story, firstClear: { gems: 0, starter } }).success,
      ).toBe(false);
    }
    expect(
      StageSchema.safeParse({
        ...base,
        firstClear: { gems: 0, starter: { ordinal: 1, rarity: 3 } },
      }).success,
    ).toBe(false);
  });
});
