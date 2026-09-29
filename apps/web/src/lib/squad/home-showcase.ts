import type { Element } from "@bfr/data";
import { formArtFile, type OwnedUnitRow, unitContent } from "../units/owned-units.ts";
import { draftFromRow, SQUAD_SIZE, type SquadRow } from "./squad-editor.ts";

/**
 * The home squad showcase (M3-03D, RESOLVED-68 item 8): squad slot 0 as five cards, leader first,
 * each unit in its current form, with an empty frame for every empty slot. Pure, so the home page
 * stays thin and this is testable.
 */

/** The squad slot home shows. */
export const HOME_SQUAD_SLOT = 0;

/** Where every showcase card links: the squad editor for the slot home shows. */
export const HOME_SQUAD_HREF = `/squad?slot=${HOME_SQUAD_SLOT}`;

export type ShowcaseCard =
  | {
      kind: "unit";
      /** The `owned_units` row id. */
      ownedId: string;
      name: string;
      element: Element | null;
      leader: boolean;
      /** Web path of the current form's card art, or null when the form has no card export. */
      cardArt: string | null;
    }
  | { kind: "empty" };

/**
 * Card art (`/assets/ui/cards/<unit>-<form>.webp`) exists for every 3★–Omni form with exported
 * art; the summon fillers' 2★ forms and units without art have none.
 */
export function cardArtPath(unitId: string, formId: string): string | null {
  const form = unitContent(unitId)?.forms.find((f) => f.id === formId);
  if (!form) return null;
  const art = formArtFile(unitId, form.rarity);
  if (art === null || art === "2star") return null;
  return `/assets/ui/cards/${unitId}-${art}.webp`;
}

/**
 * Map the player's slot-0 squad row (or null when none is saved) and their owned units to exactly
 * `SQUAD_SIZE` cards: the leader first, the rest in squad order, then empty frames. Units the
 * player no longer owns are dropped, as in the squad editor.
 */
export function showcaseCards(
  row: SquadRow | null,
  owned: readonly OwnedUnitRow[],
): ShowcaseCard[] {
  const byId = new Map(owned.map((unit) => [unit.id, unit]));
  const draft = draftFromRow(row, new Set(byId.keys()));
  const leaderId = draft.unitIds[draft.leaderIndex];
  const ordered = leaderId
    ? [leaderId, ...draft.unitIds.filter((id) => id !== leaderId)]
    : [...draft.unitIds];

  const cards: ShowcaseCard[] = ordered.flatMap((id) => {
    const unit = byId.get(id);
    if (!unit) return [];
    const content = unitContent(unit.unit_id);
    return [
      {
        kind: "unit" as const,
        ownedId: unit.id,
        name: content?.name ?? unit.unit_id,
        element: content?.element ?? null,
        leader: id === leaderId,
        cardArt: cardArtPath(unit.unit_id, unit.form_id),
      },
    ];
  });
  while (cards.length < SQUAD_SIZE) cards.push({ kind: "empty" });
  return cards;
}
