import { canBeFodder } from "./fusion.ts";
import { unitContent } from "./owned-units.ts";
import type { PickResult } from "./unit-picker.ts";
import { type CollectionEntry, FUSION_FODDER_LIMIT, type StackQuantities } from "./unit-stacks.ts";

/**
 * The Fuse Units stage's draft (M4-06D, RESOLVED-80; ART_GUIDE → UI → Fusion stage). Pure helpers:
 * the base sits on the centre pedestal; the fodder fill five pedestals in pick order, owned rows
 * first and then one pedestal per stacked copy. The multi-select picker (M4-06N) adds fodder up to
 * the free pedestals; tapping a filled pedestal removes that one copy.
 */

export type FusionDraft = {
  /** The base unit's `owned_units` id, or "" before one is chosen. */
  readonly targetId: string;
  /** Owned-row fodder ids in pick order. */
  readonly fodderIds: readonly string[];
  /** Stacked copies per stack id, in pick order of the stacks. */
  readonly stacks: StackQuantities;
};

/** One filled fodder pedestal: an owned row, or one copy of a stack. */
export type FodderPedestal = { readonly kind: "row" | "stack"; readonly id: string };

/** The fodder pedestals' screen spots in fill order: the four corners, then bottom centre. */
export const FODDER_SPOTS = ["tl", "tr", "bl", "br", "bc"] as const;

export const EMPTY_DRAFT: FusionDraft = { targetId: "", fodderIds: [], stacks: {} };

/** The filled fodder pedestals in fill order: owned rows, then each stacked copy. */
export function fodderPedestals(draft: FusionDraft): FodderPedestal[] {
  return [
    ...draft.fodderIds.map((id) => ({ kind: "row" as const, id })),
    ...Object.entries(draft.stacks).flatMap(([id, copies]) =>
      Array.from({ length: copies }, () => ({ kind: "stack" as const, id })),
    ),
  ];
}

/** Fodder pedestals still empty. */
export function freePedestals(draft: FusionDraft): number {
  return Math.max(0, FUSION_FODDER_LIMIT - fodderPedestals(draft).length);
}

/** A new base: chosen from the base picker; the fodder are cleared. */
export function chooseBase(draft: FusionDraft, targetId: string): FusionDraft {
  return targetId === draft.targetId ? draft : { targetId, fodderIds: [], stacks: {} };
}

/** A tap on filled fodder pedestal `index`: an owned row leaves; a stack gives back one copy. */
export function removeFodderPedestal(draft: FusionDraft, index: number): FusionDraft {
  const pedestal = fodderPedestals(draft)[index];
  if (!pedestal) return draft;
  if (pedestal.kind === "row") {
    return { ...draft, fodderIds: draft.fodderIds.filter((id) => id !== pedestal.id) };
  }
  const { [pedestal.id]: copies = 0, ...rest } = draft.stacks;
  return { ...draft, stacks: copies > 1 ? { ...draft.stacks, [pedestal.id]: copies - 1 } : rest };
}

/**
 * The fodder picker's tiles: hide dedicated evolution materials, the base, and placed rows; a stack
 * shows only its unplaced copies. This is UI filtering only, not a change to fuse's server rules.
 * Material forms are level-1-only stackables without fixed EXP or a fusion effect. Levelable summon
 * fillers (including Sprites), EXP vessels, stat hobs and toads remain visible, as do heroes.
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
    if (entry.stackCount === null) {
      return entry.id === draft.targetId || draft.fodderIds.includes(entry.id) ? [] : [entry];
    }
    const left = entry.stackCount - (draft.stacks[entry.id] ?? 0);
    return left > 0 ? [{ ...entry, stackCount: left }] : [];
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

/** Tiles the base picker dims: stacks (split a copy out first) and units without content. */
export function baseIneligible(entries: readonly CollectionEntry[]): string[] {
  return entries
    .filter((entry) => entry.stackCount !== null || entry.maxLevel === null)
    .map((entry) => entry.id);
}

/**
 * The fodder picker's Confirm: picked rows join the pedestals after those already there, then
 * stacked copies; nothing past the free pedestals, the base, or a row already placed is added.
 */
export function addFodderPicks(draft: FusionDraft, picks: PickResult): FusionDraft {
  let room = freePedestals(draft);
  const fodderIds = [...draft.fodderIds];
  for (const id of picks.unitIds) {
    if (room <= 0) break;
    if (id === draft.targetId || fodderIds.includes(id)) continue;
    fodderIds.push(id);
    room -= 1;
  }
  const stacks: Record<string, number> = { ...draft.stacks };
  for (const [id, wanted] of Object.entries(picks.stacks)) {
    const copies = Math.min(Math.max(0, Math.trunc(wanted)), room);
    if (copies <= 0) continue;
    stacks[id] = (stacks[id] ?? 0) + copies;
    room -= copies;
  }
  return { ...draft, fodderIds, stacks };
}
