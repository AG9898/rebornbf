import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SIGN_IN_PATH } from "../../../../lib/supabase/routes.ts";
import { createSupabaseServerClient } from "../../../../lib/supabase/server.ts";
import {
  OWNED_UNIT_COLUMNS,
  type OwnedUnitRow,
  parseUnitSort,
} from "../../../../lib/units/owned-units.ts";
import {
  filterEntries,
  parseUnitFilter,
  unitListFilterHref,
} from "../../../../lib/units/unit-filter.ts";
import { parseUnitPick } from "../../../../lib/units/unit-hub.ts";
import {
  collectionEntries,
  ownedCopyTotal,
  UNIT_STACK_COLUMNS,
  type UnitStackRow,
} from "../../../../lib/units/unit-stacks.ts";
import { UnitsList } from "./UnitsList.tsx";

export const metadata: Metadata = { title: "Units · BFR" };

/**
 * The unit collection, laid out as the original's All Units (M3-03E, legacy/ART_GUIDE_BFR.md → UI → Units,
 * Squad, and Unit detail screens): title bar, a five-column grid of element-framed thumbs over
 * `bg-olive`, and the help ticker. Opened from the Unit hub at `/units` (M4-06B); `?pick=evolve`
 * dims units that cannot evolve and sends a tap to the evolve screen; `?pick=sphere` sends a tap to
 * the Equip Sphere screen (M4-06J). The Filter tab's parameters (M8-04_1, `unit-filter.ts`) keep only
 * matching tiles. The signed-in player's `owned_units`, `owned_unit_stacks`
 * (one tile per stack, M4-05C), and `squads` are read with their session, so RLS returns only
 * their own rows. Protected by `src/proxy.ts`.
 */
export default async function UnitsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = supabase ? await supabase.auth.getClaims() : { data: null };
  const userId = claims?.claims.sub;
  const params = await searchParams;
  const sort = parseUnitSort(params.sort);
  const pick = parseUnitPick(params.pick);
  const filter = parseUnitFilter(params);
  if (!supabase || !userId) {
    redirect(`${SIGN_IN_PATH}?next=${encodeURIComponent(unitListFilterHref(sort, pick, filter))}`);
  }

  const [unitsResult, stacksResult, squadsResult] = await Promise.all([
    supabase
      .from("owned_units")
      .select(OWNED_UNIT_COLUMNS)
      .eq("user_id", userId)
      .overrideTypes<OwnedUnitRow[], { merge: false }>(),
    supabase
      .from("owned_unit_stacks")
      .select(UNIT_STACK_COLUMNS)
      .eq("user_id", userId)
      .gt("count", 0)
      .overrideTypes<UnitStackRow[], { merge: false }>(),
    supabase
      .from("squads")
      .select("unit_ids")
      .eq("user_id", userId)
      .overrideTypes<{ unit_ids: string[] }[], { merge: false }>(),
  ]);

  const failed = Boolean(unitsResult.error || stacksResult.error || squadsResult.error);
  const rows = failed ? [] : (unitsResult.data ?? []);
  const stacks = failed ? [] : (stacksResult.data ?? []);
  const party = new Set((squadsResult.data ?? []).flatMap((squad) => squad.unit_ids));
  const types = new Map(rows.map((row) => [row.id, row.unit_type?.type ?? "lord"] as const));

  return (
    <UnitsList
      units={filterEntries(collectionEntries(rows, stacks, sort), filter, { party, types })}
      total={ownedCopyTotal(rows, stacks)}
      party={party}
      sort={sort}
      pick={pick}
      filter={filter}
      failed={failed}
    />
  );
}
