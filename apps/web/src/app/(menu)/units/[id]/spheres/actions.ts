"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server.ts";
import { isOwnedUnitId } from "../../../../../lib/units/owned-units.ts";
import { equipSphereErrorMessage, isSphereSlot } from "../../../../../lib/units/spheres.ts";

export type EquipSphereResult = { ok: true } | { ok: false; message: string };

/**
 * Equips an owned sphere into one of a unit's sockets, or empties the socket when `sphereId` is
 * null, through the `equip_sphere` RPC (M4-04A) as the signed-in player (M4-06J). The RPC derives
 * the player from `auth.uid()` and refuses a locked slot, a sphere not owned or already equipped
 * elsewhere, and two all-stat spheres; this only rejects malformed ids.
 */
export async function equipSphere(
  unitId: string,
  slot: number,
  sphereId: string | null,
): Promise<EquipSphereResult> {
  if (
    !isOwnedUnitId(unitId) ||
    !isSphereSlot(slot) ||
    (sphereId !== null && !isOwnedUnitId(sphereId))
  ) {
    return { ok: false, message: "Unknown unit or sphere." };
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Spheres are unavailable right now." };

  const { error } = await supabase.rpc("equip_sphere", {
    p_unit: unitId,
    p_slot: slot,
    p_sphere: sphereId,
  });
  if (error) return { ok: false, message: equipSphereErrorMessage(error.code, error.message) };

  revalidatePath(`/units/${unitId}`);
  revalidatePath(`/units/${unitId}/spheres`);
  return { ok: true };
}
