import { guestPreviews } from "../squad/guest-pool.ts";
import {
  formLeaderSkill,
  type OwnedUnitRow,
  type OwnedUnitView,
  sortOwnedUnits,
  toOwnedUnitView,
  type UnitSortKey,
} from "../units/owned-units.ts";

export type Reinforcement = OwnedUnitView & { yours: boolean; leaderSkill: string | null };

/** Display the same guest scaling as start_battle, alongside every owned-row duplicate. */
export function reinforcements(
  owned: readonly OwnedUnitRow[],
  sort: UnitSortKey = "rarity",
): Reinforcement[] {
  return sortOwnedUnits(
    [
      ...guestPreviews(owned).map((view) => ({ ...view, yours: false })),
      ...owned.map((row) => ({ ...toOwnedUnitView(row), yours: true })),
    ],
    sort,
  ).map((view) => ({ ...view, leaderSkill: formLeaderSkill(view.unitId, view.formId) }));
}

export function beginQuestHref(stage: string, ally: string | null, slot = 0): string {
  const query = new URLSearchParams({ slot: String(slot) });
  if (ally !== null) query.set("ally", ally);
  return `/start/${encodeURIComponent(stage)}/begin?${query}`;
}
