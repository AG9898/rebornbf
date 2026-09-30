"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server.ts";
import { evolveErrorMessage } from "../../../../../lib/units/evolution.ts";
import { isOwnedUnitId } from "../../../../../lib/units/owned-units.ts";
import {
  type StackQuantities,
  stackArgs,
  stackQuantitiesProblem,
} from "../../../../../lib/units/unit-stacks.ts";

export type EvolveResult = { ok: true } | { ok: false; message: string };

/**
 * Evolves (or Omni-evolves) one owned unit through the `evolve` RPC (M4-02A) as the signed-in
 * player (M4-02C). The RPC derives the player from `auth.uid()` and re-checks level, recipe,
 * materials (owned rows plus stacked copies, M4-05C), items, and Zel in one transaction; this only
 * rejects malformed ids and stack quantities.
 */
export async function evolveUnit(
  unitId: string,
  materialIds: string[],
  materialStacks: StackQuantities = {},
): Promise<EvolveResult> {
  if (
    !isOwnedUnitId(unitId) ||
    stackQuantitiesProblem(materialStacks) ||
    !Array.isArray(materialIds) ||
    !materialIds.every((id) => typeof id === "string" && isOwnedUnitId(id))
  ) {
    return { ok: false, message: "Unknown unit." };
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Evolution is unavailable right now." };

  const { error } = await supabase.rpc("evolve", {
    p_unit: unitId,
    p_materials: materialIds,
    p_material_stacks: stackArgs(materialStacks),
  });
  if (error) return { ok: false, message: evolveErrorMessage(error.code, error.message) };

  revalidatePath("/units");
  revalidatePath(`/units/${unitId}`);
  return { ok: true };
}
