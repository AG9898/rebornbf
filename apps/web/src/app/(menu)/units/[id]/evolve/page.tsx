import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import styles from "../../../../../components/menu/menu.module.css";
import { SIGN_IN_PATH } from "../../../../../lib/supabase/routes.ts";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server.ts";
import {
  type EvolutionFormView,
  evolutionPlan,
  type OwnedItemRow,
  type SquadUseRow,
} from "../../../../../lib/units/evolution.ts";
import {
  isOwnedUnitId,
  OWNED_UNIT_COLUMNS,
  type OwnedUnitRow,
  unitContent,
} from "../../../../../lib/units/owned-units.ts";
import units from "../../units.module.css";
import { EvolveButton } from "./EvolveButton.tsx";
import evolve from "./evolve.module.css";

export const metadata: Metadata = { title: "Evolve · BFR" };

function FormCard({ form, alt }: { form: EvolutionFormView; alt: string }): ReactNode {
  return (
    <div className={evolve.form}>
      {form.illustration ? (
        <Image src={form.illustration} alt={alt} width={1024} height={1024} sizes="280px" />
      ) : (
        <span className={units.noArt}>{form.rarityLabel}</span>
      )}
      <span className={units.formName}>{form.name}</span>
      <span className={units.cardMeta}>
        {form.rarityLabel} · Lv cap {form.maxLevel}
      </span>
    </div>
  );
}

/**
 * The evolution screen (M4-02C): the unit's current and next form, the recipe's material units,
 * items, and Zel against what the player owns (all read under RLS), and an Evolve (or Omni Evolve)
 * button that calls the `evolve` RPC through a Server Action. The page never writes inventory.
 */
export default async function EvolvePage({
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

  const [ownedResult, squadsResult, itemsResult, walletResult] = await Promise.all([
    supabase
      .from("owned_units")
      .select(OWNED_UNIT_COLUMNS)
      .eq("user_id", userId)
      .overrideTypes<OwnedUnitRow[], { merge: false }>(),
    supabase
      .from("squads")
      .select("unit_ids, ally_unit_id")
      .eq("user_id", userId)
      .overrideTypes<SquadUseRow[], { merge: false }>(),
    supabase
      .from("owned_items")
      .select("item_id, count")
      .eq("user_id", userId)
      .overrideTypes<OwnedItemRow[], { merge: false }>(),
    supabase.from("wallets").select("zel").eq("user_id", userId).maybeSingle<{ zel: number }>(),
  ]);
  const owned = ownedResult.data ?? [];
  const target = owned.find((row) => row.id === id);
  if (!ownedResult.error && !target) notFound();

  const loadFailed =
    ownedResult.error || squadsResult.error || itemsResult.error || walletResult.error;
  const plan =
    target && !loadFailed
      ? evolutionPlan(
          target,
          owned,
          squadsResult.data ?? [],
          itemsResult.data ?? [],
          Number(walletResult.data?.zel ?? 0),
        )
      : null;
  const name = target ? (unitContent(target.unit_id)?.name ?? target.unit_id) : "Unit";

  return (
    <div className={units.page}>
      <header className={units.header}>
        <Link href={`/units/${id}`} className={units.back}>
          ‹ {name}
        </Link>
        <span className={units.count}>{plan?.omni ? "Omni Evolution" : "Evolution"}</span>
      </header>

      {loadFailed ? (
        <p className={styles.panelText}>This unit could not be loaded. Try again shortly.</p>
      ) : !plan ? (
        <p className={styles.panelText}>{name} cannot evolve any further.</p>
      ) : (
        <>
          <section className={evolve.forms}>
            <FormCard form={plan.from} alt={`${name}, ${plan.from.rarityLabel} form`} />
            <span className={evolve.arrow} aria-hidden>
              ›
            </span>
            <FormCard form={plan.next} alt={`${name}, ${plan.next.rarityLabel} form`} />
          </section>

          <ul className={evolve.list} aria-label="Requirements">
            <li data-met={plan.levelReady}>
              <span>Level {plan.from.maxLevel}</span>
              <span className={evolve.have}>Lv {plan.level}</span>
            </li>
            {plan.units.map((need) => (
              <li key={need.unitId} data-met={need.owned >= need.count}>
                <span>
                  {need.name} ×{need.count}
                </span>
                <span className={evolve.have}>
                  {need.owned} owned{need.inSquad > 0 ? ` (+${need.inSquad} in squads)` : ""}
                </span>
              </li>
            ))}
            {plan.items.map((need) => (
              <li key={need.itemId} data-met={need.owned >= need.count}>
                <span>
                  {need.name} ×{need.count}
                </span>
                <span className={evolve.have}>{need.owned} owned</span>
              </li>
            ))}
            <li data-met={plan.zelOwned >= plan.zel}>
              <span>{plan.zel.toLocaleString("en-US")} Zel</span>
              <span className={evolve.have}>{plan.zelOwned.toLocaleString("en-US")} owned</span>
            </li>
          </ul>

          {plan.problems.length > 0 ? (
            <ul className={units.note}>
              {plan.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : (
            <p className={units.note}>
              The materials above are spent. {name} returns to level 1 in the new form.
            </p>
          )}

          <EvolveButton
            unitId={id}
            materialIds={plan.materialIds}
            label={plan.omni ? "Omni Evolve" : "Evolve"}
            disabled={plan.problems.length > 0}
          />
        </>
      )}
    </div>
  );
}
