"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ONBOARDING_PATHS } from "../../../lib/onboarding/routing.ts";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";

/**
 * Marks the tutorial step done through `finish_tutorial` (M3-06A) as the signed-in player, then
 * moves on to the starter pick. Skipping and winning both call it; the RPC derives the player from
 * `auth.uid()` and is idempotent past the tutorial step. Returns an error message on failure.
 */
export async function finishTutorial(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return "Saving is unavailable right now.";
  const { error } = await supabase.rpc("finish_tutorial");
  if (error) return "Your progress could not be saved. Try again.";
  revalidatePath("/", "layout");
  redirect(ONBOARDING_PATHS.starter);
}
