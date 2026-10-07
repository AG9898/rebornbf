import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import kit from "../../../../../components/menu/kit.module.css";
import { SIGN_IN_PATH } from "../../../../../lib/supabase/routes.ts";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server.ts";
import {
  isOwnedUnitId,
  OWNED_UNIT_COLUMNS,
  type OwnedUnitRow,
  toUnitDetailView,
} from "../../../../../lib/units/owned-units.ts";
import {
  OWNED_SPHERE_COLUMNS,
  type OwnedSphereRow,
  ownedSphereEntries,
  sphereSockets,
  UNIT_SPHERE_COLUMNS,
  type UnitSphereRow,
} from "../../../../../lib/units/spheres.ts";
import { SphereEquip } from "./SphereEquip.tsx";

export const metadata: Metadata = { title: "Equip Sphere · BFR" };

/**
 * The Equip Sphere screen (M4-06J, rebuilt from original pieces in M8-09; ART_GUIDE → UI → Equip
 * Sphere): the unit's unlocked sphere slots (the second only once unlocked, M4-04D) and the
 * player's owned spheres. The unit, its equipment, and the spheres are read under RLS; changes go
 * through `equip_sphere` (M4-04A) in a Server Action. Protected by `src/proxy.ts`.
 */
export default async function EquipSpherePage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactNode> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: claims } = supabase ? await supabase.auth.getClaims() : { data: null };
  const userId = claims?.claims.sub;
  if (!supabase || !userId) redirect(`${SIGN_IN_PATH}?next=/units/${id}/spheres`);
  if (!isOwnedUnitId(id)) notFound();

  const [unitResult, equipmentResult, spheresResult] = await Promise.all([
    supabase
      .from("owned_units")
      .select(`${OWNED_UNIT_COLUMNS}, second_sphere_slot`)
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle<OwnedUnitRow & { second_sphere_slot: boolean }>(),
    supabase
      .from("unit_spheres")
      .select(UNIT_SPHERE_COLUMNS)
      .eq("user_id", userId)
      .overrideTypes<UnitSphereRow[], { merge: false }>(),
    supabase
      .from("owned_spheres")
      .select(OWNED_SPHERE_COLUMNS)
      .eq("user_id", userId)
      .overrideTypes<OwnedSphereRow[], { merge: false }>(),
  ]);
  const row = unitResult.data;
  if (!row) notFound();

  const failed = Boolean(equipmentResult.error || spheresResult.error);
  const equipment = equipmentResult.data ?? [];
  const owned = spheresResult.data ?? [];
  const sockets = sphereSockets(id, row.second_sphere_slot, equipment, owned).filter(
    (socket) => socket.unlocked,
  );

  const unit = toUnitDetailView(row);
  return (
    <div className={kit.page}>
      <SphereEquip
        unitId={id}
        unit={{
          name: unit.name,
          rarity: unit.rarity,
          rarityLabel: unit.rarityLabel,
          thumb: unit.thumb,
          element: unit.element,
        }}
        sockets={sockets}
        spheres={failed ? null : ownedSphereEntries(id, equipment, owned)}
      />
    </div>
  );
}
