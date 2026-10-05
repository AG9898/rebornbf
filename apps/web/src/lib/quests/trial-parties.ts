import { fillSquadSlots, SQUAD_SIZE, SQUAD_SLOTS, type SquadDraft } from "../squad/squad-editor.ts";

/**
 * Three-squad trial preparation (M6-01K, RESOLVED-95; GAME_DESIGN §7 → Trials flow and three
 * squads). A trial is prepared in three steps: Edit Squad fills three parties (each bound to a
 * saved squad slot, no unit in two parties), Reinforcement picks one ally per party (no ally for
 * two parties: each owned copy or guest serves once), and the prep
 * screen starts the battle with all of them. The choices travel in the URL as a `TrialPlan`.
 * Pure, so the pages stay thin; `start_battle` (M6-01J) re-checks everything.
 */

/** Parties a trial takes. */
export const TRIAL_PARTIES = 3;

/** Units one trial may field (three full parties). */
export const TRIAL_UNIT_LIMIT = TRIAL_PARTIES * SQUAD_SIZE;

/** Pell's Edit Squad hint (BFR copy). */
export const TRIAL_SQUAD_HINT =
  "Pick units for three squads. Up to fifteen, and no unit fights twice!";

/**
 * The parties a trial starts with, in entry order: each a distinct saved squad slot (0–9) and the
 * ally chosen for it (null for none). Empty parties are left out, so a plan has 1–3 entries.
 */
export type TrialPlan = { slots: readonly number[]; allies: readonly (string | null)[] };

type Query = Record<string, string | string[] | undefined>;

const ALLY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** `?s=0,1,2` as distinct saved squad slots, or null when absent or malformed. */
export function parsePlanSlots(query: Query): number[] | null {
  const raw = single(query.s);
  if (raw === undefined || !/^\d(,\d){0,2}$/.test(raw)) return null;
  const slots = raw.split(",").map(Number);
  return new Set(slots).size === slots.length ? slots : null;
}

/**
 * The plan in `?s=&a1=&a2=&a3=`; an absent or malformed ally, or one an earlier party already
 * has, is no ally. Null when `s` is bad.
 */
export function parseTrialPlan(query: Query): TrialPlan | null {
  const slots = parsePlanSlots(query);
  if (!slots) return null;
  const allies: (string | null)[] = [];
  slots.forEach((_, i) => {
    const ally = single(query[`a${i + 1}`]);
    const ok = ally !== undefined && ALLY_PATTERN.test(ally) && !allies.includes(ally);
    allies.push(ok ? ally : null);
  });
  return { slots, allies };
}

/** Allies the other parties have chosen, mapped to their 1-based party; Reinforcement locks them. */
export function otherPartyAllies(plan: TrialPlan, party: number): Map<string, number> {
  const taken = new Map<string, number>();
  plan.allies.forEach((ally, i) => {
    if (ally !== null && i !== party - 1) taken.set(ally, i + 1);
  });
  return taken;
}

/** Whether a value is a well-formed plan (the Server Action's shape check). */
export function isTrialPlan(value: unknown): value is TrialPlan {
  if (typeof value !== "object" || value === null) return false;
  const { slots, allies } = value as { slots?: unknown; allies?: unknown };
  if (!Array.isArray(slots) || !Array.isArray(allies)) return false;
  if (slots.length < 1 || slots.length > TRIAL_PARTIES || allies.length !== slots.length)
    return false;
  if (!slots.every((slot) => Number.isInteger(slot) && slot >= 0 && slot < SQUAD_SLOTS))
    return false;
  if (new Set(slots).size !== slots.length) return false;
  const chosen = allies.filter((ally) => ally !== null);
  if (new Set(chosen).size !== chosen.length) return false;
  return allies.every(
    (ally) => ally === null || (typeof ally === "string" && ALLY_PATTERN.test(ally)),
  );
}

function planQuery(plan: TrialPlan): URLSearchParams {
  const query = new URLSearchParams({ s: plan.slots.join(",") });
  plan.allies.forEach((ally, i) => {
    if (ally !== null) query.set(`a${i + 1}`, ally);
  });
  return query;
}

/** Edit Squad: `/start/[stage]`, keeping the party slots (allies are chosen again afterwards). */
export function trialEditHref(stage: string, slots?: readonly number[]): string {
  const base = `/start/${encodeURIComponent(stage)}`;
  return slots && slots.length > 0 ? `${base}?s=${slots.join(",")}` : base;
}

/** Reinforcement for party `party` (1-based), keeping the allies chosen so far. */
export function trialAllyHref(stage: string, plan: TrialPlan, party: number): string {
  const query = planQuery(plan);
  query.set("party", String(party));
  return `/start/${encodeURIComponent(stage)}?${query}`;
}

/** The prep screen showing squad `squad` (0-based). */
export function trialPrepHref(stage: string, plan: TrialPlan, squad = 0): string {
  const query = planQuery(plan);
  query.set("squad", String(squad));
  return `/start/${encodeURIComponent(stage)}/begin?${query}`;
}

/** `?party=` as a 1-based party of the plan, or null. */
export function parseAllyParty(query: Query, plan: TrialPlan): number | null {
  const raw = single(query.party);
  if (raw === undefined || !/^[1-3]$/.test(raw)) return null;
  const party = Number(raw);
  return party <= plan.slots.length ? party : null;
}

/** `?squad=` as a 0-based squad of the plan, defaulting to the first. */
export function parsePrepSquad(query: Query, plan: TrialPlan): number {
  const raw = single(query.squad);
  if (raw === undefined || !/^\d$/.test(raw)) return 0;
  return Math.min(Number(raw), plan.slots.length - 1);
}

/** The plan with party `party` (1-based) given `ally`; another party holding it loses it. */
export function withAlly(plan: TrialPlan, party: number, ally: string | null): TrialPlan {
  return {
    slots: plan.slots,
    allies: plan.allies.map((a, i) => (i === party - 1 ? ally : a === ally ? null : a)),
  };
}

/** Where choosing party `party`'s ally leads: the next party's Reinforcement, then the prep. */
export function afterAllyHref(stage: string, plan: TrialPlan, party: number): string {
  return party < plan.slots.length
    ? trialAllyHref(stage, plan, party + 1)
    : trialPrepHref(stage, plan);
}

/** Where Back on party `party`'s Reinforcement goes: the previous party, or Edit Squad. */
export function beforeAllyHref(stage: string, plan: TrialPlan, party: number): string {
  return party > 1 ? trialAllyHref(stage, plan, party - 1) : trialEditHref(stage, plan.slots);
}

/**
 * Edit Squad's three party slots: the plan's slots in order, then the lowest unused saved slots
 * (Party 1–3 default to Squads 1–3).
 */
export function editPartySlots(slots: readonly number[] | null): number[] {
  const chosen = [...(slots ?? [])].slice(0, TRIAL_PARTIES);
  for (let slot = 0; chosen.length < TRIAL_PARTIES && slot < SQUAD_SLOTS; slot += 1) {
    if (!chosen.includes(slot)) chosen.push(slot);
  }
  return chosen;
}

/** The next saved slot for party `index` in direction `step`, skipping the other parties' slots. */
export function stepPartySlot(slots: readonly number[], index: number, step: -1 | 1): number {
  const current = slots[index] ?? 0;
  let next = current;
  for (let i = 0; i < SQUAD_SLOTS; i += 1) {
    next = (next + step + SQUAD_SLOTS) % SQUAD_SLOTS;
    if (!slots.some((slot, j) => j !== index && slot === next)) return next;
  }
  return current;
}

/** Owned unit ids in every party except `index`; the picker dims them. */
export function otherPartyUnits(parties: readonly SquadDraft[], index: number): string[] {
  return parties.flatMap((party, i) => (i === index ? [] : party.unitIds));
}

/**
 * Fill party `index`'s empty slots with picked units, refusing any unit already in another party
 * (and anything `fillSquadSlots` refuses).
 */
export function addToParty(
  parties: readonly SquadDraft[],
  index: number,
  pickedIds: readonly string[],
  ownedIds: ReadonlySet<string>,
): SquadDraft[] {
  const taken = new Set(otherPartyUnits(parties, index));
  return parties.map((party, i) =>
    i === index
      ? fillSquadSlots(
          party,
          pickedIds.filter((id) => !taken.has(id)),
          ownedIds,
        )
      : party,
  );
}

/** Why the parties cannot go on to Reinforcement, or null. */
export function partiesProblem(parties: readonly SquadDraft[]): string | null {
  if (parties.length !== TRIAL_PARTIES) return "A trial takes three parties.";
  if ((parties[0]?.unitIds.length ?? 0) === 0) return "Add at least one unit to Party 1.";
  const all = parties.flatMap((party) => party.unitIds);
  if (new Set(all).size !== all.length) return "No unit may fight in two parties.";
  if (all.length > TRIAL_UNIT_LIMIT) return `A trial takes at most ${TRIAL_UNIT_LIMIT} units.`;
  return null;
}

/** The plan's slots after Edit Squad: every party with units, in party order. */
export function planSlots(slots: readonly number[], parties: readonly SquadDraft[]): number[] {
  return slots.filter((_, i) => (parties[i]?.unitIds.length ?? 0) > 0);
}

/** The `start_battle` choice for a plan: the first squad and its ally, then up to two reserves. */
export function trialStartChoice(plan: TrialPlan): {
  slot: number;
  ally: string | null;
  reserves: { slot: number; ally: string | null }[];
} {
  return {
    slot: plan.slots[0] ?? 0,
    ally: plan.allies[0] ?? null,
    reserves: plan.slots.slice(1).map((slot, i) => ({ slot, ally: plan.allies[i + 1] ?? null })),
  };
}
