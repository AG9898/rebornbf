import type { ReactNode } from "react";
import { HomeScreen } from "../../../components/menu/HomeScreen.tsx";
import { LoginRewardPopup } from "../../../components/menu/LoginRewardPopup.tsx";
import { claimLoginReward } from "../../../lib/login/claim.ts";
import { loginRewardView } from "../../../lib/login/login-reward.ts";
import { HOME_SQUAD_SLOT, showcaseCards } from "../../../lib/squad/home-showcase.ts";
import { SQUAD_COLUMNS, type SquadRow } from "../../../lib/squad/squad-editor.ts";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";
import { OWNED_UNIT_COLUMNS, type OwnedUnitRow } from "../../../lib/units/owned-units.ts";

/**
 * Home (M3-03D): the player's squad slot 0 and the units in it, read under RLS. Signed-out
 * visitors, players with no squad, or a failed read show empty frames. Each render also claims
 * today's login calendar step (M5-03B, RESOLVED-68; idempotent per UTC day) and shows the popup
 * when something was granted; nothing to claim, signed out, or an error shows none.
 */
export default async function HomePage(): Promise<ReactNode> {
  const [squad, claim] = await Promise.all([readHomeSquad(), claimLoginReward()]);
  const reward = loginRewardView(claim);
  return (
    <>
      <HomeScreen cards={showcaseCards(...squad)} />
      {reward && claim ? <LoginRewardPopup view={reward} gemsAfter={claim.gemsAfter} /> : null}
    </>
  );
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
