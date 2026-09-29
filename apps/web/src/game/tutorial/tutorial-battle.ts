import { type Enemy, EnemySchema, type Stage, StageSchema, type Tutorial } from "@bfr/data";
import puddleImp from "@bfr/data/content/enemies/tut-puddle-imp.json";
import thistleSprout from "@bfr/data/content/enemies/tut-thistle-sprout.json";
import trainingGolem from "@bfr/data/content/enemies/tut-training-golem.json";
import tutorialStage from "@bfr/data/content/stages/tutorial.json";
import { type BattleSetup, createBattle, tutorialSetup } from "@bfr/engine";
import { formArtFile, unitContent } from "../../lib/units/owned-units.ts";
import { stageBackground, stageEnemyArt } from "../assets/stage-art.ts";
import type { BattleSpec } from "../playback/battle-scene.ts";
import { stageBossWaves } from "../playback/cues.ts";
import { tutorialPrompts } from "./prompts.ts";

/**
 * The tutorial battle (M3-06E, RESOLVED-68): the tutorial stage (M3-06D, *Training Grounds*) with
 * its preset squad and seed, played client-side like the demo battle. It grants nothing, so there
 * is no battle session or replay.
 */

export const TUTORIAL_STAGE: Stage = StageSchema.parse(tutorialStage);

export const TUTORIAL: Tutorial = (() => {
  if (!TUTORIAL_STAGE.tutorial) throw new Error("stages/tutorial.json has no tutorial block");
  return TUTORIAL_STAGE.tutorial;
})();

const ENEMIES: ReadonlyMap<string, Enemy> = new Map(
  [thistleSprout, puddleImp, trainingGolem].map((json) => {
    const enemy = EnemySchema.parse(json);
    return [enemy.id, enemy];
  }),
);

export const TUTORIAL_SETUP: BattleSetup = tutorialSetup(TUTORIAL_STAGE, unitContent, (id) =>
  ENEMIES.get(id),
);

/** Party slots in party order (squad, then the ally), each wearing its tutorial-rarity art. */
const PARTY = [...TUTORIAL.units, ...(TUTORIAL.ally ? [TUTORIAL.ally] : [])];

/** The prompts, one per script step. */
export const TUTORIAL_PROMPTS = tutorialPrompts(TUTORIAL.script);

/**
 * The tutorial as the battle scene plays it: always the stored seed (the script is tuned to it),
 * one run per mount, so the page restarts it after a loss.
 */
export const TUTORIAL_BATTLE_SPEC: BattleSpec = {
  title: TUTORIAL_STAGE.name.toUpperCase(),
  create: () => createBattle(TUTORIAL_SETUP, TUTORIAL.seed),
  partyArt: PARTY.map((id) => (formArtFile(id, TUTORIAL.rarity) ? id : "")),
  partyArtForms: PARTY.map((id) => formArtFile(id, TUTORIAL.rarity) ?? undefined),
  bossWaves: stageBossWaves(TUTORIAL_STAGE),
  background: stageBackground(TUTORIAL_STAGE),
  enemyWaves: stageEnemyArt(TUTORIAL_STAGE),
  seed: TUTORIAL.seed,
  singleRun: true,
};
