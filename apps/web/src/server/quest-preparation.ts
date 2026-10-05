import "server-only";
import type { Stage } from "@bfr/data";
import { notFound, redirect } from "next/navigation";
import { sessionStage } from "../lib/battle/session-battle.ts";
import type { ItemStock } from "../lib/quests/item-loadout.ts";
import { SQUAD_COLUMNS, type SquadRow } from "../lib/squad/squad-editor.ts";
import { SIGN_IN_PATH } from "../lib/supabase/routes.ts";
import { createSupabaseServerClient } from "../lib/supabase/server.ts";
import { OWNED_UNIT_COLUMNS, type OwnedUnitRow } from "../lib/units/owned-units.ts";

/** Saved squads a stage takes: three for a trial (M6-01J, RESOLVED-95), else one. */
export function stageSquadCount(stage: Stage): 1 | 3 {
  return stage.trial ? 3 : 1;
}

/**
 * Session-bound reads only; the RPC remains the authority for unlocks and inventory. `squads` holds
 * every saved squad; `squadCount` says how many of them the stage starts with (three for a trial).
 */
export async function questPreparation(stageId: string): Promise<{
  stage: Stage;
  squadCount: 1 | 3;
  owned: OwnedUnitRow[];
  squads: SquadRow[];
  items: ItemStock[];
  userId: string;
  failed: boolean;
}> {
  const stage = sessionStage(stageId);
  if (!stage) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: claims } = supabase ? await supabase.auth.getClaims() : { data: null };
  const userId = claims?.claims.sub;
  if (!supabase || !userId)
    redirect(`${SIGN_IN_PATH}?next=${encodeURIComponent(`/start/${stageId}`)}`);
  const [units, squads, items] = await Promise.all([
    supabase
      .from("owned_units")
      .select(OWNED_UNIT_COLUMNS)
      .eq("user_id", userId)
      .overrideTypes<OwnedUnitRow[], { merge: false }>(),
    supabase
      .from("squads")
      .select(SQUAD_COLUMNS)
      .eq("user_id", userId)
      .overrideTypes<SquadRow[], { merge: false }>(),
    supabase
      .from("owned_items")
      .select("item_id, count")
      .eq("user_id", userId)
      .overrideTypes<ItemStock[], { merge: false }>(),
  ]);
  return {
    stage,
    squadCount: stageSquadCount(stage),
    owned: units.data ?? [],
    squads: squads.data ?? [],
    items: items.data ?? [],
    userId,
    failed: Boolean(units.error || squads.error || items.error),
  };
}
