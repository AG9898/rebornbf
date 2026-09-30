import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildQuestMap, clearedStageIds, STORY_STAGES } from "./quest-map.ts";

const ids = STORY_STAGES.map((stage) => stage.id);

describe("quest map (M3-04A)", () => {
  it("lists chapter 1 with its eight stages in order, stage 8 the boss", () => {
    const [chapter, ...rest] = buildQuestMap(new Set());
    expect(rest.map((c) => c.number)).toEqual([2]);
    expect(chapter?.number).toBe(1);
    expect(chapter?.title).toBe("The Ember Road");
    expect(chapter?.stages.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(chapter?.stages.filter((s) => s.boss).map((s) => s.number)).toEqual([8]);
  });

  it("chapter 2 stays locked until stage 8, then opens in story order", () => {
    const before = buildQuestMap(new Set(ids.slice(0, 7)))[1];
    expect(before?.stages.every((s) => s.state === "locked")).toBe(true);
    const after = buildQuestMap(new Set(ids.slice(0, 8)))[1];
    expect(after?.title).toBe("The Saltglass Coast");
    expect(after?.stages.map((s) => s.number)).toEqual([9, 10, 11, 12, 13, 14, 15, 16]);
    expect(after?.stages.map((s) => s.state)).toEqual(["open", ...Array(7).fill("locked")]);
    expect(after?.stages.filter((s) => s.boss).map((s) => s.number)).toEqual([16]);
    const next = buildQuestMap(new Set(ids.slice(0, 9)))[1];
    expect(next?.stages.slice(0, 3).map((s) => s.state)).toEqual(["cleared", "open", "locked"]);
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
