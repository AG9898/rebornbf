import { type Stage, StageSchema } from "@bfr/data";
import trial01 from "@bfr/data/content/stages/trial-01-captain-locke.json";
import trial02 from "@bfr/data/content/stages/trial-02-master-ozric.json";
import { STORY_STAGES, type StageState } from "./quest-map.ts";

/**
 * The Trials page (M6-01A_1): the trial stages from `@bfr/data` with each one's state from the
 * player's `quest_progress` rows. A trial opens on its gate story stage's first clear (GAME_DESIGN
 * §7 → Trials), the same check `start_battle` makes. Pure, so the page stays thin.
 */

export type TrialView = {
  id: string;
  number: number;
  name: string;
  waves: number;
  text: string;
  /** The gate story stage's number and name, for the locked hint. */
  gateNumber: number;
  gateName: string;
  state: StageState;
};

/** Every trial stage in trial order. */
export const TRIAL_STAGES: readonly Stage[] = [trial01, trial02]
  .map((json) => StageSchema.parse(json))
  .filter((stage) => stage.trial !== undefined)
  .sort((a, b) => (a.trial?.number ?? 0) - (b.trial?.number ?? 0));

export function trialStage(stageId: string): Stage | undefined {
  return TRIAL_STAGES.find((stage) => stage.id === stageId);
}

/** Trials in order: `cleared` after a first clear, `open` once the gate is cleared, else `locked`. */
export function buildTrialList(
  cleared: ReadonlySet<string>,
  trials: readonly Stage[] = TRIAL_STAGES,
): TrialView[] {
  return trials.flatMap((stage) => {
    const trial = stage.trial;
    if (!trial) return [];
    const gate = STORY_STAGES.find((s) => s.id === trial.gate);
    const state: StageState = cleared.has(stage.id)
      ? "cleared"
      : cleared.has(trial.gate)
        ? "open"
        : "locked";
    return [
      {
        id: stage.id,
        number: trial.number,
        name: stage.name,
        waves: stage.waves.length,
        text:
          state === "locked"
            ? `Clear story stage ${gate?.story?.number ?? 0}, ${gate?.name ?? trial.gate}, to open.`
            : "Guard the boss's telegraphed attacks and time your bursts. No continues.",
        gateNumber: gate?.story?.number ?? 0,
        gateName: gate?.name ?? trial.gate,
        state,
      },
    ];
  });
}

/** The Proving Lab, where the trial list lives (M6-01G, RESOLVED-95); `/trials` redirects here. */
export const TRIALS_LAB_PATH = "/conclave/lab";

/** Pell's lines in the Proving Lab, one per player state (BFR copy, M6-01G). */
export const PELL_LINES = {
  default: "Back again? My replicas haven't lost a wink of sleep over you.",
  newTrial: "Fresh off the workbench! Bring all three squads; you'll need every one of them.",
  firstClear:
    "You beat my replica?! …Fine. I'm already building the next one, and it won't be so polite.",
  allCleared: "Still preparing the next trial! Go train. You'll want the practice.",
  nothingOpen: "Not yet. Come back once you've cleared more of the Vale.",
} as const;

export type PellLine = keyof typeof PELL_LINES;

/**
 * Which line Pell says: the default when progress is unknown (signed out or a failed read);
 * otherwise "nothing open" before any trial opens, "new trial" while an uncleared trial is open,
 * "all cleared" once every trial is cleared, and "first clear" when some are cleared and the
 * rest are still locked (the next replica is being built).
 */
export function pellLine(trials: readonly TrialView[], progressKnown: boolean): PellLine {
  if (!progressKnown) return "default";
  if (trials.length === 0 || trials.every((trial) => trial.state === "locked"))
    return "nothingOpen";
  if (trials.some((trial) => trial.state === "open")) return "newTrial";
  if (trials.every((trial) => trial.state === "cleared")) return "allCleared";
  return "firstClear";
}
