import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SUMMON_BANNERS, summonBannerView } from "../../../lib/summon/summon.ts";
import { isConfirmStep } from "../../../lib/summon/summon-screen.ts";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";
import { SummonScreen } from "./SummonScreen.tsx";

export const metadata: Metadata = { title: "Summon · BFR" };

/**
 * The Summon screen (M8-11; ART_GUIDE -> UI -> Summon): the banner page, or its confirm window
 * at `?step=confirm`. Reads the wallet, pity, and tickets under RLS; summons go through the
 * `summon` / `summon_ticket` RPCs, which roll server-side.
 */
export default async function SummonPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string | string[] }>;
}): Promise<ReactNode> {
  const confirming = isConfirmStep((await searchParams).step);
  const supabase = await createSupabaseServerClient();
  const { data: claims } = supabase ? await supabase.auth.getClaims() : { data: null };
  const userId = claims?.claims.sub;
  if (!supabase || !userId) redirect("/sign-in?next=/summon");
  const [wallet, pity, tickets] = await Promise.all([
    supabase.from("wallets").select("gems").eq("user_id", userId).maybeSingle<{ gems: number }>(),
    supabase
      .from("summon_pity")
      .select("banner_id, pulls")
      .eq("user_id", userId)
      .overrideTypes<{ banner_id: string; pulls: number }[], { merge: false }>(),
    supabase
      .from("summon_tickets")
      .select("count")
      .eq("user_id", userId)
      .maybeSingle<{ count: number }>(),
  ]);
  const pulls = Object.fromEntries((pity.data ?? []).map((r) => [r.banner_id, Number(r.pulls)]));
  return (
    <SummonScreen
      banners={SUMMON_BANNERS.map(summonBannerView)}
      confirming={confirming}
      gems={wallet.error ? null : Number(wallet.data?.gems ?? 0)}
      pityPulls={pity.error ? null : pulls}
      tickets={tickets.error ? null : Number(tickets.data?.count ?? 0)}
    />
  );
}
