"use server";

import { redirect } from "next/navigation";
import { storyStage } from "../../../lib/battle/session-battle.ts";
import { startBattleSession } from "../../../server/start-battle.ts";

/**
 * Starts a story stage (M3-04B): `start_battle` records a session with a server-rolled seed and a
 * snapshot of the player's first squad slot, and the battle page plays it.
 */
export async function startStage(stageId: string): Promise<void> {
  if (!storyStage(stageId)) {
    redirect(`/quests?${new URLSearchParams({ error: "Unknown stage." }).toString()}`);
  }
  await startBattleSession(stageId, "/quests");
}
