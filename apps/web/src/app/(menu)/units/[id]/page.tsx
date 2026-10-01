import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SIGN_IN_PATH } from "../../../../lib/supabase/routes.ts";
import { createSupabaseServerClient } from "../../../../lib/supabase/server.ts";
import { nextEvolution } from "../../../../lib/units/evolution.ts";
import {
  isOwnedUnitId,
  OWNED_UNIT_COLUMNS,
  type OwnedUnitRow,
  toUnitDetailView,
} from "../../../../lib/units/owned-units.ts";
import {
  OWNED_SPHERE_COLUMNS,
  type OwnedSphereRow,
  sphereSockets,
  UNIT_SPHERE_COLUMNS,
  type UnitSphereRow,
} from "../../../../lib/units/spheres.ts";
import { UnitDetail } from "./UnitDetail.tsx";

export const metadata: Metadata = { title: "Unit · BFR" };

/**
 * One owned unit (M3-03A), laid out as the original's Unit Info (M3-03G, `UnitDetail.tsx`). The
 * row is read with the player's session, so RLS hides other players' units: a foreign or unknown
 * id finds no row and 404s. Its sphere rows (M4-06J) open the Equip Sphere screen.
 */
export default async function UnitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactNode> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: claims } = supabase ? await supabase.auth.getClaims() : { data: null };
  const userId = claims?.claims.sub;
  if (!supabase || !userId) redirect(`${SIGN_IN_PATH}?next=/units`);
  if (!isOwnedUnitId(id)) notFound();

  const [{ data: row }, { data: equipment }, { data: spheres }] = await Promise.all([
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
      .eq("owned_unit_id", id)
      .overrideTypes<UnitSphereRow[], { merge: false }>(),
    supabase
      .from("owned_spheres")
      .select(OWNED_SPHERE_COLUMNS)
      .eq("user_id", userId)
      .overrideTypes<OwnedSphereRow[], { merge: false }>(),
  ]);
  if (!row) notFound();

  const evolution = nextEvolution(row);
  return (
    <UnitDetail
      unit={toUnitDetailView(row)}
      evolveLabel={evolution ? (evolution.next.rarity === "omni" ? "Omni Evolve" : "Evolve") : null}
      spheres={sphereSockets(id, row.second_sphere_slot, equipment ?? [], spheres ?? [])}
    />
  );
}
