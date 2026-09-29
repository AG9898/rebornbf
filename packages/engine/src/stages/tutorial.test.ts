import { readFileSync } from "node:fs";
import {
  type Enemy,
  EnemySchema,
  StageSchema,
  type Tutorial,
  type Unit,
  UnitSchema,
} from "@bfr/data";
import { describe, expect, it } from "vitest";
import type { BattleEvent } from "../events.ts";
import { createBattle } from "../state/create-battle.ts";
import type { BattleState } from "../state/types.ts";
import { playTurn } from "../turn.ts";
import { tutorialInputs, tutorialSetup } from "./tutorial.ts";

// Tutorial stage (M3-06D, RESOLVED-68): the preset squad (the six B0 starters at 3★ level 20)
// plays the stage's script, one step per turn, and wins on the last step, showing every lesson.

const CONTENT = new URL("../../../data/content/", import.meta.url);

function load(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, CONTENT), "utf8"));
}

const stage = StageSchema.parse(load("stages/tutorial.json"));
const tutorial: Tutorial = (() => {
  if (!stage.tutorial) throw new Error("stages/tutorial.json has no tutorial block");
  return stage.tutorial;
})();

const unit = (id: string): Unit => UnitSchema.parse(load(`units/${id}.json`));
const enemy = (id: string): Enemy => EnemySchema.parse(load(`enemies/${id}.json`));

/** Plays every script step as one turn; returns each step's events and the final state. */
function playScript(): { state: BattleState; turns: (readonly BattleEvent[])[] } {
  let state = createBattle(tutorialSetup(stage, unit, enemy), tutorial.seed);
  const turns: (readonly BattleEvent[])[] = [];
  for (const step of tutorial.script) {
    if (state.result !== undefined) break;
    const turn = playTurn(state, tutorialInputs(step, state.tick));
    turns.push(turn.events);
    state = turn.state;
  }
  return { state, turns };
}

describe("tutorial stage (M3-06D)", () => {
  it("fields the six B0 starters at 3★ level 20, leader first, the sixth as the ally", () => {
    const setup = tutorialSetup(stage, unit, enemy);
    expect(setup.squad.map((m) => m.formId)).toEqual([
      "brand-3",
      "maren-3",
      "rook-3",
      "garrick-3",
      "solen-3",
    ]);
    expect(setup.ally?.formId).toBe("morrick-3");
    expect([...setup.squad, setup.ally].every((m) => m?.level === 20)).toBe(true);
    expect(setup.waves.map((wave) => wave.length)).toEqual([2, 2, 1]);
  });

  it("the scripted inputs win on the last step with no rejected action", () => {
    const { state, turns } = playScript();
    const log = turns.flat();
    expect(state.result).toBe("win");
    expect(turns).toHaveLength(tutorial.script.length);
    expect(log.some((e) => e.type === "ActionRejected")).toBe(false);
    expect(log.filter((e) => e.type === "WaveCleared").map((e) => e.wave)).toEqual([0, 1]);
  });

  it("each lesson's step shows its mechanic in the event log", () => {
    const { turns } = playScript();
    const stepEvents = (lesson: string): readonly BattleEvent[] =>
      tutorial.script.flatMap((step, i) => (step.lesson === lesson ? (turns[i] ?? []) : []));

    // Tap: every unit acts.
    expect(stepEvents("tap").filter((e) => e.type === "ActionStarted").length).toBeGreaterThan(5);
    // Spark: Brand (p0) and Garrick (p3) tap together and spark on the same enemy.
    const sparks = stepEvents("spark").filter((e) => e.type === "Sparked");
    expect(sparks.some((e) => e.actors.includes("p0") && e.actors.includes("p3"))).toBe(true);
    // Crystals: hits drop BC that fills the attackers' gauges.
    const crystals = stepEvents("crystals").filter((e) => e.type === "CrystalDropped");
    expect(crystals.some((e) => e.bc > 0 && e.bcGained > 0)).toBe(true);
    // Burst: charged units use their BB.
    const bursts = stepEvents("burst").filter((e) => e.type === "BurstUsed");
    expect(bursts.length).toBeGreaterThanOrEqual(3);
    expect(bursts.every((e) => e.tier === "bb")).toBe(true);
    // Guard: the guarded units brace as the Training Golem's Heavy Slam lands that turn.
    const guard = stepEvents("guard");
    expect(guard.filter((e) => e.type === "Guarded").map((e) => e.actor)).toEqual(["p1", "p3"]);
    expect(guard.some((e) => e.type === "EnemyActionStarted" && e.skill === "heavy-slam")).toBe(
      true,
    );
  });
});
