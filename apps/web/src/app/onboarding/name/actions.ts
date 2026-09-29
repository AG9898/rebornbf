"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { displayNameProblem, normalizeDisplayName } from "../../../lib/onboarding/display-name.ts";
import { ONBOARDING_PATHS } from "../../../lib/onboarding/routing.ts";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";

export type SaveNameState = { error: string | null };

/**
 * Saves the display name through `set_display_name` (M3-06A) as the signed-in player, then moves
 * on to the tutorial step. The RPC derives the player from `auth.uid()`, re-validates the name,
 * and advances `name` → `tutorial`; this pre-check only keeps obviously bad names off the wire.
 */
export async function saveDisplayName(
  _previous: SaveNameState,
  formData: FormData,
): Promise<SaveNameState> {
  const raw = formData.get("name");
  const name = typeof raw === "string" ? raw : "";
  const problem = displayNameProblem(name);
  if (problem) return { error: problem };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Saving is unavailable right now." };

  const { error } = await supabase.rpc("set_display_name", {
    p_name: normalizeDisplayName(name),
  });
  if (error) {
    // 22023 is set_display_name's validation error; its message is written for players.
    if (error.code === "22023") {
      const message = error.message.replace(/^set_display_name: /, "");
      return { error: `${message.charAt(0).toUpperCase()}${message.slice(1)}.` };
    }
    return { error: "Your name could not be saved. Try again." };
  }

  // The status bar reads the name in the menu layout.
  revalidatePath("/", "layout");
  redirect(ONBOARDING_PATHS.tutorial);
}
