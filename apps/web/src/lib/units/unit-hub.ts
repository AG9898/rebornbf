/**
 * The Unit hub and the All Units list's pick modes (M4-06B, RESOLVED-80; ART_GUIDE -> UI -> Unit
 * hub). `/units` is the six-button hub; All Units lives at `/units/list`.
 */
import { nextEvolution } from "./evolution.ts";
import type { UnitSortKey } from "./owned-units.ts";
import type { CollectionEntry } from "./unit-stacks.ts";

export const UNIT_HUB_PATH = "/units";
export const UNIT_LIST_PATH = "/units/list";

export type UnitHubButton = {
  label: string;
  /** Where the button goes; null while the screen it opens does not exist yet. */
  href: string | null;
};

/** The hub's 2x3 grid in the original's order, left to right, top to bottom. */
export const UNIT_HUB_BUTTONS: readonly UnitHubButton[] = [
  { label: "View Units", href: UNIT_LIST_PATH },
  { label: "Manage Squad", href: "/squad" },
  { label: "Fusion", href: "/fusion" },
  { label: "Evolve Unit", href: `${UNIT_LIST_PATH}?pick=evolve` },
  { label: "Equip Sphere", href: `${UNIT_LIST_PATH}?pick=sphere` },
  // Sell Unit (M4-06I) opens once its screen exists.
  { label: "Sell Unit", href: null },
];

/** The list's pick modes: a tap opens that action's screen instead of the unit detail. */
export type UnitPickMode = "evolve" | "sphere";

/** Each pick mode's list title and help ticker. */
export const UNIT_PICK_TEXT: Record<UnitPickMode, { title: string; ticker: string }> = {
  evolve: { title: "Evolve Unit", ticker: "Select a unit to evolve." },
  sphere: { title: "Equip Sphere", ticker: "Select a unit to equip spheres." },
};

export function parseUnitPick(value: string | string[] | undefined): UnitPickMode | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "evolve" || raw === "sphere" ? raw : null;
}

/** The All Units URL for a sort and pick mode; the defaults are left out of the query. */
export function unitListHref(sort: UnitSortKey, pick: UnitPickMode | null = null): string {
  const params = new URLSearchParams();
  if (sort !== "rarity") params.set("sort", sort);
  if (pick) params.set("pick", pick);
  const query = params.toString();
  return query ? `${UNIT_LIST_PATH}?${query}` : UNIT_LIST_PATH;
}

/**
 * Where a tile goes in `pick` mode, or null when it cannot be picked (dimmed). Evolve picks owned
 * rows whose form has a recipe and a next form; stacks hold single-form units and never evolve.
 * Sphere picks any owned row (M4-06J); a stacked copy must be split out before it can equip.
 */
export function pickHref(
  entry: Pick<CollectionEntry, "id" | "unitId" | "formId" | "stackCount">,
  pick: UnitPickMode,
): string | null {
  switch (pick) {
    case "evolve":
      return entry.stackCount === null &&
        nextEvolution({ unit_id: entry.unitId, form_id: entry.formId })
        ? `/units/${entry.id}/evolve`
        : null;
    case "sphere":
      return entry.stackCount === null ? `/units/${entry.id}/spheres` : null;
  }
}
