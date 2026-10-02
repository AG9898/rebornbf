import {
  type Element,
  type Form,
  type Rarity,
  type Stats,
  totalExpForLevel,
  type Unit,
  UnitSchema,
} from "@bfr/data";
import aurelle from "@bfr/data/content/units/aurelle.json";
import brand from "@bfr/data/content/units/brand.json";
import brassCrucible from "@bfr/data/content/units/brass-crucible.json";
import cinderAlembic from "@bfr/data/content/units/cinder-alembic.json";
import cinderAthanor from "@bfr/data/content/units/cinder-athanor.json";
import cinderCairn from "@bfr/data/content/units/cinder-cairn.json";
import cinderColossus from "@bfr/data/content/units/cinder-colossus.json";
import cinderEffigy from "@bfr/data/content/units/cinder-effigy.json";
import cinderFlask from "@bfr/data/content/units/cinder-flask.json";
import cinderGrail from "@bfr/data/content/units/cinder-grail.json";
import cinderMote from "@bfr/data/content/units/cinder-mote.json";
import cinderSprite from "@bfr/data/content/units/cinder-sprite.json";
import duskAlembic from "@bfr/data/content/units/dusk-alembic.json";
import duskAthanor from "@bfr/data/content/units/dusk-athanor.json";
import duskCairn from "@bfr/data/content/units/dusk-cairn.json";
import duskColossus from "@bfr/data/content/units/dusk-colossus.json";
import duskEffigy from "@bfr/data/content/units/dusk-effigy.json";
import duskFlask from "@bfr/data/content/units/dusk-flask.json";
import duskGrail from "@bfr/data/content/units/dusk-grail.json";
import duskMote from "@bfr/data/content/units/dusk-mote.json";
import duskSprite from "@bfr/data/content/units/dusk-sprite.json";
import duskUrn from "@bfr/data/content/units/dusk-urn.json";
import garrick from "@bfr/data/content/units/garrick.json";
import glintAlembic from "@bfr/data/content/units/glint-alembic.json";
import glintAthanor from "@bfr/data/content/units/glint-athanor.json";
import glintCairn from "@bfr/data/content/units/glint-cairn.json";
import glintColossus from "@bfr/data/content/units/glint-colossus.json";
import glintEffigy from "@bfr/data/content/units/glint-effigy.json";
import glintFlask from "@bfr/data/content/units/glint-flask.json";
import glintGrail from "@bfr/data/content/units/glint-grail.json";
import glintMote from "@bfr/data/content/units/glint-mote.json";
import glintSprite from "@bfr/data/content/units/glint-sprite.json";
import glintUrn from "@bfr/data/content/units/glint-urn.json";
import grandHob from "@bfr/data/content/units/grand-hob.json";
import lanternToad from "@bfr/data/content/units/lantern-toad.json";
import maren from "@bfr/data/content/units/maren.json";
import matriarchToad from "@bfr/data/content/units/matriarch-toad.json";
import mendHob from "@bfr/data/content/units/mend-hob.json";
import mightHob from "@bfr/data/content/units/might-hob.json";
import morrick from "@bfr/data/content/units/morrick.json";
import mossAlembic from "@bfr/data/content/units/moss-alembic.json";
import mossAthanor from "@bfr/data/content/units/moss-athanor.json";
import mossCairn from "@bfr/data/content/units/moss-cairn.json";
import mossColossus from "@bfr/data/content/units/moss-colossus.json";
import mossEffigy from "@bfr/data/content/units/moss-effigy.json";
import mossFlask from "@bfr/data/content/units/moss-flask.json";
import mossGrail from "@bfr/data/content/units/moss-grail.json";
import mossMote from "@bfr/data/content/units/moss-mote.json";
import mossSprite from "@bfr/data/content/units/moss-sprite.json";
import placeholderEmber from "@bfr/data/content/units/placeholder-ember.json";
import placeholderTide from "@bfr/data/content/units/placeholder-tide.json";
import prismCairn from "@bfr/data/content/units/prism-cairn.json";
import regentToad from "@bfr/data/content/units/regent-toad.json";
import rillAlembic from "@bfr/data/content/units/rill-alembic.json";
import rillAthanor from "@bfr/data/content/units/rill-athanor.json";
import rillCairn from "@bfr/data/content/units/rill-cairn.json";
import rillColossus from "@bfr/data/content/units/rill-colossus.json";
import rillEffigy from "@bfr/data/content/units/rill-effigy.json";
import rillFlask from "@bfr/data/content/units/rill-flask.json";
import rillGrail from "@bfr/data/content/units/rill-grail.json";
import rillMote from "@bfr/data/content/units/rill-mote.json";
import rillSprite from "@bfr/data/content/units/rill-sprite.json";
import rook from "@bfr/data/content/units/rook.json";
import satchelToad from "@bfr/data/content/units/satchel-toad.json";
import silverCrucible from "@bfr/data/content/units/silver-crucible.json";
import solen from "@bfr/data/content/units/solen.json";
import vespera from "@bfr/data/content/units/vespera.json";
import vitalHob from "@bfr/data/content/units/vital-hob.json";
import voltAlembic from "@bfr/data/content/units/volt-alembic.json";
import voltAthanor from "@bfr/data/content/units/volt-athanor.json";
import voltCairn from "@bfr/data/content/units/volt-cairn.json";
import voltColossus from "@bfr/data/content/units/volt-colossus.json";
import voltEffigy from "@bfr/data/content/units/volt-effigy.json";
import voltFlask from "@bfr/data/content/units/volt-flask.json";
import voltGrail from "@bfr/data/content/units/volt-grail.json";
import voltMote from "@bfr/data/content/units/volt-mote.json";
import voltSprite from "@bfr/data/content/units/volt-sprite.json";
import wardHob from "@bfr/data/content/units/ward-hob.json";
import wyrmCoffer from "@bfr/data/content/units/wyrm-coffer.json";
import {
  formStatsAtLevel,
  impStatsProblem,
  LORD_ROLL,
  typeRollProblem,
  type UnitType,
  type UnitTypeRoll,
} from "@bfr/engine";

/**
 * The unit collection (M3-03A): the player's `owned_units` rows, read under RLS, joined with the
 * unit content from `@bfr/data` for display. Pure, so the pages stay thin and this is testable.
 */

/** The `owned_units` columns the collection pages select. */
export const OWNED_UNIT_COLUMNS =
  "id, unit_id, form_id, level, exp, unit_type, bb_level, sbb_level, imps";

export type OwnedUnitRow = {
  id: string;
  unit_id: string;
  form_id: string;
  level: number;
  exp: number;
  bb_level?: number;
  sbb_level?: number;
  imps?: Stats;
  /** Whether a Satchel Toad opened the second sphere slot (M4-04D); selected only where needed. */
  second_sphere_slot?: boolean;
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
  /** The unit's quote (launch units only, M4-06G); null for fodder, materials, or missing content. */
  quote: string | null;
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
    // Slot-unlock growth fodder (RESOLVED-55, M4-04D).
    satchelToad,
    // Burst-level growth fodder (RESOLVED-55, M4-04E).
    lanternToad,
    regentToad,
    matriarchToad,
    vitalHob,
    mightHob,
    wardHob,
    mendHob,
    grandHob,
    silverCrucible,
    solen,
    vespera,
    voltSprite,
    // Evolution material units (RESOLVED-66), so stacks of them show a name and element frame.
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
  // Stat hobs (M4-04B, M6-08C): locked splash, idle sprite, and figure thumb for each 3★ form.
  "vital-hob",
  "might-hob",
  "ward-hob",
  "mend-hob",
  "grand-hob",
  // Evolution materials (RESOLVED-67, M6-08D): one 3★–5★ form each; the Motes are M6-08E.
  "cinder-effigy",
  "rill-effigy",
  "moss-effigy",
  "volt-effigy",
  "glint-effigy",
  "dusk-effigy",
  "cinder-cairn",
  "rill-cairn",
  "moss-cairn",
  "volt-cairn",
  "glint-cairn",
  "dusk-cairn",
  "cinder-colossus",
  "rill-colossus",
  "moss-colossus",
  "volt-colossus",
  "glint-colossus",
  "dusk-colossus",
  "prism-cairn",
  "glint-urn",
  "dusk-urn",
  "wyrm-coffer",
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
  "lantern-toad",
  "maren",
  "matriarch-toad",
  "morrick",
  "regent-toad",
  "rook",
  "satchel-toad",
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
  imps?: Stats,
): Stats | null {
  if (!(Number.isInteger(level) && level >= 1 && level <= form.maxLevel)) return null;
  const typeRoll = roll ?? LORD_ROLL;
  if (typeRollProblem(typeRoll)) return null;
  if (imps && impStatsProblem(form, imps)) return null;
  return formStatsAtLevel(form, level, typeRoll, imps);
}

function rangeStats(
  form: Form,
  roll: UnitTypeRoll | null | undefined,
  imps?: Stats,
): { base: Stats; max: Stats } | null {
  const base = statsAtLevel(form, 1, roll, imps);
  const max = statsAtLevel(form, form.maxLevel, roll, imps);
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
    quote: unit?.quote ?? null,
    element: unit?.element ?? null,
    rarity: form?.rarity ?? null,
    rarityLabel: rarityLabel(form?.rarity ?? null),
    level,
    maxLevel: form?.maxLevel ?? null,
    exp: Number(row.exp),
    stats: form ? rangeStats(form, row.unit_type, row.imps) : null,
    currentStats: form ? statsAtLevel(form, level, row.unit_type, row.imps) : null,
    illustration: art ? `/assets/units/${row.unit_id}/illustration-${art}.png` : null,
    sprite: art ? `/assets/units/${row.unit_id}/battle-idle-${art}.png` : null,
    thumb: art ? `/assets/ui/cards/thumb/${row.unit_id}-${art}.webp` : null,
  };
}

function raritySortKey(rarity: Rarity | null): number {
  if (rarity === null) return -1;
  return rarity === "omni" ? 8 : rarity;
}

/** The Units list's sort keys, in the order its Sort button cycles through them (M3-03E). */
export const UNIT_SORT_KEYS = ["rarity", "level", "element", "name"] as const;

export type UnitSortKey = (typeof UNIT_SORT_KEYS)[number];

export const UNIT_SORT_LABELS: Readonly<Record<UnitSortKey, string>> = {
  rarity: "Rarity",
  level: "Level",
  element: "Element",
  name: "Name",
};

/** A `?sort=` value as a sort key; anything else is the default, rarity. */
export function parseUnitSort(value: string | string[] | undefined): UnitSortKey {
  return UNIT_SORT_KEYS.find((key) => key === value) ?? "rarity";
}

/** The key the Sort button moves to after `key`, wrapping round. */
export function nextUnitSort(key: UnitSortKey): UnitSortKey {
  return UNIT_SORT_KEYS[(UNIT_SORT_KEYS.indexOf(key) + 1) % UNIT_SORT_KEYS.length] ?? "rarity";
}

const ELEMENT_ORDER: readonly Element[] = ["fire", "water", "earth", "thunder", "light", "dark"];

function elementSortKey(element: Element | null): number {
  return element === null ? ELEMENT_ORDER.length : ELEMENT_ORDER.indexOf(element);
}

/**
 * Collection order. The default (rarity): highest rarity first, then highest level, then name,
 * then row id. The other keys put their own comparison first and fall back to that order.
 */
export function sortOwnedUnits<T extends OwnedUnitView>(
  units: readonly T[],
  key: UnitSortKey = "rarity",
): T[] {
  const byRarity = (a: OwnedUnitView, b: OwnedUnitView) =>
    raritySortKey(b.rarity) - raritySortKey(a.rarity) ||
    b.level - a.level ||
    a.name.localeCompare(b.name) ||
    a.id.localeCompare(b.id);
  const first: Record<UnitSortKey, (a: OwnedUnitView, b: OwnedUnitView) => number> = {
    rarity: () => 0,
    level: (a, b) => b.level - a.level,
    element: (a, b) => elementSortKey(a.element) - elementSortKey(b.element),
    name: (a, b) => a.name.localeCompare(b.name),
  };
  return [...units].sort((a, b) => first[key](a, b) || byRarity(a, b));
}

/** The level under a Units list icon: "Lv.N", or "Lv.MAX" at the form's level cap. */
export function levelLabel(unit: Pick<OwnedUnitView, "level" | "maxLevel">): string {
  return unit.maxLevel !== null && unit.level >= unit.maxLevel ? "Lv.MAX" : `Lv.${unit.level}`;
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

export const UNIT_TYPE_LABELS: Readonly<Record<UnitType, string>> = {
  lord: "Lord",
  anima: "Anima",
  breaker: "Breaker",
  guardian: "Guardian",
  oracle: "Oracle",
  rex: "Rex",
};

/** The Unit detail page's extra fields (M3-03G): the type, EXP to the next level, and skill names. */
export type UnitDetailView = OwnedUnitView & {
  bbLevel: number;
  sbbLevel: number;
  /** The persisted type roll's name; a unit without a roll is a Lord. */
  typeLabel: string;
  /** EXP still needed for the next level; null at the form's cap or for an invalid row. */
  expToNext: number | null;
  /** How far the unit is through its current level, 0–1 (1 at the cap). */
  expProgress: number;
  /** The form's Leader Skill, Extra Skill, and Brave Burst names; null when the form has none. */
  skills: { leader: string | null; extra: string | null; burst: string | null };
};

/**
 * EXP to the next level and progress through the current one on the unit's curve (GAME_DESIGN §6
 * → Level EXP and fusion). `exp` is cumulative within the form, as `fuse` stores it.
 */
function expProgress(
  unit: Unit,
  form: Form,
  level: number,
  exp: number,
): { expToNext: number | null; expProgress: number } {
  if (!(Number.isInteger(level) && level >= 1 && level <= form.maxLevel)) {
    return { expToNext: null, expProgress: 0 };
  }
  if (level === form.maxLevel) return { expToNext: null, expProgress: 1 };
  const curve = unit.expCurve ?? 10;
  const floor = totalExpForLevel(curve, level);
  const next = totalExpForLevel(curve, level + 1);
  const current = Math.min(Math.max(exp, floor), next);
  return { expToNext: next - current, expProgress: (current - floor) / (next - floor) };
}

/** A form's Leader Skill name (the Squad editor's Leader Skill bar, M3-03F); null when it has none. */
export function formLeaderSkill(unitId: string, formId: string): string | null {
  return unitContent(unitId)?.forms.find((f) => f.id === formId)?.leaderSkill?.name ?? null;
}

export function toUnitDetailView(row: OwnedUnitRow): UnitDetailView {
  const view = toOwnedUnitView(row);
  const unit = unitContent(row.unit_id);
  const form = unit?.forms.find((f) => f.id === row.form_id);
  return {
    ...view,
    bbLevel: row.bb_level ?? 1,
    sbbLevel: row.sbb_level ?? 1,
    typeLabel: UNIT_TYPE_LABELS[row.unit_type?.type ?? "lord"] ?? "Lord",
    ...(unit && form
      ? expProgress(unit, form, view.level, view.exp)
      : { expToNext: null, expProgress: 0 }),
    skills: {
      leader: form?.leaderSkill?.name ?? null,
      extra: form?.extraSkill?.name ?? null,
      burst: form?.bursts.bb.name ?? null,
    },
  };
}
