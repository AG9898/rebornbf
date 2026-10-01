import type { Element } from "@bfr/data";
import { sortOwnedUnits, type UnitSortKey } from "./owned-units.ts";
import type { CollectionEntry } from "./unit-stacks.ts";

/**
 * The shared multi-select unit picker's state (M4-06N, RESOLVED-83; ART_GUIDE → UI → Multi-select
 * picker). Pure helpers: picks are kept in pick order (the red numbered badges), an owned row is one
 * copy and a stack contributes a chosen number of copies, every copy counts against the picker's
 * limit, and an ineligible tile can never be picked. Fusion fodder, squad fill, and sell adopt it.
 */

/** One picked tile: an owned row (`copies` 1) or a stack with the copies chosen from it. */
export type UnitPick = { readonly id: string; readonly copies: number };

/** Picks in the order they were made. */
export type UnitPicks = readonly UnitPick[];

/** What a tile needs for picking: its id and, for a stack, how many copies it holds. */
export type PickableEntry = Pick<CollectionEntry, "id" | "stackCount">;

/** The picker's rules: how many copies it takes in all, and which tile ids it refuses. */
export type PickRules = { readonly limit: number; readonly ineligible: ReadonlySet<string> };

/** What Confirm hands back: picked row ids in pick order and copies per picked stack id. */
export type PickResult = { unitIds: string[]; stacks: Record<string, number> };

/** Copies picked across every tile. */
export function pickedCopies(picks: UnitPicks): number {
  return picks.reduce((sum, pick) => sum + pick.copies, 0);
}

/** A tile's badge number (1-based pick order), or null when it is not picked. */
export function pickNumber(picks: UnitPicks, id: string): number | null {
  const index = picks.findIndex((pick) => pick.id === id);
  return index === -1 ? null : index + 1;
}

/** Whether a tile can be picked now: eligible, not yet picked, and a copy left under the limit. */
export function canPick(picks: UnitPicks, entry: PickableEntry, rules: PickRules): boolean {
  return (
    !rules.ineligible.has(entry.id) &&
    pickNumber(picks, entry.id) === null &&
    pickedCopies(picks) < rules.limit &&
    (entry.stackCount === null || entry.stackCount > 0)
  );
}

/**
 * A tap on a tile: a picked tile is unpicked (later badges move up one); an unpicked tile is added
 * at the end with one copy when `canPick` allows it; otherwise nothing changes.
 */
export function togglePick(picks: UnitPicks, entry: PickableEntry, rules: PickRules): UnitPicks {
  if (pickNumber(picks, entry.id) !== null) return picks.filter((pick) => pick.id !== entry.id);
  return canPick(picks, entry, rules) ? [...picks, { id: entry.id, copies: 1 }] : picks;
}

/**
 * A picked stack's stepper: sets its copies, clamped to the stack's held copies and the limit less
 * every other picked copy. Zero unpicks it; a row, an unpicked tile, or an ineligible tile is
 * unchanged.
 */
export function setPickCopies(
  picks: UnitPicks,
  entry: PickableEntry,
  wanted: number,
  rules: PickRules,
): UnitPicks {
  if (entry.stackCount === null || rules.ineligible.has(entry.id)) return picks;
  const current = picks.find((pick) => pick.id === entry.id);
  if (!current) return picks;
  const others = pickedCopies(picks) - current.copies;
  const cap = Math.max(0, Math.min(entry.stackCount, rules.limit - others));
  const copies = Math.max(0, Math.min(Math.trunc(wanted), cap));
  if (copies === 0) return picks.filter((pick) => pick.id !== entry.id);
  return picks.map((pick) => (pick.id === entry.id ? { id: pick.id, copies } : pick));
}

/**
 * The picks as Confirm returns them. Defensive: only tiles still in `entries`, never an ineligible
 * tile, stack copies capped at the stack's held copies, and nothing past the limit, in pick order.
 */
export function pickResult(
  picks: UnitPicks,
  entries: readonly PickableEntry[],
  rules: PickRules,
): PickResult {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const result: PickResult = { unitIds: [], stacks: {} };
  let room = rules.limit;
  for (const pick of picks) {
    const entry = byId.get(pick.id);
    if (!entry || rules.ineligible.has(pick.id) || room <= 0) continue;
    if (entry.stackCount === null) {
      result.unitIds.push(pick.id);
      room -= 1;
    } else {
      const copies = Math.min(Math.trunc(pick.copies), entry.stackCount, room);
      if (copies <= 0) continue;
      result.stacks[pick.id] = copies;
      room -= copies;
    }
  }
  return result;
}

/** The picker's Filter cycle: every element, then all units again (null). */
export const PICKER_FILTERS: readonly (Element | null)[] = [
  null,
  "fire",
  "water",
  "earth",
  "thunder",
  "light",
  "dark",
];

/** The filter the Filter button moves to after `filter`, wrapping round. */
export function nextPickerFilter(filter: Element | null): Element | null {
  const index = PICKER_FILTERS.indexOf(filter);
  return PICKER_FILTERS[(index + 1) % PICKER_FILTERS.length] ?? null;
}

/** The tiles the grid shows: those of the filter's element (all when null), in `sort` order. */
export function pickerEntries<T extends CollectionEntry>(
  entries: readonly T[],
  sort: UnitSortKey,
  filter: Element | null,
): T[] {
  return sortOwnedUnits(
    filter === null ? entries : entries.filter((entry) => entry.element === filter),
    sort,
  );
}
