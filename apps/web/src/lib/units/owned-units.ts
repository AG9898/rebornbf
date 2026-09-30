import { type Element, type Form, type Rarity, type Stats, type Unit, UnitSchema } from "@bfr/data";
import aurelle from "@bfr/data/content/units/aurelle.json";
import brand from "@bfr/data/content/units/brand.json";
import brassCrucible from "@bfr/data/content/units/brass-crucible.json";
import cinderAlembic from "@bfr/data/content/units/cinder-alembic.json";
import cinderAthanor from "@bfr/data/content/units/cinder-athanor.json";
import cinderFlask from "@bfr/data/content/units/cinder-flask.json";
import cinderGrail from "@bfr/data/content/units/cinder-grail.json";
import cinderSprite from "@bfr/data/content/units/cinder-sprite.json";
import duskAlembic from "@bfr/data/content/units/dusk-alembic.json";
import duskAthanor from "@bfr/data/content/units/dusk-athanor.json";
import duskFlask from "@bfr/data/content/units/dusk-flask.json";
import duskGrail from "@bfr/data/content/units/dusk-grail.json";
import duskSprite from "@bfr/data/content/units/dusk-sprite.json";
import garrick from "@bfr/data/content/units/garrick.json";
import glintAlembic from "@bfr/data/content/units/glint-alembic.json";
import glintAthanor from "@bfr/data/content/units/glint-athanor.json";
import glintFlask from "@bfr/data/content/units/glint-flask.json";
import glintGrail from "@bfr/data/content/units/glint-grail.json";
import glintSprite from "@bfr/data/content/units/glint-sprite.json";
import maren from "@bfr/data/content/units/maren.json";
import morrick from "@bfr/data/content/units/morrick.json";
import mossAlembic from "@bfr/data/content/units/moss-alembic.json";
import mossAthanor from "@bfr/data/content/units/moss-athanor.json";
import mossFlask from "@bfr/data/content/units/moss-flask.json";
import mossGrail from "@bfr/data/content/units/moss-grail.json";
import mossSprite from "@bfr/data/content/units/moss-sprite.json";
import placeholderEmber from "@bfr/data/content/units/placeholder-ember.json";
import placeholderTide from "@bfr/data/content/units/placeholder-tide.json";
import rillAlembic from "@bfr/data/content/units/rill-alembic.json";
import rillAthanor from "@bfr/data/content/units/rill-athanor.json";
import rillFlask from "@bfr/data/content/units/rill-flask.json";
import rillGrail from "@bfr/data/content/units/rill-grail.json";
import rillSprite from "@bfr/data/content/units/rill-sprite.json";
import rook from "@bfr/data/content/units/rook.json";
import silverCrucible from "@bfr/data/content/units/silver-crucible.json";
import solen from "@bfr/data/content/units/solen.json";
import vespera from "@bfr/data/content/units/vespera.json";
import voltAlembic from "@bfr/data/content/units/volt-alembic.json";
import voltAthanor from "@bfr/data/content/units/volt-athanor.json";
import voltFlask from "@bfr/data/content/units/volt-flask.json";
import voltGrail from "@bfr/data/content/units/volt-grail.json";
import voltSprite from "@bfr/data/content/units/volt-sprite.json";
import { formStatsAtLevel, LORD_ROLL, typeRollProblem, type UnitTypeRoll } from "@bfr/engine";

/**
 * The unit collection (M3-03A): the player's `owned_units` rows, read under RLS, joined with the
 * unit content from `@bfr/data` for display. Pure, so the pages stay thin and this is testable.
 */

/** The `owned_units` columns the collection pages select. */
export const OWNED_UNIT_COLUMNS =
  "id, unit_id, form_id, level, exp, unit_type, bb_level, sbb_level";

export type OwnedUnitRow = {
  id: string;
  unit_id: string;
  form_id: string;
  level: number;
  exp: number;
  bb_level?: number;
  sbb_level?: number;
  /**
   * The persisted type roll (GAME_DESIGN §6 → Stat growth and unit types), rolled at acquisition
   * (M3-01D). Null for a unit that never rolls (Omni grants, single-form units): it is Lord.
   */
  unit_type?: UnitTypeRoll | null;
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
  /** The form's level-1 and max-level stats with the unit's type roll applied. */
  stats: { base: Stats; max: Stats } | null;
  /** The stats at the unit's current level; null when the content or the row is invalid. */
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
    cinderFlask,
    rillFlask,
    mossFlask,
    voltFlask,
    glintFlask,
    duskFlask,
    cinderAlembic,
    rillAlembic,
    mossAlembic,
    voltAlembic,
    glintAlembic,
    duskAlembic,
    cinderAthanor,
    rillAthanor,
    mossAthanor,
    voltAthanor,
    glintAthanor,
    duskAthanor,
    cinderGrail,
    rillGrail,
    mossGrail,
    voltGrail,
    glintGrail,
    duskGrail,
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
  // Growth fodder EXP vessels (RESOLVED-55): one 3★–5★ form each.
  "cinder-flask",
  "rill-flask",
  "moss-flask",
  "volt-flask",
  "glint-flask",
  "dusk-flask",
  "cinder-alembic",
  "rill-alembic",
  "moss-alembic",
  "volt-alembic",
  "glint-alembic",
  "dusk-alembic",
  "cinder-athanor",
  "rill-athanor",
  "moss-athanor",
  "volt-athanor",
  "glint-athanor",
  "dusk-athanor",
  "cinder-grail",
  "rill-grail",
  "moss-grail",
  "volt-grail",
  "glint-grail",
  "dusk-grail",
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
 * A form's HP/ATK/DEF/REC at `level` with the unit's persisted type roll (default Lord), from the
 * engine's `formStatsAtLevel` (GAME_DESIGN §6 → Stat growth and unit types) so unit pages, session
 * setup, and the server replay share one formula. Null when `level` is not an integer
 * 1…`form.maxLevel` or the roll is invalid.
 */
export function statsAtLevel(
  form: Form,
  level: number,
  roll: UnitTypeRoll | null | undefined = LORD_ROLL,
): Stats | null {
  if (!(Number.isInteger(level) && level >= 1 && level <= form.maxLevel)) return null;
  const typeRoll = roll ?? LORD_ROLL;
  if (typeRollProblem(typeRoll)) return null;
  return formStatsAtLevel(form, level, typeRoll);
}

function rangeStats(
  form: Form,
  roll: UnitTypeRoll | null | undefined,
): { base: Stats; max: Stats } | null {
  const base = statsAtLevel(form, 1, roll);
  const max = statsAtLevel(form, form.maxLevel, roll);
  return base && max ? { base, max } : null;
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
    stats: form ? rangeStats(form, row.unit_type) : null,
    currentStats: form ? statsAtLevel(form, level, row.unit_type) : null,
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
