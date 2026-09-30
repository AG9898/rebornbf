import {
  type EvolutionRecipe,
  type Form,
  MaterialItemSchema,
  type Unit,
  UnitSchema,
} from "@bfr/data";
import crownShard from "@bfr/data/content/items/crown-shard.json";
import zenithCore from "@bfr/data/content/items/zenith-core.json";
import cinderCairn from "@bfr/data/content/units/cinder-cairn.json";
import cinderColossus from "@bfr/data/content/units/cinder-colossus.json";
import cinderEffigy from "@bfr/data/content/units/cinder-effigy.json";
import cinderMote from "@bfr/data/content/units/cinder-mote.json";
import duskCairn from "@bfr/data/content/units/dusk-cairn.json";
import duskColossus from "@bfr/data/content/units/dusk-colossus.json";
import duskEffigy from "@bfr/data/content/units/dusk-effigy.json";
import duskMote from "@bfr/data/content/units/dusk-mote.json";
import duskUrn from "@bfr/data/content/units/dusk-urn.json";
import glintCairn from "@bfr/data/content/units/glint-cairn.json";
import glintColossus from "@bfr/data/content/units/glint-colossus.json";
import glintEffigy from "@bfr/data/content/units/glint-effigy.json";
import glintMote from "@bfr/data/content/units/glint-mote.json";
import glintUrn from "@bfr/data/content/units/glint-urn.json";
import mossCairn from "@bfr/data/content/units/moss-cairn.json";
import mossColossus from "@bfr/data/content/units/moss-colossus.json";
import mossEffigy from "@bfr/data/content/units/moss-effigy.json";
import mossMote from "@bfr/data/content/units/moss-mote.json";
import prismCairn from "@bfr/data/content/units/prism-cairn.json";
import rillCairn from "@bfr/data/content/units/rill-cairn.json";
import rillColossus from "@bfr/data/content/units/rill-colossus.json";
import rillEffigy from "@bfr/data/content/units/rill-effigy.json";
import rillMote from "@bfr/data/content/units/rill-mote.json";
import voltCairn from "@bfr/data/content/units/volt-cairn.json";
import voltColossus from "@bfr/data/content/units/volt-colossus.json";
import voltEffigy from "@bfr/data/content/units/volt-effigy.json";
import voltMote from "@bfr/data/content/units/volt-mote.json";
import wyrmCoffer from "@bfr/data/content/units/wyrm-coffer.json";
import { formArtFile, type OwnedUnitRow, rarityLabel, unitContent } from "./owned-units.ts";

/**
 * The evolution screen's plan (M4-02C, GAME_DESIGN §6 → Evolution materials): what the unit's
 * current form needs to reach its next form, what the player owns toward it, and which material
 * units would be spent. Pure; the `evolve` RPC re-checks everything and is the only writer.
 */

/** The evolution material units (RESOLVED-66), which the collection content map does not carry. */
const MATERIAL_UNITS: ReadonlyMap<string, Unit> = new Map(
  [
    cinderCairn,
    cinderColossus,
    cinderEffigy,
    cinderMote,
    duskCairn,
    duskColossus,
    duskEffigy,
    duskMote,
    duskUrn,
    glintCairn,
    glintColossus,
    glintEffigy,
    glintMote,
    glintUrn,
    mossCairn,
    mossColossus,
    mossEffigy,
    mossMote,
    prismCairn,
    rillCairn,
    rillColossus,
    rillEffigy,
    rillMote,
    voltCairn,
    voltColossus,
    voltEffigy,
    voltMote,
    wyrmCoffer,
  ].map((json) => {
    const unit = UnitSchema.parse(json);
    return [unit.id, unit];
  }),
);

/** Material items spent by recipes (the Crown Shard, RESOLVED-67; the Zenith Core, RESOLVED-69). */
const MATERIAL_ITEM_NAMES: ReadonlyMap<string, string> = new Map(
  [crownShard, zenithCore].map((json) => {
    const item = MaterialItemSchema.parse(json);
    return [item.id, item.name];
  }),
);

/** A unit's display name: collection content, then the evolution materials, then the raw id. */
export function materialUnitName(unitId: string): string {
  return unitContent(unitId)?.name ?? MATERIAL_UNITS.get(unitId)?.name ?? unitId;
}

export function materialItemName(itemId: string): string {
  return MATERIAL_ITEM_NAMES.get(itemId) ?? itemId;
}

/** The squad columns the plan needs: units in any squad or ally slot cannot be spent. */
export type SquadUseRow = { unit_ids: string[]; ally_unit_id: string | null };
export type OwnedItemRow = { item_id: string; count: number };

export type EvolutionFormView = {
  id: string;
  name: string;
  rarityLabel: string;
  maxLevel: number;
  illustration: string | null;
};

export type MaterialUnitNeed = {
  unitId: string;
  name: string;
  count: number;
  /** Spendable copies owned: not the unit itself and not in a squad or ally slot. */
  owned: number;
  /** Copies of this unit sitting in a squad or ally slot, which must be removed first. */
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
 * Material copies are picked lowest level first (then lowest EXP, then id) so the choice is stable.
 * Null when the target's form has no recipe or next form.
 */
export function evolutionPlan(
  target: OwnedUnitRow,
  owned: readonly OwnedUnitRow[],
  squads: readonly SquadUseRow[],
  items: readonly OwnedItemRow[],
  zelOwned: number,
): EvolutionPlan | null {
  const evolution = nextEvolution(target);
  if (!evolution) return null;
  const { unit, form, recipe, next } = evolution;

  const locked = new Set<string>();
  for (const squad of squads) {
    for (const id of squad.unit_ids) locked.add(id);
    if (squad.ally_unit_id) locked.add(squad.ally_unit_id);
  }

  const problems: string[] = [];
  const level = Number(target.level);
  const levelReady = level >= form.maxLevel;
  if (!levelReady) problems.push(`Reach level ${form.maxLevel} first.`);

  const materialIds: string[] = [];
  const units = recipe.units.map(({ unit: unitId, count }): MaterialUnitNeed => {
    const copies = owned.filter((row) => row.unit_id === unitId && row.id !== target.id);
    const spendable = copies.filter((row) => !locked.has(row.id)).sort(sortSpendFirst);
    const name = materialUnitName(unitId);
    const inSquad = copies.length - spendable.length;
    if (spendable.length < count) {
      problems.push(
        inSquad > 0 && copies.length >= count
          ? `Take ${name} out of your squads first.`
          : `Needs ${count - spendable.length} more ${name}.`,
      );
    }
    materialIds.push(...spendable.slice(0, count).map((row) => row.id));
    return { unitId, name, count, owned: spendable.length, inSquad };
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
    problems,
  };
}

/** Strips the RPC's `evolve: ` prefix and capitalises a player-facing error message. */
export function evolveErrorMessage(code: string | undefined, message: string): string {
  if (code !== "22023" && code !== "P0001") return "The evolution could not be completed.";
  const text = message.replace(/^evolve: /, "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
