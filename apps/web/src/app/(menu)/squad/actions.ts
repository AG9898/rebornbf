"use server";

import { revalidatePath } from "next/cache";
import { draftProblem, SQUAD_SLOTS, type SquadDraft } from "../../../lib/squad/squad-editor.ts";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";

export type SaveSquadResult = { ok: true } | { ok: false; message: string };

/**
 * Saves a squad through the `save_squad` RPC (M3-03B) as the signed-in player. The RPC derives the
 * player from `auth.uid()` and re-checks size, ownership, and leader; this only pre-checks
 * shape so obviously bad drafts never reach the database.
 */
export async function saveSquad(slot: number, draft: SquadDraft): Promise<SaveSquadResult> {
  if (!Number.isInteger(slot) || slot < 0 || slot >= SQUAD_SLOTS) {
    return { ok: false, message: "Unknown squad slot." };
  }
  const problem = draftProblem(draft);
  if (problem) return { ok: false, message: problem };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Saving is unavailable right now." };

  const { error } = await supabase.rpc("save_squad", {
    p_slot: slot,
    p_unit_ids: draft.unitIds,
    p_leader_index: draft.leaderIndex,
  });
  if (error) {
    // 22023 is save_squad's validation error; its message is written for players.
    const message =
      error.code === "22023"
        ? error.message.replace(/^save_squad: /, "")
        : "The squad could not be saved.";
    return { ok: false, message: message.charAt(0).toUpperCase() + message.slice(1) };
  }

  revalidatePath("/squad");
  return { ok: true };
}
