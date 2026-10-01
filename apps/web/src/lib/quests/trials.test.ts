import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STORY_STAGES } from "./quest-map.ts";
import { buildTrialList, TRIAL_STAGES, trialStage } from "./trials.ts";

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

  it("finds trials by ID and nothing else", () => {
    expect(trialStage("trial-01-captain-locke")?.trial?.number).toBe(1);
    expect(trialStage(storyIds[0] ?? "")).toBeUndefined();
  });
});
