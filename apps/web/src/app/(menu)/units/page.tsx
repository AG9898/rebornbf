import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import styles from "../../../components/menu/menu.module.css";
import { THUMB_ART_SIZE } from "../../../components/menu/ui-assets.ts";
import { SIGN_IN_PATH } from "../../../lib/supabase/routes.ts";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";
import {
  ELEMENT_LABELS,
  OWNED_UNIT_COLUMNS,
  type OwnedUnitRow,
  sortOwnedUnits,
  toOwnedUnitView,
} from "../../../lib/units/owned-units.ts";
import units from "./units.module.css";

export const metadata: Metadata = { title: "Units · BFR" };

/**
 * The unit collection (M3-03A): the signed-in player's `owned_units`, read with their session so
 * RLS returns only their own rows. Protected by `src/proxy.ts`.
 */
export default async function UnitsPage(): Promise<ReactNode> {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = supabase ? await supabase.auth.getClaims() : { data: null };
  const userId = claims?.claims.sub;
  if (!supabase || !userId) redirect(`${SIGN_IN_PATH}?next=/units`);

  const { data, error } = await supabase
    .from("owned_units")
    .select(OWNED_UNIT_COLUMNS)
    .eq("user_id", userId)
    .overrideTypes<OwnedUnitRow[], { merge: false }>();

  if (error) {
    return (
      <div className={styles.placeholder}>
        <section className={styles.panel}>
          <h1 className={`${styles.panelTitle} ${styles.gold}`}>Units</h1>
          <p className={styles.panelText}>Your units could not be loaded. Try again shortly.</p>
        </section>
      </div>
    );
  }

  const owned = sortOwnedUnits((data ?? []).map(toOwnedUnitView));

  return (
    <div className={units.page}>
      <header className={units.header}>
        <h1 className={`${units.title} ${styles.gold}`}>Units</h1>
        <span className={units.count}>{owned.length} owned</span>
      </header>

      {owned.length === 0 ? (
        <section className={styles.panel}>
          <p className={styles.panelText}>
            You have no units yet. Your starters join you as you clear the story.
          </p>
          <Link href="/home" className={styles.panelLink}>
            Back to Home
          </Link>
        </section>
      ) : (
        <ul className={units.grid}>
          {owned.map((unit) => (
            <li key={unit.id}>
              <Link href={`/units/${unit.id}`} className={units.card}>
                <span className={units.portrait} data-element={unit.element ?? undefined}>
                  {unit.thumb ? (
                    <Image
                      src={unit.thumb}
                      alt=""
                      width={THUMB_ART_SIZE.width}
                      height={THUMB_ART_SIZE.height}
                      className={units.thumb}
                      unoptimized
                    />
                  ) : unit.sprite ? (
                    <Image
                      src={unit.sprite}
                      alt=""
                      width={128}
                      height={128}
                      className={units.sprite}
                      unoptimized
                    />
                  ) : (
                    <span className={units.noArt}>{unit.name.charAt(0)}</span>
                  )}
                  <span className={units.rarity}>{unit.rarityLabel}</span>
                </span>
                <span className={units.cardName}>{unit.name}</span>
                <span className={units.cardMeta}>
                  Lv {unit.level}
                  {unit.maxLevel ? `/${unit.maxLevel}` : ""}
                  {unit.element ? ` · ${ELEMENT_LABELS[unit.element]}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
