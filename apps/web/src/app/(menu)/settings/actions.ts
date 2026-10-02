"use server";

import { revalidatePath } from "next/cache";
import { autoSettingsArgs, battleSettingsArgs } from "../../../lib/settings/player-settings.ts";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";

export type SaveSettingsResult = { ok: true } | { ok: false; message: string };

/**
 * Saves the settings screen's fields (spark assist, default battle speed, reduced motion) through
 * `save_settings` (M7-01_1) as the signed-in player. Only these three arguments are sent, so the
 * RPC keeps the player's volumes and auto-battle settings. The next battle session freezes spark
 * assist; the battle page reads speed and reduced motion when it loads.
 */
export async function saveBattleSettings(draft: unknown): Promise<SaveSettingsResult> {
  const args = battleSettingsArgs(draft);
  if (!args) return { ok: false, message: "These settings are not valid." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Saving is unavailable right now." };

  const { error } = await supabase.rpc("save_settings", args);
  if (error) {
    return {
      ok: false,
      message:
        error.code === "42501" ? "Sign in to save settings." : "The settings could not be saved.",
    };
  }
  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Saves the auto-battle advanced settings (M7-01_3): the per-unit modes (the whole map, keyed by
 * owned unit id) and the SBB, Forced BB, and OD & UBB priority toggles. The next battle session
 * freezes them; a battle already started keeps the settings it was issued with.
 */
export async function saveAutoSettings(draft: unknown): Promise<SaveSettingsResult> {
  const args = autoSettingsArgs(draft);
  if (!args) return { ok: false, message: "These auto-battle settings are not valid." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Saving is unavailable right now." };

  const { error } = await supabase.rpc("save_settings", args);
  if (error) {
    return {
      ok: false,
      message:
        error.code === "42501"
          ? "Sign in to save settings."
          : error.code === "22023"
            ? "A unit is no longer yours. Reload the page and try again."
            : "The settings could not be saved.",
    };
  }
  revalidatePath("/settings");
  return { ok: true };
}
