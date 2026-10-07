import { describe, expect, it } from "vitest";
import { STORY_STAGES } from "../../lib/quests/quest-map.ts";
import { seriesName, stageNames } from "./stage-names.ts";

describe("stageNames", () => {
  it("names story stages by chapter", () => {
    const first = STORY_STAGES[0];
    const ninth = STORY_STAGES[8];
    if (!first || !ninth) throw new Error("story stages missing");
    expect(stageNames(first)).toEqual({ area: "The Ember Road", stage: first.name });
    expect(stageNames(ninth).area).toBe("The Saltglass Coast");
  });

  it("names dungeon stages by series", () => {
    const stage = { name: "Cinder Sprite Den", dungeon: { series: "sprite", gate: "x" } };
    expect(stageNames(stage)).toEqual({ area: "Sprite Dungeon", stage: "Cinder Sprite Den" });
    expect(seriesName("prism-cairn")).toBe("Prism Cairn Dungeon");
    expect(seriesName("items")).toBe("Item Dungeon");
    expect(seriesName("zenith-core")).toBe("Zenith Core Dungeon");
    expect(seriesName("unknown")).toBe("Dungeon");
  });

  it("names trials, and any other stage by its own title", () => {
    const trial = { name: "Trial 1: Captain Locke", trial: { number: 1, gate: "x" } };
    expect(stageNames(trial)).toEqual({ area: "Trial", stage: "Trial 1: Captain Locke" });
    expect(stageNames({ name: "Training Grounds" })).toEqual({
      area: "Training Grounds",
      stage: "Training Grounds",
    });
  });
});
