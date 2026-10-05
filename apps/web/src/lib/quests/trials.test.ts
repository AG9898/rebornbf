import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STORY_STAGES } from "./quest-map.ts";
import { buildTrialList, PELL_LINES, pellLine, TRIAL_STAGES, trialStage } from "./trials.ts";

const storyIds = STORY_STAGES.map((stage) => stage.id);

describe("trials list (M6-01A_1)", () => {
  it("bundles every trial stage file in @bfr/data", () => {
    const dir = new URL("../../../../../packages/data/content/stages/", import.meta.url);
    const files = readdirSync(dir).filter((name) => name.startsWith("trial-"));
    expect(TRIAL_STAGES.map((stage) => `${stage.id}.json`).sort()).toEqual(files.sort());
  });

  it("keeps Trial 1 locked until story stage 8 is cleared", () => {
    const [locked] = buildTrialList(new Set(storyIds.slice(0, 7)));
    expect(locked).toMatchObject({
      id: "trial-01-captain-locke",
      number: 1,
      gateNumber: 8,
      state: "locked",
    });
    expect(buildTrialList(new Set(storyIds.slice(0, 8)))[0]?.state).toBe("open");
    expect(
      buildTrialList(new Set([...storyIds.slice(0, 8), "trial-01-captain-locke"]))[0]?.state,
    ).toBe("cleared");
  });

  it("lists Trial 2 after Trial 1, locked until story stage 16 is cleared (M6-01B_2)", () => {
    expect(TRIAL_STAGES.map((stage) => stage.trial?.number)).toEqual([1, 2]);
    const second = (cleared: string[]) => buildTrialList(new Set(cleared))[1];
    expect(second(storyIds.slice(0, 15))).toMatchObject({
      id: "trial-02-master-ozric",
      number: 2,
      gateNumber: 16,
      state: "locked",
    });
    expect(second(storyIds.slice(0, 16))?.state).toBe("open");
  });

  it("finds trials by ID and nothing else", () => {
    expect(trialStage("trial-01-captain-locke")?.trial?.number).toBe(1);
    expect(trialStage(storyIds[0] ?? "")).toBeUndefined();
  });
});

describe("Pell's line in the Proving Lab (M6-01G)", () => {
  const line = (cleared: string[], known = true) =>
    pellLine(buildTrialList(new Set(cleared)), known);

  it("uses the default line when progress is unknown", () => {
    expect(line(storyIds, false)).toBe("default");
    expect(PELL_LINES.default).toContain("Back again?");
  });

  it("says nothing is open before chapter 1 is cleared", () => {
    expect(line([])).toBe("nothingOpen");
    expect(line(storyIds.slice(0, 7))).toBe("nothingOpen");
  });

  it("announces a new trial while an uncleared trial is open", () => {
    expect(line(storyIds.slice(0, 8))).toBe("newTrial");
    expect(line([...storyIds, "trial-01-captain-locke"])).toBe("newTrial");
  });

  it("grumbles after a first clear while the next trial is still locked", () => {
    expect(line([...storyIds.slice(0, 8), "trial-01-captain-locke"])).toBe("firstClear");
  });

  it("says the next trial is in the works once every trial is cleared", () => {
    expect(line([...storyIds, "trial-01-captain-locke", "trial-02-master-ozric"])).toBe(
      "allCleared",
    );
  });
});
