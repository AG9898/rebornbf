import type { Element } from "@bfr/data";
import { cardArtPath } from "../squad/home-showcase.ts";
import { unitContent } from "../units/owned-units.ts";

/**
 * The starter pick (M3-05A, RESOLVED-68; GAME_DESIGN §8 → Starters): the six B0 starters the
 * player chooses from, granted at 3★. The server's `pick_starter` holds the same list
 * (`starter_unit_ids()` in `supabase/migrations/20260929190000_pick_starter.sql`).
 */
export const STARTER_UNIT_IDS = ["brand", "maren", "rook", "garrick", "solen", "morrick"] as const;
export type StarterUnitId = (typeof STARTER_UNIT_IDS)[number];

export function isStarterUnitId(value: unknown): value is StarterUnitId {
  return typeof value === "string" && (STARTER_UNIT_IDS as readonly string[]).includes(value);
}

export type StarterOption = {
  unitId: StarterUnitId;
  name: string;
  /** The 3★ form's name, e.g. "Forge Hand". */
  formName: string;
  element: Element;
  /** Web path of the 3★ showcase card (`/assets/ui/cards/<unit>-3star.webp`). */
  cardArt: string;
};

/** The six starters as pick-screen cards, in `STARTER_UNIT_IDS` order, at their 3★ form. */
export function starterOptions(): StarterOption[] {
  return STARTER_UNIT_IDS.map((unitId) => {
    const unit = unitContent(unitId);
    const form = unit?.forms.find((f) => f.rarity === 3);
    const cardArt = form ? cardArtPath(unitId, form.id) : null;
    if (!unit || !form || !cardArt) {
      throw new Error(`starterOptions: ${unitId} is missing its 3★ form or card art`);
    }
    return { unitId, name: unit.name, formName: form.name, element: unit.element, cardArt };
  });
}
