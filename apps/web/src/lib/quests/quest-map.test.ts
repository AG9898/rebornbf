import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildQuestMap, clearedStageIds, STORY_STAGES } from "./quest-map.ts";

const ids = STORY_STAGES.map((stage) => stage.id);

describe("quest map (M3-04A)", () => {
  it("lists chapter 1 with its eight stages in order, stage 8 the boss", () => {
    const [chapter, ...rest] = buildQuestMap(new Set());
    expect(rest).toEqual([]);
    expect(chapter?.number).toBe(1);
    expect(chapter?.title).toBe("The Ember Road");
    expect(chapter?.stages.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(chapter?.stages.filter((s) => s.boss).map((s) => s.number)).toEqual([8]);
  });

  it("bundles every story stage file in @bfr/data", () => {
    const dir = new URL("../../../../../packages/data/content/stages/", import.meta.url);
    const files = readdirSync(dir).filter((name) => name.startsWith("story-"));
    expect(ids.map((id) => `${id}.json`).sort()).toEqual(files.sort());
  });

  it("opens only stage 1 for a new player", () => {
    const [chapter] = buildQuestMap(new Set());
    expect(chapter?.stages.map((s) => s.state)).toEqual([
      "open",
      "locked",
      "locked",
      "locked",
      "locked",
      "locked",
      "locked",
      "locked",
    ]);
    expect(chapter?.cleared).toBe(0);
  });

  it("marks cleared stages from quest_progress and opens the next one", () => {
    const cleared = clearedStageIds([{ stage_id: ids[0] ?? "" }, { stage_id: ids[1] ?? "" }]);
    const [chapter] = buildQuestMap(cleared);
    expect(chapter?.stages.slice(0, 4).map((s) => s.state)).toEqual([
      "cleared",
      "cleared",
      "open",
      "locked",
    ]);
    expect(chapter?.cleared).toBe(2);
  });

  it("marks every stage cleared once the chapter is done, ignoring unknown IDs", () => {
    const cleared = clearedStageIds([...ids, "demo-stage"].map((stage_id) => ({ stage_id })));
    const [chapter] = buildQuestMap(cleared);
    expect(chapter?.stages.every((s) => s.state === "cleared")).toBe(true);
    expect(chapter?.cleared).toBe(8);
  });
});
