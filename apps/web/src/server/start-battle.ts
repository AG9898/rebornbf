import "server-only";
import { redirect } from "next/navigation";
import type { LoadoutEntry } from "../lib/quests/item-loadout.ts";
import { SIGN_IN_PATH } from "../lib/supabase/routes.ts";
import { createSupabaseServerClient } from "../lib/supabase/server.ts";

/**
 * Starts a stage through `start_battle` (M3-04B) and redirects to the battle page, or back to
 * `returnPath` with a player-facing `?error=`. The RPC derives the player from `auth.uid()` and
 * re-checks the stage, its unlock, and the squad; it records a session with a server-rolled seed
 * and a snapshot of the chosen squad, per-run ally, and items for both story stages and trials.
 */
export async function startBattleSession(
  stageId: string,
  returnPath: string,
  squadSlot = 0,
  ally: string | null = null,
  items?: readonly LoadoutEntry[],
): Promise<never> {
  function back(message: string): never {
    const url = new URL(returnPath, "https://bfr.invalid");
    url.searchParams.set("error", message);
    redirect(`${url.pathname}${url.search}`);
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) back("Battles are unavailable right now.");

  const { data, error } = await supabase.rpc("start_battle", {
    p_stage_id: stageId,
    p_squad_slot: squadSlot,
    p_ally: ally,
    ...(items ? { p_items: items } : {}),
  });
  if (error) {
    if (error.code === "42501") redirect(`${SIGN_IN_PATH}?next=${encodeURIComponent(returnPath)}`);
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
