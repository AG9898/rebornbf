import { canBeFodder, fodderCopyGrants, fusionBaseMaxed } from "./fusion.ts";
import { type OwnedUnitRow, unitContent } from "./owned-units.ts";
import {
  type CollectionEntry,
  FUSION_FODDER_LIMIT,
  FUSION_STACK_SLOT_MAX,
  stackCopies,
  stackCopyRow,
  type UnitStackRow,
} from "./unit-stacks.ts";

/**
 * The Fuse Units stage's draft (M4-06D, RESOLVED-80; ART_GUIDE → UI → Fusion stage). Pure helpers:
 * the base sits on the centre pedestal; the fodder fill up to five slots in pick order (RESOLVED-90):
 * an owned row is one slot (×1), a stack is one slot of 1–99 copies. Adding and removing work one
 * copy at a time; a stack slot that reaches 0 copies empties.
 */

/** One filled fodder slot: an owned row (always ×1) or a stack with its chosen copies. */
export type FodderSlot = {
  readonly kind: "row" | "stack";
  readonly id: string;
  readonly copies: number;
};

export type FusionDraft = {
  /** The base unit's `owned_units` id, or "" before one is chosen. */
  readonly targetId: string;
  /** The filled fodder slots in pick order. */
  readonly slots: readonly FodderSlot[];
};

/** The fodder pedestals' screen spots in slot order: the four corners, then bottom centre. */
export const FODDER_SPOTS = ["tl", "tr", "bl", "br", "bc"] as const;

export const EMPTY_DRAFT: FusionDraft = { targetId: "", slots: [] };

/** The owned-row fodder ids, in slot order (`fuse`'s `p_fodder`). */
export function draftFodderIds(draft: FusionDraft): string[] {
  return draft.slots.filter((slot) => slot.kind === "row").map((slot) => slot.id);
}

/** The stacked copies per stack id (`fuse`'s `p_fodder_stacks`). */
export function draftStacks(draft: FusionDraft): Record<string, number> {
  return Object.fromEntries(
    draft.slots.filter((slot) => slot.kind === "stack").map((slot) => [slot.id, slot.copies]),
  );
}

/** Every fodder copy in the draft (rows plus stacked copies), as `fuse` prices them. */
export function draftCopies(draft: FusionDraft): number {
  return draft.slots.reduce((sum, slot) => sum + slot.copies, 0);
}

/** Fodder slots still empty. */
export function freeSlots(draft: FusionDraft): number {
  return Math.max(0, FUSION_FODDER_LIMIT - draft.slots.length);
}

/** A new base: chosen from the base picker; the fodder are cleared. */
export function chooseBase(draft: FusionDraft, targetId: string): FusionDraft {
  return targetId === draft.targetId ? draft : { targetId, slots: [] };
}

/** Remove All: every fodder slot is cleared; the base stays. */
export function clearFodder(draft: FusionDraft): FusionDraft {
  return draft.slots.length === 0 ? draft : { ...draft, slots: [] };
}

/**
 * Adds one copy of a picker tile (RESOLVED-90 item 2). A row opens a slot of its own; a stack adds
 * to its slot, opening one if needed, up to its held copies and 99. Nothing changes when the tile
 * is the base, a row already placed, a stack at its limit, or no slot is free.
 */
export function addFodderCopy(
  draft: FusionDraft,
  entry: Pick<CollectionEntry, "id" | "stackCount">,
): FusionDraft {
  if (entry.stackCount === null) {
    if (entry.id === draft.targetId || draft.slots.some((slot) => slot.id === entry.id)) {
      return draft;
    }
    if (freeSlots(draft) === 0) return draft;
    return { ...draft, slots: [...draft.slots, { kind: "row", id: entry.id, copies: 1 }] };
  }
  const index = draft.slots.findIndex((slot) => slot.kind === "stack" && slot.id === entry.id);
  const max = Math.min(entry.stackCount, FUSION_STACK_SLOT_MAX);
  if (index < 0) {
    if (freeSlots(draft) === 0 || max < 1) return draft;
    return { ...draft, slots: [...draft.slots, { kind: "stack", id: entry.id, copies: 1 }] };
  }
  const slot = draft.slots[index] as FodderSlot;
  if (slot.copies >= max) return draft;
  const slots = [...draft.slots];
  slots[index] = { ...slot, copies: slot.copies + 1 };
  return { ...draft, slots };
}

/** Removes one copy from fodder slot `index`; a row, or a stack slot at 0, empties its slot. */
export function removeFodderCopy(draft: FusionDraft, index: number): FusionDraft {
  const slot = draft.slots[index];
  if (!slot) return draft;
  if (slot.copies > 1) {
    const slots = [...draft.slots];
    slots[index] = { ...slot, copies: slot.copies - 1 };
    return { ...draft, slots };
  }
  return { ...draft, slots: draft.slots.filter((_, i) => i !== index) };
}

/**
 * The fodder picker's tiles: hide dedicated evolution materials and the base. Placed rows stay (the
 * picker badges and dims them) and a stack shows only its unplaced copies, down to ×0, so the grid
 * never reflows under a held finger (M4-01F). This is UI filtering only, not a change to fuse's
 * server rules. Material forms are level-1-only stackables without fixed EXP or a fusion effect.
 * Levelable summon fillers (including Sprites), EXP vessels, stat hobs and toads remain visible.
 */
export function fodderPickerEntries<T extends CollectionEntry>(
  entries: readonly T[],
  draft: FusionDraft,
): T[] {
  return entries.flatMap((entry) => {
    const unit = unitContent(entry.unitId);
    const form = unit?.forms.find((f) => f.id === entry.formId);
    if (
      unit?.stackable &&
      form?.maxLevel === 1 &&
      form.fusionExp === undefined &&
      form.fusionEffect === undefined
    ) {
      return [];
    }
    if (entry.stackCount === null) return entry.id === draft.targetId ? [] : [entry];
    const placed = draft.slots.find((slot) => slot.kind === "stack" && slot.id === entry.id);
    return [{ ...entry, stackCount: Math.max(0, entry.stackCount - (placed?.copies ?? 0)) }];
  });
}

/**
 * Tiles the fodder picker dims: saved squad members (`blocked`), units without content, and
 * forms that give no fusion EXP (the `fuse` RPC rejects them).
 */
export function fodderIneligible(
  entries: readonly CollectionEntry[],
  blocked: readonly string[],
): string[] {
  return entries
    .filter(
      (entry) =>
        (entry.stackCount === null && blocked.includes(entry.id)) ||
        entry.maxLevel === null ||
        !canBeFodder(entry.unitId, entry.formId),
    )
    .map((entry) => entry.id);
}

/**
 * Tiles the base picker dims: stacks (split a copy out first), units without content, and owned
 * rows (from `rows`, when given) that nothing could improve (`fusionBaseMaxed`, RESOLVED-90 item 4).
 */
export function baseIneligible(
  entries: readonly CollectionEntry[],
  rows: readonly OwnedUnitRow[] = [],
): string[] {
  const maxed = new Set(rows.filter(fusionBaseMaxed).map((row) => row.id));
  return entries
    .filter((entry) => entry.stackCount !== null || entry.maxLevel === null || maxed.has(entry.id))
    .map((entry) => entry.id);
}

/** The draft's fodder as `fusionPreview` takes them: placed rows, then one row per stacked copy. */
export function draftFodderRows(
  draft: FusionDraft,
  rows: readonly OwnedUnitRow[],
  stacks: readonly UnitStackRow[],
): OwnedUnitRow[] {
  const ids = new Set(draftFodderIds(draft));
  return [...rows.filter((row) => ids.has(row.id)), ...stackCopies(stacks, draftStacks(draft))];
}

/**
 * One tap (or one hold repeat) on a fodder picker tile (RESOLVED-90 items 2–3, M4-01F): adds one
 * copy with `addFodderCopy` only while that copy still grants something to the base at the plain
 * ×1 rate (`fodderCopyGrants`). Returns `draft` itself when nothing may be added: no base, no free
 * slot, the row already placed, the stack at its held copies or 99, or the no-wasted-pick cutoff.
 * `entry` carries the tile's full held count, not the picker's remaining-copies display.
 */
export function addGrantingFodderCopy(
  draft: FusionDraft,
  entry: Pick<CollectionEntry, "id" | "stackCount">,
  rows: readonly OwnedUnitRow[],
  stacks: readonly UnitStackRow[],
): FusionDraft {
  const target = rows.find((row) => row.id === draft.targetId);
  if (!target) return draft;
  const next = addFodderCopy(draft, entry);
  if (next === draft) return draft;
  const stack = entry.stackCount === null ? undefined : stacks.find((s) => s.id === entry.id);
  const candidate = stack ? stackCopyRow(stack) : rows.find((row) => row.id === entry.id);
  if (!candidate) return draft;
  return fodderCopyGrants(target, draftFodderRows(draft, rows, stacks), candidate) ? next : draft;
}
