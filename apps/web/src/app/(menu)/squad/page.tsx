import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import styles from "../../../components/menu/menu.module.css";
import {
  draftFromRow,
  parseSquadSlot,
  SQUAD_COLUMNS,
  type SquadRow,
} from "../../../lib/squad/squad-editor.ts";
import { SIGN_IN_PATH } from "../../../lib/supabase/routes.ts";
import { createSupabaseServerClient } from "../../../lib/supabase/server.ts";
import {
  formLeaderSkill,
  OWNED_UNIT_COLUMNS,
  type OwnedUnitRow,
  type OwnedUnitView,
  sortOwnedUnits,
  toOwnedUnitView,
} from "../../../lib/units/owned-units.ts";
import { type EditorUnit, SquadEditor } from "./SquadEditor.tsx";

export const metadata: Metadata = { title: "Squad · BFR" };

/**
 * The squad editor (M3-03B, restyled as the original's Manage Squad in M3-03F): the player's
 * owned units and the squad saved in `?slot=` (0–9), both read under RLS. Saving goes through the `save_squad` RPC. Protected by `src/proxy.ts`.
 */
export default async function SquadPage({
  searchParams,
}: {
  searchParams: Promise<{ slot?: string | string[] }>;
}): Promise<ReactNode> {
  const slot = parseSquadSlot((await searchParams).slot);
  const supabase = await createSupabaseServerClient();
  const { data: claims } = supabase ? await supabase.auth.getClaims() : { data: null };
  const userId = claims?.claims.sub;
  if (!supabase || !userId) redirect(`${SIGN_IN_PATH}?next=/squad`);

  const [unitsResult, squadResult] = await Promise.all([
    supabase
      .from("owned_units")
      .select(OWNED_UNIT_COLUMNS)
      .eq("user_id", userId)
      .overrideTypes<OwnedUnitRow[], { merge: false }>(),
    supabase
      .from("squads")
      .select(SQUAD_COLUMNS)
      .eq("user_id", userId)
      .eq("slot", slot)
      .maybeSingle<SquadRow>(),
  ]);

  if (unitsResult.error || squadResult.error) {
    return (
      <div className={styles.placeholder}>
        <section className={styles.panel}>
          <h1 className={`${styles.panelTitle} ${styles.gold}`}>Squad</h1>
          <p className={styles.panelText}>Your squad could not be loaded. Try again shortly.</p>
        </section>
      </div>
    );
  }

  const views = sortOwnedUnits((unitsResult.data ?? []).map(toOwnedUnitView));
  const owned = views.map(toEditorUnit);
  const saved = draftFromRow(squadResult.data, new Set(owned.map((unit) => unit.id)));

  return (
    <SquadEditor
      key={slot}
      slot={slot}
      units={owned}
      pickerUnits={views.map((view) => ({ ...view, stackCount: null }))}
      saved={saved}
    />
  );
}

/** The slice of a unit view the editor draws, plus its form's Leader Skill name. */
function toEditorUnit(view: OwnedUnitView): EditorUnit {
  return {
    id: view.id,
    unitId: view.unitId,
    formId: view.formId,
    name: view.name,
    rarityLabel: view.rarityLabel,
    level: view.level,
    maxLevel: view.maxLevel,
    element: view.element,
    stats: view.currentStats,
    leaderSkill: formLeaderSkill(view.unitId, view.formId),
    sprite: view.sprite,
    thumb: view.thumb,
  };
}
