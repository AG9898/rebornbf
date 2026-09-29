import { type BattleEvent, createBattle, playTurn, tutorialInputs } from "@bfr/engine";
import { describe, expect, it } from "vitest";
import {
  advancePrompts,
  INITIAL_PROMPT_PROGRESS,
  type PromptProgress,
  performsLesson,
  promptsDone,
  tutorialPrompts,
} from "./prompts.ts";
import {
  TUTORIAL,
  TUTORIAL_BATTLE_SPEC,
  TUTORIAL_PROMPTS,
  TUTORIAL_SETUP,
} from "./tutorial-battle.ts";

// Tutorial prompt sequencer (M3-06E): one prompt per script step, each shown at a player turn's
// start and advanced only by its lesson's action.

const attack: BattleEvent = {
  type: "ActionStarted",
  tick: 10,
  actionId: 1,
  actor: "p0",
  action: "attack",
  target: "e0",
  hits: 3,
};
const burst: BattleEvent = {
  type: "BurstUsed",
  tick: 10,
  actionId: 2,
  actor: "p0",
  tier: "bb",
  gaugeBefore: 20,
  gaugeAfter: 0,
};
const guard: BattleEvent = { type: "Guarded", tick: 10, actor: "p1" };
const spark: BattleEvent = {
  type: "Sparked",
  tick: 20,
  target: "e0",
  hits: 2,
  actors: ["p0", "p3"],
};
const turn: BattleEvent = { type: "TurnStarted", tick: 300, turn: 2 };

describe("tutorial prompts (M3-06E)", () => {
  it("has one prompt per script step, in script order, with repeat text for repeated lessons", () => {
    expect(TUTORIAL_PROMPTS.map((p) => p.lesson)).toEqual(TUTORIAL.script.map((s) => s.lesson));
    const prompts = tutorialPrompts([{ lesson: "tap" }, { lesson: "burst" }, { lesson: "tap" }]);
    expect(prompts.map((p) => p.title)).toEqual(["Attack", "Brave Burst", "Keep attacking"]);
    for (const prompt of TUTORIAL_PROMPTS) expect(prompt.body.length).toBeGreaterThan(0);
  });

  it("matches each lesson to its action's event only", () => {
    expect(performsLesson("tap", attack)).toBe(true);
    expect(performsLesson("tap", { ...attack, action: "burst", tier: "bb" })).toBe(false);
    expect(performsLesson("burst", burst)).toBe(true);
    expect(performsLesson("burst", attack)).toBe(false);
    expect(performsLesson("guard", guard)).toBe(true);
    expect(performsLesson("spark", spark)).toBe(true);
    expect(performsLesson("spark", attack)).toBe(false);
    expect(performsLesson("crystals", guard)).toBe(false);
  });

  it("stays on a prompt until its action, then shows the next at the next turn", () => {
    const prompts = tutorialPrompts([{ lesson: "guard" }, { lesson: "burst" }]);
    let progress: PromptProgress = INITIAL_PROMPT_PROGRESS;
    progress = advancePrompts(progress, prompts, [attack, turn]);
    expect(progress).toEqual({ index: 0, shown: true });
    progress = advancePrompts(progress, prompts, [guard]);
    expect(progress).toEqual({ index: 1, shown: false });
    // The next lesson's action before its prompt shows does not count.
    progress = advancePrompts(progress, prompts, [burst]);
    expect(progress).toEqual({ index: 1, shown: false });
    progress = advancePrompts(progress, prompts, [turn]);
    expect(progress).toEqual({ index: 1, shown: true });
    progress = advancePrompts(progress, prompts, [burst]);
    expect(promptsDone(progress, prompts.length)).toBe(true);
    expect(advancePrompts(progress, prompts, [turn, burst])).toBe(progress);
  });

  it("advances at most one prompt per player turn, even with both actions in one batch", () => {
    const prompts = tutorialPrompts([{ lesson: "tap" }, { lesson: "tap" }]);
    expect(advancePrompts(INITIAL_PROMPT_PROGRESS, prompts, [attack, attack])).toEqual({
      index: 1,
      shown: false,
    });
    expect(advancePrompts(INITIAL_PROMPT_PROGRESS, prompts, [attack, turn, attack])).toEqual({
      index: 2,
      shown: false,
    });
  });

  it("the scripted run performs every prompt in order and wins", () => {
    let state = createBattle(TUTORIAL_SETUP, TUTORIAL.seed);
    let progress = INITIAL_PROMPT_PROGRESS;
    const indexAfterTurn: number[] = [];
    for (const step of TUTORIAL.script) {
      const result = playTurn(state, tutorialInputs(step, state.tick));
      state = result.state;
      progress = advancePrompts(progress, TUTORIAL_PROMPTS, result.events);
      indexAfterTurn.push(progress.index);
    }
    expect(state.result).toBe("win");
    expect(indexAfterTurn).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(promptsDone(progress, TUTORIAL_PROMPTS.length)).toBe(true);
  });

  it("plays one run at the stored seed with the tutorial-rarity art", () => {
    expect(TUTORIAL_BATTLE_SPEC.singleRun).toBe(true);
    expect(TUTORIAL_BATTLE_SPEC.seed).toBe(TUTORIAL.seed);
    expect(TUTORIAL_BATTLE_SPEC.partyArt).toEqual([...TUTORIAL.units, TUTORIAL.ally]);
    expect(TUTORIAL_BATTLE_SPEC.partyArtForms?.every((form) => form === "3star")).toBe(true);
    expect(TUTORIAL_BATTLE_SPEC.create(99).tick).toBe(createBattle(TUTORIAL_SETUP, 1).tick);
  });
});
