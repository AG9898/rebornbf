import {
  isOwnedUnitId,
  type OwnedUnitRow,
  type OwnedUnitView,
  sortOwnedUnits,
  toOwnedUnitView,
  type UnitSortKey,
} from "./owned-units.ts";

/**
 * Stacked units in the web app (M4-05C, RESOLVED-75): a player's untouched copies of a stackable
 * fodder or material unit are one `owned_unit_stacks` count per unit and form, not one
 * `owned_units` row per copy. These pure helpers merge stacks into the Units list, count owned
 * copies, and build the `{ "<stack id>": copies }` argument that `fuse` and `evolve` take.
 */

/** The `owned_unit_stacks` columns the pages select. */
export const UNIT_STACK_COLUMNS = "id, unit_id, form_id, count";

export type UnitStackRow = { id: string; unit_id: string; form_id: string; count: number };

/** Copies to spend per stack id, as `fuse`'s `p_fodder_stacks` and `evolve`'s `p_material_stacks`. */
export type StackQuantities = Readonly<Record<string, number>>;

/** The most fodder copies (rows plus stacked copies) one fusion takes (GAME_DESIGN §6). */
export const FUSION_FODDER_LIMIT = 5;

/** Stacks that still hold a copy; a stack spent to 0 keeps its row but is not shown. */
export function heldStacks(stacks: readonly UnitStackRow[]): UnitStackRow[] {
  return stacks.filter((stack) => Number(stack.count) > 0);
}

/** A stacked copy as the row it would split into: level 1, 0 EXP, burst levels 1, no type roll. */
export function stackCopyRow(stack: UnitStackRow, index = 0): OwnedUnitRow {
  return {
    id: index === 0 ? stack.id : `${stack.id}#${index}`,
    unit_id: stack.unit_id,
    form_id: stack.form_id,
    level: 1,
    exp: 0,
    bb_level: 1,
    sbb_level: 1,
    unit_type: null,
  };
}

/** One Units list tile: an owned row (`stackCount` null) or a stack (`id` is the stack id). */
export type CollectionEntry = OwnedUnitView & { stackCount: number | null };

/** The Units list's tiles: every owned row and one tile per held stack, sorted together. */
export function collectionEntries(
  rows: readonly OwnedUnitRow[],
  stacks: readonly UnitStackRow[],
  sort: UnitSortKey = "rarity",
): CollectionEntry[] {
  return sortOwnedUnits(
    [
      ...rows.map((row) => ({ ...toOwnedUnitView(row), stackCount: null })),
      ...heldStacks(stacks).map((stack) => ({
        ...toOwnedUnitView(stackCopyRow(stack)),
        stackCount: Number(stack.count),
      })),
    ],
    sort,
  );
}

/** Units the player owns, counting every stacked copy (the Units list's count plate). */
export function ownedCopyTotal(
  rows: readonly OwnedUnitRow[],
  stacks: readonly UnitStackRow[],
): number {
  return rows.length + heldStacks(stacks).reduce((sum, stack) => sum + Number(stack.count), 0);
}

/** The Units list link for a tile: a row's detail page, or the stack's detail page. */
export function collectionHref(entry: Pick<CollectionEntry, "id" | "stackCount">): string {
  return entry.stackCount === null ? `/units/${entry.id}` : `/units/stack/${entry.id}`;
}

/** Total copies across stack quantities. */
export function stackQuantityTotal(quantities: StackQuantities): number {
  return Object.values(quantities).reduce((sum, count) => sum + count, 0);
}

/**
 * Sets one stack's quantity, clamped to 0…min(held copies, `limit` minus every other copy already
 * chosen). A quantity of 0 drops the stack from the result.
 */
export function setStackQuantity(
  quantities: StackQuantities,
  stack: Pick<UnitStackRow, "id" | "count">,
  wanted: number,
  otherCopies: number,
  limit: number = FUSION_FODDER_LIMIT,
): Record<string, number> {
  const others = otherCopies + stackQuantityTotal(quantities) - (quantities[stack.id] ?? 0);
  const cap = Math.max(0, Math.min(Number(stack.count), limit - others));
  const next = Math.max(0, Math.min(Math.trunc(wanted), cap));
  const { [stack.id]: _, ...rest } = quantities;
  return next > 0 ? { ...rest, [stack.id]: next } : rest;
}

/** Stack quantities as the RPC argument: only positive whole counts, keys in a stable order. */
export function stackArgs(quantities: StackQuantities): Record<string, number> {
  return Object.fromEntries(
    Object.entries(quantities)
      .filter(([, count]) => Number.isInteger(count) && count > 0)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

/** Whether a value is a well-formed stack-quantity argument (uuid keys, positive whole counts). */
export function stackQuantitiesProblem(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "Choose valid stacked units.";
  }
  for (const [id, count] of Object.entries(value)) {
    if (!isOwnedUnitId(id) || !Number.isInteger(count) || (count as number) < 1) {
      return "Choose valid stacked units.";
    }
  }
  return null;
}

/**
 * The chosen stacked copies as rows for the fusion preview, one per copy (level 1, 0 EXP), so the
 * EXP, burst levels, and per-copy Zel match the same number of owned rows.
 */
export function stackCopies(
  stacks: readonly UnitStackRow[],
  quantities: StackQuantities,
): OwnedUnitRow[] {
  return stacks.flatMap((stack) =>
    Array.from({ length: quantities[stack.id] ?? 0 }, (_, index) => stackCopyRow(stack, index)),
  );
}
