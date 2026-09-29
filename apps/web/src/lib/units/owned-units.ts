import { type Element, type Form, type Rarity, type Stats, type Unit, UnitSchema } from "@bfr/data";
import aurelle from "@bfr/data/content/units/aurelle.json";
import brand from "@bfr/data/content/units/brand.json";
import brassCrucible from "@bfr/data/content/units/brass-crucible.json";
import cinderSprite from "@bfr/data/content/units/cinder-sprite.json";
import duskSprite from "@bfr/data/content/units/dusk-sprite.json";
import garrick from "@bfr/data/content/units/garrick.json";
import glintSprite from "@bfr/data/content/units/glint-sprite.json";
import maren from "@bfr/data/content/units/maren.json";
import morrick from "@bfr/data/content/units/morrick.json";
import mossSprite from "@bfr/data/content/units/moss-sprite.json";
import placeholderEmber from "@bfr/data/content/units/placeholder-ember.json";
import placeholderTide from "@bfr/data/content/units/placeholder-tide.json";
import rillSprite from "@bfr/data/content/units/rill-sprite.json";
import rook from "@bfr/data/content/units/rook.json";
import silverCrucible from "@bfr/data/content/units/silver-crucible.json";
import solen from "@bfr/data/content/units/solen.json";
import vespera from "@bfr/data/content/units/vespera.json";
import voltSprite from "@bfr/data/content/units/volt-sprite.json";

/**
 * The unit collection (M3-03A): the player's `owned_units` rows, read under RLS, joined with the
 * unit content from `@bfr/data` for display. Pure, so the pages stay thin and this is testable.
 */

/** The `owned_units` columns the collection pages select. */
export const OWNED_UNIT_COLUMNS = "id, unit_id, form_id, level, exp";

export type OwnedUnitRow = {
  id: string;
  unit_id: string;
  form_id: string;
  level: number;
  exp: number;
};

export type OwnedUnitView = {
  /** The `owned_units` row id (a uuid), used in the detail URL. */
  id: string;
  unitId: string;
  formId: string;
  name: string;
  /** The form's title, e.g. "Ember Knight"; null when the content is missing. */
  formName: string | null;
  element: Element | null;
  rarity: Rarity | null;
  rarityLabel: string;
  level: number;
  maxLevel: number | null;
  exp: number;
  /** The form's level-1 and max-level stats (`stats.base` / `stats.max`). */
  stats: { base: Stats; max: Stats } | null;
  /** The stats at the unit's current level when known exactly (level 1 or max level). */
  currentStats: Stats | null;
  /** Web path of the form's splash, when the unit has exported art for it. */
  illustration: string | null;
  /** Web path of the form's battle-idle sprite, when the unit has exported art for it. */
  sprite: string | null;
  /**
   * Web path of the form's square thumbnail icon (256×256, built from the splash by the face-point
   * rule in `art/ui/ui.json` `cards.thumb`), when the unit has exported art for it.
   */
  thumb: string | null;
};

const UNIT_CONTENT: ReadonlyMap<string, Unit> = new Map(
  [
    aurelle,
    brand,
    brassCrucible,
    cinderSprite,
    duskSprite,
    garrick,
    glintSprite,
    maren,
    morrick,
    mossSprite,
    placeholderEmber,
    placeholderTide,
    rillSprite,
    rook,
    silverCrucible,
    solen,
    vespera,
    voltSprite,
  ].map((json) => {
    const unit = UnitSchema.parse(json);
    return [unit.id, unit];
  }),
);

/** Units with exported art under `public/assets/units/<id>/` (3★ through Omni, or one filler form). */
const UNITS_WITH_ART: ReadonlySet<string> = new Set([
  "aurelle",
  "brand",
  "brass-crucible",
  "cinder-sprite",
  "dusk-sprite",
  "glint-sprite",
  "moss-sprite",
  "rill-sprite",
  "silver-crucible",
  "volt-sprite",
  "garrick",
  "maren",
  "morrick",
  "rook",
  "solen",
  "vespera",
]);

/** A unit's content, or undefined when `unitId` is not in `@bfr/data`. */
export function unitContent(unitId: string): Unit | undefined {
  return UNIT_CONTENT.get(unitId);
}

export function rarityLabel(rarity: Rarity | null): string {
  if (rarity === null) return "?";
  return rarity === "omni" ? "Omni" : `${rarity}★`;
}

/** Summon filler units whose single 2★ form has exported art. */
const FILLER_UNITS_2STAR: ReadonlySet<string> = new Set([
  "brass-crucible",
  "cinder-sprite",
  "dusk-sprite",
  "glint-sprite",
  "moss-sprite",
  "rill-sprite",
  "volt-sprite",
]);

/**
 * The art file suffix for a form (`2star`…`7star`, `omni`), or null if the unit has none. Main
 * units have no 2★ art; only the summon filler units have a 2★ form with art.
 */
export function formArtFile(unitId: string, rarity: Rarity): string | null {
  if (!UNITS_WITH_ART.has(unitId)) return null;
  if (rarity === "omni") return "omni";
  if (rarity === 2) return FILLER_UNITS_2STAR.has(unitId) ? "2star" : null;
  return rarity >= 3 ? `${rarity}star` : null;
}

/**
 * Stats at `level` when the form data pins them exactly: level 1 is `stats.base` and `maxLevel`
 * is `stats.max`. Levels in between wait for the stat growth curve (M1-08D), so they give null.
 */
export function exactStatsAtLevel(form: Form, level: number): Stats | null {
  if (level === form.maxLevel) return form.stats.max;
  if (level === 1) return form.stats.base;
  return null;
}

export function toOwnedUnitView(row: OwnedUnitRow): OwnedUnitView {
  const unit = unitContent(row.unit_id);
  const form = unit?.forms.find((f) => f.id === row.form_id);
  const level = Number(row.level);
  const art = unit && form ? formArtFile(unit.id, form.rarity) : null;
  return {
    id: row.id,
    unitId: row.unit_id,
    formId: row.form_id,
    name: unit?.name ?? row.unit_id,
    formName: form?.name ?? null,
    element: unit?.element ?? null,
    rarity: form?.rarity ?? null,
    rarityLabel: rarityLabel(form?.rarity ?? null),
    level,
    maxLevel: form?.maxLevel ?? null,
    exp: Number(row.exp),
    stats: form ? { base: form.stats.base, max: form.stats.max } : null,
    currentStats: form ? exactStatsAtLevel(form, level) : null,
    illustration: art ? `/assets/units/${row.unit_id}/illustration-${art}.png` : null,
    sprite: art ? `/assets/units/${row.unit_id}/battle-idle-${art}.png` : null,
    thumb: art ? `/assets/ui/cards/thumb/${row.unit_id}-${art}.webp` : null,
  };
}

function raritySortKey(rarity: Rarity | null): number {
  if (rarity === null) return -1;
  return rarity === "omni" ? 8 : rarity;
}

/** Collection order: highest rarity first, then highest level, then name, then row id. */
export function sortOwnedUnits(units: readonly OwnedUnitView[]): OwnedUnitView[] {
  return [...units].sort(
    (a, b) =>
      raritySortKey(b.rarity) - raritySortKey(a.rarity) ||
      b.level - a.level ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a detail-page URL segment can be an `owned_units.id`; others 404 without a query. */
export function isOwnedUnitId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export const ELEMENT_LABELS: Readonly<Record<Element, string>> = {
  fire: "Fire",
  water: "Water",
  earth: "Earth",
  thunder: "Thunder",
  light: "Light",
  dark: "Dark",
};
