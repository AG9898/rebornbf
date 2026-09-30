import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SIGN_IN_PATH } from "../../../lib/supabase/routes.ts";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";
import {
  OWNED_UNIT_COLUMNS,
  type OwnedUnitRow,
  parseUnitSort,
  sortOwnedUnits,
  toOwnedUnitView,
} from "../../../lib/units/owned-units.ts";
import { UnitsList } from "./UnitsList.tsx";

export const metadata: Metadata = { title: "Units · BFR" };

/**
 * The unit collection, laid out as the original's All Units (M3-03E, ART_GUIDE → UI → Units,
 * Squad, and Unit detail screens): title bar, a five-column grid of element-framed thumbs over
 * `bg-olive`, and the help ticker. The signed-in player's `owned_units` and `squads` are read with
 * their session, so RLS returns only their own rows. Protected by `src/proxy.ts`.
 */
export default async function UnitsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string | string[] }>;
}): Promise<ReactNode> {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = supabase ? await supabase.auth.getClaims() : { data: null };
  const userId = claims?.claims.sub;
  if (!supabase || !userId) redirect(`${SIGN_IN_PATH}?next=/units`);

  const sort = parseUnitSort((await searchParams).sort);
  const [unitsResult, squadsResult] = await Promise.all([
    supabase
      .from("owned_units")
      .select(OWNED_UNIT_COLUMNS)
      .eq("user_id", userId)
      .overrideTypes<OwnedUnitRow[], { merge: false }>(),
    supabase
      .from("squads")
      .select("unit_ids")
      .eq("user_id", userId)
      .overrideTypes<{ unit_ids: string[] }[], { merge: false }>(),
  ]);

  const failed = Boolean(unitsResult.error || squadsResult.error);
  const owned = failed ? [] : sortOwnedUnits((unitsResult.data ?? []).map(toOwnedUnitView), sort);
  const party = new Set((squadsResult.data ?? []).flatMap((squad) => squad.unit_ids));

  return <UnitsList units={owned} party={party} sort={sort} failed={failed} />;
}
