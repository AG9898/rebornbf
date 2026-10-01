/**
 * Squad editor state (M3-03B). Pure, so the client component stays thin and this is testable.
 * The server (`save_squad`) is the authority: it re-checks everything here, plus ownership.
 */

/** Saved squad size limit (GAME_DESIGN §2): 1–5 units; allies are chosen per quest. */
export const SQUAD_SIZE = 5;

/** Squad slots a player may save, matching the `squads.slot` check. */
export const SQUAD_SLOTS = 10;

/** The `squads` columns the squad page selects. */
export const SQUAD_COLUMNS = "slot, unit_ids, leader_index";

export type SquadRow = {
  slot: number;
  unit_ids: string[];
  leader_index: number;
};

export type SquadDraft = {
  /** Owned unit ids in squad order (slots p0–p4). */
  unitIds: readonly string[];
  leaderIndex: number;
};

export const EMPTY_DRAFT: SquadDraft = { unitIds: [], leaderIndex: 0 };

/**
 * A stored squad as a draft, dropping units the player no longer owns (the leader falls back to
 * the first remaining unit if its unit is gone).
 */
export function draftFromRow(row: SquadRow | null, ownedIds: ReadonlySet<string>): SquadDraft {
  if (!row) return EMPTY_DRAFT;
  const leaderId = row.unit_ids[row.leader_index];
  const unitIds = row.unit_ids.filter((id) => ownedIds.has(id)).slice(0, SQUAD_SIZE);
  const leaderIndex = leaderId ? Math.max(0, unitIds.indexOf(leaderId)) : 0;
  return { unitIds, leaderIndex };
}

/**
 * Add a unit to the end of the squad, or remove it if it is already in. Adding to a full squad
 * does nothing. Removing keeps the same leader unit when it stays in the squad.
 */
export function toggleSquadUnit(draft: SquadDraft, unitId: string): SquadDraft {
  const index = draft.unitIds.indexOf(unitId);
  if (index === -1) {
    if (draft.unitIds.length >= SQUAD_SIZE) return draft;
    return { ...draft, unitIds: [...draft.unitIds, unitId] };
  }
  const unitIds = draft.unitIds.filter((id) => id !== unitId);
  let leaderIndex = draft.leaderIndex;
  if (index === draft.leaderIndex) leaderIndex = 0;
  else if (index < draft.leaderIndex) leaderIndex -= 1;
  return { ...draft, unitIds, leaderIndex };
}

/** Confirm a multi-pick into free pedestals, keeping the leader unchanged. */
export function fillSquadSlots(
  draft: SquadDraft,
  pickedIds: readonly string[],
  ownedIds: ReadonlySet<string>,
): SquadDraft {
  const unitIds = [...draft.unitIds];
  const empty = pedestalOrder(draft).filter((position) => position >= unitIds.length);
  const seen = new Set(unitIds);
  for (const id of pickedIds) {
    if (!ownedIds.has(id) || seen.has(id)) continue;
    const position = empty.shift();
    if (position === undefined) break;
    unitIds[position] = id;
    seen.add(id);
  }
  return { ...draft, unitIds };
}

export function setLeader(draft: SquadDraft, index: number): SquadDraft {
  if (index < 0 || index >= draft.unitIds.length) return draft;
  return { ...draft, leaderIndex: index };
}

/** Why a draft cannot be saved, or null. Mirrors the size and leader checks in `save_squad`. */
export function draftProblem(draft: SquadDraft): string | null {
  if (draft.unitIds.length === 0) return "Add at least one unit.";
  if (draft.unitIds.length > SQUAD_SIZE) return `A squad holds at most ${SQUAD_SIZE} units.`;
  if (new Set(draft.unitIds).size !== draft.unitIds.length) return "A unit can join only once.";
  if (draft.leaderIndex < 0 || draft.leaderIndex >= draft.unitIds.length) {
    return "Choose a leader from the squad.";
  }
  return null;
}

/**
 * Squad positions in the Manage Squad pedestal order (M3-03F): the leader's position first (the
 * centre pedestal), then the other four positions in squad order (top left, top right, bottom
 * left, bottom right). A position past the squad's last unit is an empty pedestal.
 */
export function pedestalOrder(draft: SquadDraft): number[] {
  const leader =
    draft.leaderIndex >= 0 && draft.leaderIndex < draft.unitIds.length ? draft.leaderIndex : 0;
  const rest = Array.from({ length: SQUAD_SIZE }, (_, i) => i).filter((i) => i !== leader);
  return [leader, ...rest];
}

/** The squad slot an arrow moves to from `slot`, wrapping round the ten slots. */
export function stepSquadSlot(slot: number, step: -1 | 1): number {
  return (slot + step + SQUAD_SLOTS) % SQUAD_SLOTS;
}

/** A `?slot=` query value as a squad slot (0–9), defaulting to 0. */
export function parseSquadSlot(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || !/^\d$/.test(raw)) return 0;
  return Number(raw);
}

export function draftsEqual(a: SquadDraft, b: SquadDraft): boolean {
  return (
    a.leaderIndex === b.leaderIndex &&
    a.unitIds.length === b.unitIds.length &&
    a.unitIds.every((id, i) => id === b.unitIds[i])
  );
}
