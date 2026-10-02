import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import menu from "../../../components/menu/menu.module.css";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";
import { OWNED_UNIT_COLUMNS, type OwnedUnitRow } from "../../../lib/units/owned-units.ts";
import { UNIT_STACK_COLUMNS, type UnitStackRow } from "../../../lib/units/unit-stacks.ts";
import { FusionEditor } from "./FusionEditor.tsx";

export const metadata: Metadata = { title: "Fusion · BFR" };

export default async function FusionPage({
  searchParams,
}: {
  searchParams: Promise<{ target?: string }>;
}): Promise<ReactNode> {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = supabase ? await supabase.auth.getClaims() : { data: null };
  const userId = claims?.claims.sub;
  if (!supabase || !userId) redirect("/sign-in?next=/fusion");
  const [units, stacks, squads, wallet] = await Promise.all([
    supabase
      .from("owned_units")
      .select(`${OWNED_UNIT_COLUMNS}, second_sphere_slot`)
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
    supabase.from("wallets").select("zel").eq("user_id", userId).maybeSingle<{ zel: number }>(),
  ]);
  const blocked = [...new Set((squads.data ?? []).flatMap((s) => s.unit_ids))];
  const { target } = await searchParams;
  if (units.error || stacks.error || squads.error || wallet.error) {
    return (
      <div className={menu.placeholder}>
        <section className={menu.panel}>
          <h1 className={`${menu.panelTitle} ${menu.gold}`}>Fuse Units</h1>
          <p className={menu.panelText} role="alert">
            Your fusion materials could not be loaded. Try again shortly.
          </p>
        </section>
      </div>
    );
  }
  return (
    <FusionEditor
      rows={units.data ?? []}
      stacks={stacks.data ?? []}
      blocked={blocked}
      zel={Number(wallet.data?.zel ?? 0)}
      initialTarget={target}
    />
  );
}
