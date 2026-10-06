import type { Stage } from "@bfr/data";
import { describe, expect, it } from "vitest";
import {
  areaName,
  endingStage,
  questResultView,
  questReturn,
  resultSteps,
} from "./result-screen.ts";
import type { Submission } from "./submit-session.ts";

type Win = Extract<Submission, { ok: true }>;

const STORY: Pick<Stage, "name" | "story" | "trial"> = {
  name: "Mistfen Crossing",
  story: { chapter: 1, number: 2, text: "A crossing." },
};
const TRIAL: Pick<Stage, "name" | "story" | "trial"> = {
  name: "Captain Locke",
  trial: { number: 1, gate: "story-08" },
};
const OWNED = "e1a5119a-1583-4c5c-9cfa-d788330074d0";

function win(rewards: Partial<Win["rewards"]> = {}): Win {
  return { ok: true, turns: 4, rewards: { first_clear: false, gems: 0, zel: 120, ...rewards } };
}

describe("quest result view (M2-07H)", () => {
  it("names the quest and shows only the settled Zel, items, and captures", () => {
    const view = questResultView(
      STORY,
      win({
        items: [
          { itemId: "crown-shard", count: 2 },
          { itemId: "dew-tonic", count: 1 },
        ],
        captured: [{ unitId: "cinder-mote", formId: "cinder-mote-1", ownedUnitId: null }],
      }),
    );
    expect(view).toMatchObject({
      areaName: "The Ember Road",
      stageName: "Mistfen Crossing",
      zel: 120,
      gems: 0,
      firstClear: false,
      starter: null,
    });
    expect(view.materials).toEqual([
      { itemId: "crown-shard", name: "Crown Shard", count: 2, icon: "item-crown-shard" },
      { itemId: "dew-tonic", name: "Dew Tonic", count: 1, icon: "item-dew-tonic" },
    ]);
    expect(view.units).toEqual([
      {
        key: "capture-0",
        name: expect.any(String),
        element: "fire",
        thumb: "/assets/ui/cards/thumb/cinder-mote-1star.webp",
        count: 1,
        href: null,
      },
    ]);
    expect(resultSteps(view)).toEqual(["rewards"]);
  });

  it("leaves empty sections empty and never invents rewards", () => {
    const view = questResultView(STORY, win({ zel: 0 }));
    expect(view.materials).toEqual([]);
    expect(view.units).toEqual([]);
    expect(view.gems).toBe(0);
    expect(view.starter).toBeNull();
    expect(resultSteps(view)).toEqual(["rewards"]);
  });

  it("adds the starter reveal, first-clear units, and the gem bonus on a first clear", () => {
    const view = questResultView(
      STORY,
      win({
        first_clear: true,
        gems: 25,
        starter: {
          ownedUnitId: OWNED,
          unitId: "maren",
          formId: "maren-4",
          name: "Maren",
          rarity: 4,
        },
        units: [{ unitId: "lantern-toad", name: "Lantern Toad", count: 18 }],
      }),
    );
    expect(view.gems).toBe(25);
    expect(view.units.map((unit) => [unit.name, unit.count, unit.href])).toEqual([
      ["Lantern Toad", 18, null],
      ["Maren", 1, `/units/${OWNED}`],
    ]);
    expect(view.starter).toMatchObject({
      name: "Maren",
      rarity: 4,
      illustration: "/assets/units/maren/illustration-4star.png",
      quote: expect.stringContaining("Breathe"),
      href: `/units/${OWNED}`,
    });
    expect(resultSteps(view)).toEqual(["rewards", "starter", "bonus"]);
  });

  it("shows no gem bonus on a repeat clear even if the amount is non-zero", () => {
    const view = questResultView(STORY, win({ first_clear: false, gems: 25 }));
    expect(view.gems).toBe(0);
    expect(resultSteps(view)).toEqual(["rewards"]);
  });
});

describe("ending stage", () => {
  it("shows rewards only for a verified win", () => {
    expect(endingStage("pending", STORY)).toEqual({ kind: "verifying" });
    expect(endingStage({ ok: false, error: "This battle has expired." }, STORY)).toEqual({
      kind: "error",
      message: "This battle has expired.",
    });
    expect(endingStage(win(), STORY)).toMatchObject({ kind: "rewards", view: { zel: 120 } });
  });

  it("shows defeat for a lost battle, with no reward view", () => {
    expect(endingStage("lost", STORY)).toEqual({ kind: "defeat" });
  });
});

describe("return destination", () => {
  it("returns story stages to their chapter and trials to the Trials page", () => {
    expect(questReturn(STORY)).toEqual({ href: "/quests/1", label: "Back to quests" });
    expect(questReturn(TRIAL)).toEqual({ href: "/conclave/lab", label: "Back to Trials" });
    expect(areaName(TRIAL)).toBe("Trial 1");
    const dungeon = { dungeon: { series: "toads", gate: "trial-02-master-ozric" } };
    expect(questReturn(dungeon)).toEqual({ href: "/dungeons/toads", label: "Back to dungeons" });
    expect(areaName(dungeon)).toBe("Lantern Toad Grotto");
  });
});
