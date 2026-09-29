"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { HOME_PATH, ONBOARDING_PATHS } from "../../../lib/onboarding/routing.ts";
import { isStarterUnitId } from "../../../lib/onboarding/starters.ts";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";

/**
 * Picks the player's starter through `pick_starter` (M3-05A) as the signed-in player, then lands on
 * home. The RPC derives the player from `auth.uid()`, grants the unit at 3★ only at the `starter`
 * step, saves it alone as squad slot 0's leader, and ends onboarding. Returns an error message on
 * failure; on success it redirects and never returns.
 */
export async function pickStarter(unitId: string): Promise<string | null> {
  if (!isStarterUnitId(unitId)) return "Choose one of the six heroes.";

  const supabase = await createSupabaseServerClient();
  if (!supabase) return "Saving is unavailable right now.";

  const { error } = await supabase.rpc("pick_starter", { p_unit_id: unitId });
  if (error) {
    // 55000: the pick is no longer open (already picked, e.g. in another tab); the page redirects.
    if (error.code === "55000") {
      revalidatePath("/", "layout");
      redirect(ONBOARDING_PATHS.starter);
    }
    return "Your hero could not be saved. Try again.";
  }

  revalidatePath("/", "layout");
  redirect(HOME_PATH);
}
