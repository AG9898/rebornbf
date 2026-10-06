import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AccountScreen } from "../../components/auth/AccountScreen.tsx";
import { memberSinceLabel, sessionProvider, totalUnits } from "../../lib/account/account-view.ts";
import { SQUAD_COLUMNS, type SquadRow } from "../../lib/squad/squad-editor.ts";
import { SIGN_IN_PATH } from "../../lib/supabase/routes.ts";
import { createSupabaseServerClient } from "../../lib/supabase/server.ts";
import {
  OWNED_UNIT_COLUMNS,
  type OwnedUnitRow,
  toOwnedUnitView,
} from "../../lib/units/owned-units.ts";

export const metadata: Metadata = { title: "Account · BFR" };

/**
 * The signed-in player's account page (protected by `src/proxy.ts`; ART_GUIDE → Sign-in and
 * Account screens). It sits outside the menu frame, so it also works mid-onboarding as the sign-out
 * path. It reads the profile, wallet, unit counts, and the first saved squad's leader under RLS
 * and draws them with `AccountScreen`.
 */
export default async function AccountPage(): Promise<ReactNode> {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData } = supabase ? await supabase.auth.getClaims() : { data: null };
  const claims = claimsData?.claims;
  const userId = claims?.sub;
  if (!supabase || !userId) redirect(`${SIGN_IN_PATH}?next=/account`);

  const [{ data: profile }, { data: wallet }, units, stacks, { data: squad }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, created_at")
      .eq("id", userId)
      .maybeSingle<{ display_name: string | null; created_at: string }>(),
    supabase
      .from("wallets")
      .select("gems, zel")
      .eq("user_id", userId)
      .maybeSingle<{ gems: number; zel: number }>(),
    supabase.from("owned_units").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("owned_unit_stacks").select("count").eq("user_id", userId),
    supabase
      .from("squads")
      .select(SQUAD_COLUMNS)
      .eq("user_id", userId)
      .order("slot")
      .limit(1)
      .maybeSingle<SquadRow>(),
  ]);

  const leaderRowId = squad ? squad.unit_ids[squad.leader_index] : undefined;
  const { data: leaderRow } = leaderRowId
    ? await supabase
        .from("owned_units")
        .select(OWNED_UNIT_COLUMNS)
        .eq("id", leaderRowId)
        .maybeSingle<OwnedUnitRow>()
    : { data: null };
  const leader = leaderRow ? toOwnedUnitView(leaderRow) : null;

  const unitCount =
    units.error || stacks.error
      ? null
      : totalUnits(
          units.count ?? 0,
          (stacks.data ?? []).map((row: { count: number }) => Number(row.count)),
        );

  return (
    <AccountScreen
      displayName={profile?.display_name ?? null}
      since={memberSinceLabel(profile?.created_at)}
      provider={sessionProvider(claims)}
      leader={leader}
      gems={wallet ? Number(wallet.gems) : 0}
      zel={wallet ? Number(wallet.zel) : 0}
      units={unitCount}
    />
  );
}
