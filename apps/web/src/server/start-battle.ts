import "server-only";
import { redirect } from "next/navigation";
import { SIGN_IN_PATH } from "../lib/supabase/routes.ts";
import { createSupabaseServerClient } from "../lib/supabase/server.ts";

/** The squad slot battles use until squad selection per battle exists. */
const BATTLE_SQUAD_SLOT = 0;

/**
 * Starts a stage through `start_battle` (M3-04B) and redirects to the battle page, or back to
 * `returnPath` with a player-facing `?error=`. The RPC derives the player from `auth.uid()` and
 * re-checks the stage, its unlock, and the squad; it records a session with a server-rolled seed
 * and a snapshot of the player's first squad slot. Shared by the quest map and the Trials page.
 */
export async function startBattleSession(stageId: string, returnPath: string): Promise<never> {
  function back(message: string): never {
    redirect(`${returnPath}?${new URLSearchParams({ error: message }).toString()}`);
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) back("Battles are unavailable right now.");

  const { data, error } = await supabase.rpc("start_battle", {
    p_stage_id: stageId,
    p_squad_slot: BATTLE_SQUAD_SLOT,
  });
  if (error) {
    if (error.code === "42501") redirect(`${SIGN_IN_PATH}?next=${returnPath}`);
    // 22023 is start_battle's validation error; its message is written for players.
    const message =
      error.code === "22023"
        ? error.message.replace(/^start_battle: /, "")
        : "The battle could not be started.";
    back(message.charAt(0).toUpperCase() + message.slice(1));
  }
  const sessionId = (data as { id?: unknown } | null)?.id;
  if (typeof sessionId !== "string") back("The battle could not be started.");
  redirect(`/battle?session=${sessionId}`);
}
