import type { ReactNode } from "react";
import { HomeScreen } from "../../../components/menu/HomeScreen.tsx";
import { HOME_SQUAD_SLOT, showcaseCards } from "../../../lib/squad/home-showcase.ts";
import { SQUAD_COLUMNS, type SquadRow } from "../../../lib/squad/squad-editor.ts";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";
import { OWNED_UNIT_COLUMNS, type OwnedUnitRow } from "../../../lib/units/owned-units.ts";

/**
 * Home (M3-03D): the player's squad slot 0 and the units in it, read under RLS. Signed-out
 * visitors, players with no squad, or a failed read show empty frames.
 */
export default async function HomePage(): Promise<ReactNode> {
  return <HomeScreen cards={showcaseCards(...(await readHomeSquad()))} />;
}

async function readHomeSquad(): Promise<[SquadRow | null, OwnedUnitRow[]]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [null, []];
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return [null, []];

  const { data: squad, error } = await supabase
    .from("squads")
    .select(SQUAD_COLUMNS)
    .eq("user_id", userId)
    .eq("slot", HOME_SQUAD_SLOT)
    .maybeSingle<SquadRow>();
  if (error || !squad || squad.unit_ids.length === 0) return [null, []];

  const { data: units, error: unitsError } = await supabase
    .from("owned_units")
    .select(OWNED_UNIT_COLUMNS)
    .eq("user_id", userId)
    .in("id", squad.unit_ids)
    .overrideTypes<OwnedUnitRow[], { merge: false }>();
  if (unitsError) return [null, []];
  return [squad, units ?? []];
}
