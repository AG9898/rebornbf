"use server";

import { redirect } from "next/navigation";
import { storyStage } from "../../../lib/battle/session-battle.ts";
import { SIGN_IN_PATH } from "../../../lib/supabase/routes.ts";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";

/** The squad slot story battles use until squad selection per battle exists. */
const BATTLE_SQUAD_SLOT = 0;

function backWithError(message: string): never {
  redirect(`/quests?${new URLSearchParams({ error: message }).toString()}`);
}

/**
 * Starts a story stage (M3-04B): `start_battle` records a session with a server-rolled seed and a
 * snapshot of the player's first squad slot, and the battle page plays it. The RPC derives the
 * player from `auth.uid()` and re-checks the stage, its unlock, and the squad.
 */
export async function startStage(stageId: string): Promise<void> {
  if (!storyStage(stageId)) backWithError("Unknown stage.");
  const supabase = await createSupabaseServerClient();
  if (!supabase) backWithError("Story battles are unavailable right now.");

  const { data, error } = await supabase.rpc("start_battle", {
    p_stage_id: stageId,
    p_squad_slot: BATTLE_SQUAD_SLOT,
  });
  if (error) {
    if (error.code === "42501") redirect(`${SIGN_IN_PATH}?next=/quests`);
    // 22023 is start_battle's validation error; its message is written for players.
    const message =
      error.code === "22023"
        ? error.message.replace(/^start_battle: /, "")
        : "The battle could not be started.";
    backWithError(message.charAt(0).toUpperCase() + message.slice(1));
  }
  const sessionId = (data as { id?: unknown } | null)?.id;
  if (typeof sessionId !== "string") backWithError("The battle could not be started.");
  redirect(`/battle?session=${sessionId}`);
}
