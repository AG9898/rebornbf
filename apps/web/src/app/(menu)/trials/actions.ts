"use server";

import { redirect } from "next/navigation";
import { trialStage } from "../../../lib/quests/trials.ts";
import { startBattleSession } from "../../../server/start-battle.ts";

/**
 * Starts a trial (M6-01A_1) through `start_battle`, which refuses it until its gate story stage
 * is cleared. The battle page plays the session with `trial: true`, so continues are refused.
 */
export async function startTrial(stageId: string): Promise<void> {
  if (!trialStage(stageId)) {
    redirect(`/trials?${new URLSearchParams({ error: "Unknown trial." }).toString()}`);
  }
  await startBattleSession(stageId, "/trials");
}
