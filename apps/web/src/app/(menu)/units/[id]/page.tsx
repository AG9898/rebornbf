import type { Stats } from "@bfr/data";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import styles from "../../../../components/menu/menu.module.css";
import { SIGN_IN_PATH } from "../../../../lib/supabase/routes.ts";
import { createSupabaseServerClient } from "../../../../lib/supabase/server.ts";
import {
  ELEMENT_LABELS,
  isOwnedUnitId,
  OWNED_UNIT_COLUMNS,
  type OwnedUnitRow,
  toOwnedUnitView,
} from "../../../../lib/units/owned-units.ts";
import units from "../units.module.css";

export const metadata: Metadata = { title: "Unit · BFR" };

const STAT_ROWS: readonly { key: keyof Stats; label: string }[] = [
  { key: "hp", label: "HP" },
  { key: "atk", label: "ATK" },
  { key: "def", label: "DEF" },
  { key: "rec", label: "REC" },
];

/**
 * One owned unit (M3-03A). The row is read with the player's session, so RLS hides other
 * players' units: a foreign or unknown id finds no row and 404s.
 */
export default async function UnitDetailPage({
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

  const { data: row } = await supabase
    .from("owned_units")
    .select(OWNED_UNIT_COLUMNS)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle<OwnedUnitRow>();
  if (!row) notFound();

  const unit = toOwnedUnitView(row);

  return (
    <div className={units.page}>
      <header className={units.header}>
        <Link href="/units" className={units.back}>
          ‹ Units
        </Link>
        <span className={units.count}>{unit.rarityLabel}</span>
      </header>

      <section className={units.splash}>
        {unit.illustration ? (
          <Image
            src={unit.illustration}
            alt={`${unit.name}, ${unit.rarityLabel} form`}
            width={1024}
            height={1024}
            sizes="(max-width: 640px) 100vw, 640px"
            className={units.splashImage}
            priority
          />
        ) : (
          <span className={units.noArt}>{unit.name.charAt(0)}</span>
        )}
      </section>

      <section className={units.detail}>
        <h1 className={`${units.title} ${styles.gold}`}>{unit.name}</h1>
        {unit.formName ? <p className={units.formName}>{unit.formName}</p> : null}
        <p className={units.cardMeta}>
          {unit.element ? `${ELEMENT_LABELS[unit.element]} · ` : ""}
          {unit.rarityLabel} · Lv {unit.level}
          {unit.maxLevel ? `/${unit.maxLevel}` : ""} · {unit.exp.toLocaleString("en-US")} EXP
        </p>

        {unit.stats ? (
          <table className={units.stats}>
            <thead>
              <tr>
                <th scope="col">Stat</th>
                {unit.currentStats ? <th scope="col">Lv {unit.level}</th> : null}
                <th scope="col">Lv 1</th>
                <th scope="col">Lv {unit.maxLevel}</th>
              </tr>
            </thead>
            <tbody>
              {STAT_ROWS.map(({ key, label }) => (
                <tr key={key}>
                  <th scope="row">{label}</th>
                  {unit.currentStats ? <td>{unit.currentStats[key]}</td> : null}
                  <td>{unit.stats?.base[key]}</td>
                  <td>{unit.stats?.max[key]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={styles.panelText}>This unit's details are not available.</p>
        )}
        {unit.stats && !unit.currentStats ? (
          <p className={units.note}>
            Stats grow from the Lv 1 values to the Lv {unit.maxLevel} values as the unit levels.
          </p>
        ) : null}
      </section>
    </div>
  );
}
