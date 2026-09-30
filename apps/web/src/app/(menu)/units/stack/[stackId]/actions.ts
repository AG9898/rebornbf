"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server.ts";
import { isOwnedUnitId } from "../../../../../lib/units/owned-units.ts";

export type SplitResult = { ok: true; unitId: string } | { ok: false; message: string };

/**
 * Moves one copy out of a stack into an ordinary `owned_units` row through the
 * `split_unit_stack` RPC (M4-05A) as the signed-in player (M4-05C). The RPC derives the player
 * from `auth.uid()`, locks the stack, and rejects a foreign or empty one.
 */
export async function splitStack(stackId: string): Promise<SplitResult> {
  if (!isOwnedUnitId(stackId)) return { ok: false, message: "Unknown stack." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Splitting is unavailable right now." };

  const { data, error } = await supabase
    .rpc("split_unit_stack", { p_stack_id: stackId })
    .single<{ id: string }>();
  if (error || !data?.id) {
    return {
      ok: false,
      message:
        error?.code === "P0001"
          ? "The stack has no copies left."
          : error?.code === "22023"
            ? "Unknown stack."
            : error?.code === "42501"
              ? "Sign in to split units."
              : "The copy could not be split. Try again shortly.",
    };
  }

  for (const path of ["/units", `/units/stack/${stackId}`, "/fusion", "/squad"]) {
    revalidatePath(path);
  }
  return { ok: true, unitId: data.id };
}
