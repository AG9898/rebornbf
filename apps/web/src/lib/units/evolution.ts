import {
  type Element,
  type EvolutionRecipe,
  type Form,
  MaterialItemSchema,
  type Unit,
} from "@bfr/data";
import crownShard from "@bfr/data/content/items/crown-shard.json";
import zenithCore from "@bfr/data/content/items/zenith-core.json";
import { formArtFile, type OwnedUnitRow, rarityLabel, unitContent } from "./owned-units.ts";
import { heldStacks, type UnitStackRow } from "./unit-stacks.ts";

/**
 * The evolution screen's plan (M4-02C, GAME_DESIGN §6 → Evolution materials): what the unit's
 * current form needs to reach its next form, what the player owns toward it, and which material
 * units would be spent. Pure; the `evolve` RPC re-checks everything and is the only writer.
 */

/** Material items spent by recipes (the Crown Shard, RESOLVED-67; the Zenith Core, RESOLVED-69). */
const MATERIAL_ITEM_NAMES: ReadonlyMap<string, string> = new Map(
  [crownShard, zenithCore].map((json) => {
    const item = MaterialItemSchema.parse(json);
    return [item.id, item.name];
  }),
);

/** A unit's display name from content (evolution materials included), or the raw id. */
export function materialUnitName(unitId: string): string {
  return unitContent(unitId)?.name ?? unitId;
}

export function materialItemName(itemId: string): string {
  return MATERIAL_ITEM_NAMES.get(itemId) ?? itemId;
}

/** The squad columns the plan needs: units in any saved squad cannot be spent. */
export type SquadUseRow = { unit_ids: string[] };
export type OwnedItemRow = { item_id: string; count: number };

export type EvolutionFormView = {
  id: string;
  name: string;
  rarityLabel: string;
  maxLevel: number;
  illustration: string | null;
  /** The form's battle-idle sprite (the evolve screen's centrepiece, M4-06L), when exported. */
  sprite: string | null;
};

export type MaterialUnitNeed = {
  unitId: string;
  name: string;
  /** The material's element (its icon frame) and square thumb, when known (M4-06L). */
  element: Element | null;
  thumb: string | null;
  count: number;
  /** Spendable copies owned: not the unit itself and not in a squad, stacks included. */
  owned: number;
  /** How many of `owned` are stacked copies (M4-05C); these are spent first. */
  stacked: number;
  /** Copies of this unit sitting in a squad, which must be removed first. */
  inSquad: number;
};

export type MaterialItemNeed = { itemId: string; name: string; count: number; owned: number };

export type EvolutionPlan = {
  from: EvolutionFormView;
  next: EvolutionFormView;
  /** 7★ → Omni (RESOLVED-20). */
  omni: boolean;
  level: number;
  levelReady: boolean;
  units: MaterialUnitNeed[];
  items: MaterialItemNeed[];
  zel: number;
  zelOwned: number;
  /** The material rows the RPC would consume; complete only when every unit need is met. */
  materialIds: string[];
  /** Stacked copies the RPC would consume, `{ "<stack id>": copies }` (M4-05C). */
  materialStacks: Record<string, number>;
  /** Player-facing reasons the evolution cannot run yet; empty when it can. */
  problems: string[];
};

function formView(unitId: string, form: Form): EvolutionFormView {
  const art = formArtFile(unitId, form.rarity);
  return {
    id: form.id,
    name: form.name,
    rarityLabel: rarityLabel(form.rarity),
    maxLevel: form.maxLevel,
    illustration: art ? `/assets/units/${unitId}/illustration-${art}.png` : null,
    sprite: art ? `/assets/units/${unitId}/battle-idle-${art}.png` : null,
  };
}

/** A material unit's element and thumb from its first (only) form's art. */
function materialArt(unitId: string): { element: Element | null; thumb: string | null } {
  const unit = unitContent(unitId);
  const form = unit?.forms[0];
  const art = unit && form ? formArtFile(unitId, form.rarity) : null;
  return {
    element: unit?.element ?? null,
    thumb: art ? `/assets/ui/cards/thumb/${unitId}-${art}.webp` : null,
  };
}

/** The current form, its recipe, and the next form, or null when the unit cannot evolve. */
export function nextEvolution(
  row: Pick<OwnedUnitRow, "unit_id" | "form_id">,
): { unit: Unit; form: Form; recipe: EvolutionRecipe; next: Form } | null {
  const unit = unitContent(row.unit_id);
  if (!unit) return null;
  const index = unit.forms.findIndex((form) => form.id === row.form_id);
  const form = unit.forms[index];
  const next = unit.forms[index + 1];
  if (!form?.evolution || !next) return null;
  return { unit, form, recipe: form.evolution, next };
}

function sortSpendFirst(a: OwnedUnitRow, b: OwnedUnitRow): number {
  return (
    Number(a.level) - Number(b.level) || Number(a.exp) - Number(b.exp) || a.id.localeCompare(b.id)
  );
}

/**
 * Builds the evolution plan for `target` from the player's owned units, squads, items, and Zel.
 * Stacked copies (untouched, M4-05C) are spent first, then owned rows lowest level first (then
 * lowest EXP, then id) so the choice is stable. Null when the target's form has no recipe or next
 * form.
 */
export function evolutionPlan(
  target: OwnedUnitRow,
  owned: readonly OwnedUnitRow[],
  squads: readonly SquadUseRow[],
  items: readonly OwnedItemRow[],
  zelOwned: number,
  stacks: readonly UnitStackRow[] = [],
): EvolutionPlan | null {
  const evolution = nextEvolution(target);
  if (!evolution) return null;
  const { unit, form, recipe, next } = evolution;

  const locked = new Set<string>();
  for (const squad of squads) {
    for (const id of squad.unit_ids) locked.add(id);
  }

  const problems: string[] = [];
  const level = Number(target.level);
  const levelReady = level >= form.maxLevel;
  if (!levelReady) problems.push(`Reach level ${form.maxLevel} first.`);

  const materialIds: string[] = [];
  const materialStacks: Record<string, number> = {};
  const held = heldStacks(stacks);
  const units = recipe.units.map(({ unit: unitId, count }): MaterialUnitNeed => {
    const copies = owned.filter((row) => row.unit_id === unitId && row.id !== target.id);
    const spendable = copies.filter((row) => !locked.has(row.id)).sort(sortSpendFirst);
    let fromStacks = 0;
    let stacked = 0;
    for (const stack of held.filter((s) => s.unit_id === unitId)) {
      stacked += Number(stack.count);
      const take = Math.min(Number(stack.count), count - fromStacks);
      if (take > 0) {
        materialStacks[stack.id] = take;
        fromStacks += take;
      }
    }
    const available = spendable.length + stacked;
    const name = materialUnitName(unitId);
    const inSquad = copies.length - spendable.length;
    if (available < count) {
      problems.push(
        inSquad > 0 && copies.length + stacked >= count
          ? `Take ${name} out of your squads first.`
          : `Needs ${count - available} more ${name}.`,
      );
    }
    materialIds.push(...spendable.slice(0, count - fromStacks).map((row) => row.id));
    return { unitId, name, ...materialArt(unitId), count, owned: available, stacked, inSquad };
  });

  const itemCounts = new Map(items.map((row) => [row.item_id, Number(row.count)]));
  const itemNeeds = (recipe.items ?? []).map(({ item: itemId, count }): MaterialItemNeed => {
    const ownedCount = itemCounts.get(itemId) ?? 0;
    const name = materialItemName(itemId);
    if (ownedCount < count) problems.push(`Needs ${count - ownedCount} more ${name}.`);
    return { itemId, name, count, owned: ownedCount };
  });

  if (zelOwned < recipe.zel) {
    problems.push(`Needs ${(recipe.zel - zelOwned).toLocaleString("en-US")} more Zel.`);
  }

  return {
    from: formView(unit.id, form),
    next: formView(unit.id, next),
    omni: next.rarity === "omni",
    level,
    levelReady,
    units,
    items: itemNeeds,
    zel: recipe.zel,
    zelOwned,
    materialIds,
    materialStacks,
    problems,
  };
}

/** The evolve screen's red status strip labels (M4-06L, ART_GUIDE → UI → Evolve screen). */
export type EvolveBlocker = "Insufficient Units" | "Insufficient Zel" | "Insufficient Level";

/**
 * Why the plan cannot run, as the status strip's short labels: missing material units or items,
 * missing Zel, then a level below the form's cap. Empty when the evolution can run.
 */
export function evolveBlockers(
  plan: Pick<EvolutionPlan, "levelReady" | "zel" | "zelOwned"> & {
    units: readonly { owned: number; count: number }[];
    items: readonly { owned: number; count: number }[];
  },
): EvolveBlocker[] {
  const blockers: EvolveBlocker[] = [];
  const short = (need: { owned: number; count: number }): boolean => need.owned < need.count;
  if (plan.units.some(short) || plan.items.some(short)) blockers.push("Insufficient Units");
  if (plan.zelOwned < plan.zel) blockers.push("Insufficient Zel");
  if (!plan.levelReady) blockers.push("Insufficient Level");
  return blockers;
}

/** Strips the RPC's `evolve: ` prefix and capitalises a player-facing error message. */
export function evolveErrorMessage(code: string | undefined, message: string): string {
  if (code !== "22023" && code !== "P0001") return "The evolution could not be completed.";
  const text = message.replace(/^evolve: /, "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
