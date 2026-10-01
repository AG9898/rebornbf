import { type Stage, StageSchema } from "@bfr/data";
import trial01 from "@bfr/data/content/stages/trial-01-captain-locke.json";
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
  /** The gate story stage's number and name, for the locked hint. */
  gateNumber: number;
  gateName: string;
  state: StageState;
};

/** Every trial stage in trial order. */
export const TRIAL_STAGES: readonly Stage[] = [trial01]
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
        gateNumber: gate?.story?.number ?? 0,
        gateName: gate?.name ?? trial.gate,
        state,
      },
    ];
  });
}
