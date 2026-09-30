import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import menu from "../../../components/menu/menu.module.css";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";
import { OWNED_UNIT_COLUMNS, type OwnedUnitRow } from "../../../lib/units/owned-units.ts";
import { FusionEditor } from "./FusionEditor.tsx";
import styles from "./fusion.module.css";

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
  const [units, squads, wallet] = await Promise.all([
    supabase
      .from("owned_units")
      .select(OWNED_UNIT_COLUMNS)
      .eq("user_id", userId)
      .overrideTypes<OwnedUnitRow[], { merge: false }>(),
    supabase
      .from("squads")
      .select("unit_ids, ally_unit_id")
      .eq("user_id", userId)
      .overrideTypes<{ unit_ids: string[]; ally_unit_id: string | null }[], { merge: false }>(),
    supabase.from("wallets").select("zel").eq("user_id", userId).maybeSingle<{ zel: number }>(),
  ]);
  const blocked = [
    ...new Set(
      (squads.data ?? []).flatMap((s) => [
        ...s.unit_ids,
        ...(s.ally_unit_id ? [s.ally_unit_id] : []),
      ]),
    ),
  ];
  const { target } = await searchParams;
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={menu.gold}>Fusion</h1>
        <Link href="/units">‹ Units</Link>
      </header>
      {units.error || squads.error || wallet.error ? (
        <p role="alert">Your fusion materials could not be loaded. Try again shortly.</p>
      ) : (
        <FusionEditor
          rows={units.data ?? []}
          blocked={blocked}
          zel={Number(wallet.data?.zel ?? 0)}
          initialTarget={target}
        />
      )}
    </div>
  );
}
