import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SUMMON_BANNERS, summonBannerView } from "../../../lib/summon/summon.ts";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";
import { SummonScreen } from "./SummonScreen.tsx";

export const metadata: Metadata = { title: "Summon · BFR" };

export default async function SummonPage(): Promise<ReactNode> {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = supabase ? await supabase.auth.getClaims() : { data: null };
  const userId = claims?.claims.sub;
  if (!supabase || !userId) redirect("/sign-in?next=/summon");
  const [wallet, pity] = await Promise.all([
    supabase.from("wallets").select("gems").eq("user_id", userId).maybeSingle<{ gems: number }>(),
    supabase
      .from("summon_pity")
      .select("banner_id, pulls")
      .eq("user_id", userId)
      .overrideTypes<{ banner_id: string; pulls: number }[], { merge: false }>(),
  ]);
  const pulls = Object.fromEntries((pity.data ?? []).map((r) => [r.banner_id, Number(r.pulls)]));
  return (
    <SummonScreen
      banners={SUMMON_BANNERS.map(summonBannerView)}
      gems={wallet.error ? null : Number(wallet.data?.gems ?? 0)}
      pityPulls={pity.error ? null : pulls}
    />
  );
}
