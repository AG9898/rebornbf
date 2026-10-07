import type { Attack, MoveType } from "../schemas/attack.ts";
import type { Burst, BurstTiers } from "../schemas/burst.ts";
import type { Element } from "../schemas/common.ts";
import type { MaterialItem } from "../schemas/item.ts";
import type { EvolutionRecipe, Form, Rarity, Unit } from "../schemas/unit.ts";
import { burstEffects, type ImportIssue, skillEffects } from "./effects.ts";
import type {
  SourceBurst,
  SourceDamageFrames,
  SourceData,
  SourceSkill,
  SourceUnit,
} from "./source.ts";

/** Kebab-case content ID from an original name: `Fire Mecha God` → `fire-mecha-god`. */
export function contentId(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * The source's move type codes (unit `movement`): 1 `melee`; 2 `teleport` (ROSTER → Kit Notes →
 * Solen); 3 `ranged`, an unsourced BFR reading (the engine does not read `moveType` yet).
 */
const MOVE_TYPES: Readonly<Record<string, MoveType>> = {
  "1": "melee",
  "2": "teleport",
  "3": "ranged",
};

const ELEMENTS: ReadonlySet<string> = new Set([
  "fire",
  "water",
  "earth",
  "thunder",
  "light",
  "dark",
]);

/** The source's `exp_pattern` → the unit's `expCurve` (omitted for 10). */
const EXP_CURVES: Readonly<Record<number, 10 | 21>> = { 10: 10, 20: 21 };

/** The result of importing one line: the unit, any items its recipes need, and every issue. */
export interface ImportedUnit {
  unit: Unit;
  /** Source unit IDs of the material units its recipes consume (imported separately). */
  materialSourceIds: string[];
  items: MaterialItem[];
  issues: ImportIssue[];
}

function moveType(code: string, where: string, issues: ImportIssue[]): MoveType {
  const type = MOVE_TYPES[code];
  if (type) return type;
  issues.push({ where, message: `move type ${JSON.stringify(code)} has no BFR reading yet` });
  return "melee";
}

/** Frames of the proc's delay, from `"<ms>/<frames>"`. */
function delayFrames(frames: SourceDamageFrames): number {
  const raw = frames["effect delay time(ms)/frame"];
  if (!raw) return 0;
  return Number(raw.split("/")[1] ?? 0);
}

/**
 * One frame-timed attack: the first hit (plus the proc's delay) is the start delay, later hits are
 * offsets from it, and the drop-check count is per hit (DISCOVERIES → cross-check against the
 * export). Frames out of order in the source are sorted with their shares (DISCOVERIES).
 */
export function toAttack(
  frames: SourceDamageFrames,
  move: MoveType,
  dropChecksPerHit: number,
): Attack {
  const hits = frames["frame times"].map((frame, i) => ({
    frame,
    share: frames["hit dmg% distribution"][i] ?? 0,
  }));
  hits.sort((a, b) => a.frame - b.frame);
  const first = hits[0]?.frame ?? 0;
  return {
    moveType: move,
    startDelayFrames: first + delayFrames(frames),
    hitFrames: hits.map((hit) => hit.frame - first),
    damageDistribution: hits.map((hit) => hit.share),
    dropChecks: dropChecksPerHit * hits.length,
  };
}

/** Burst level 10 (RESOLVED-58: kit values are level 10). */
function topLevel(burst: SourceBurst) {
  const level = burst.levels.at(-1);
  if (!level) throw new Error(`burst ${burst.id}: no levels`);
  return level;
}

function toBurst(
  burst: SourceBurst,
  source: SourceUnit,
  where: string,
  issues: ImportIssue[],
): Burst {
  const move = moveType(source.movement.skill["move type"], where, issues);
  const level = topLevel(burst);
  const { attacks, effects } = burstEffects(
    level.effects,
    burst["damage frames"],
    { element: elementOf(source) },
    where,
    issues,
  );
  return {
    name: burst.name,
    cost: level["bc cost"],
    attacks: attacks.map((frames) => toAttack(frames, move, burst["drop check count"])),
    effects,
  };
}

/**
 * A form with no burst in the source (evolution materials): a burst that does nothing, so the
 * engine's every-form-has-a-BB rule holds without inventing kit data.
 */
const NO_BURST: Burst = { name: "—", cost: 99, attacks: [], effects: [] };

function toSkill(
  skill: SourceSkill | undefined,
  source: SourceUnit,
  where: string,
  issues: ImportIssue[],
) {
  if (!skill) return undefined;
  const effects = skillEffects(skill.effects, { element: elementOf(source) }, where, issues);
  if (effects.length === 0) return undefined;
  return { name: skill.name, effects };
}

function rarityOf(source: SourceUnit): Rarity {
  return source.rarity === 8 ? "omni" : source.rarity;
}

function formId(unitId: string, rarity: Rarity): string {
  return `${unitId}-${rarity}`;
}

/** Converts one source form; `issues` collects what could not be converted. */
export function toForm(
  data: SourceData,
  unitId: string,
  source: SourceUnit,
  issues: ImportIssue[],
): Form {
  const rarity = rarityOf(source);
  const id = formId(unitId, rarity);
  const where = `${id} (${source.id} ${source.name})`;
  const maxLevel = data.maxLevels[String(source.id)];
  if (maxLevel === undefined) issues.push({ where, message: "no max level in the archive" });
  const bursts: BurstTiers = {
    bb: source.bb ? toBurst(source.bb, source, `${where} bb`, issues) : NO_BURST,
  };
  if (source.sbb) bursts.sbb = toBurst(source.sbb, source, `${where} sbb`, issues);
  if (source.ubb) bursts.ubb = toBurst(source.ubb, source, `${where} ubb`, issues);
  const form: Form = {
    id,
    name: source.name.trim(),
    rarity,
    maxLevel: maxLevel ?? 1,
    stats: {
      base: { ...source.stats._base },
      max: { ...source.stats._lord },
    },
    normalAttack: toAttack(
      source["damage frames"],
      moveType(source.movement.attack["move type"], where, issues),
      source["drop check count"],
    ),
    bursts,
    sphereSlots: 1,
  };
  if (source.imp) {
    const caps = {
      hp: Number(source.imp["max hp"]),
      atk: Number(source.imp["max atk"]),
      def: Number(source.imp["max def"]),
      rec: Number(source.imp["max rec"]),
    };
    if (Object.values(caps).some((n) => n > 0)) form.impCaps = caps;
  }
  const leaderSkill = toSkill(source["leader skill"], source, `${where} ls`, issues);
  if (leaderSkill) form.leaderSkill = leaderSkill;
  const extraSkill = toSkill(source["extra skill"], source, `${where} es`, issues);
  if (extraSkill) form.extraSkill = extraSkill;
  return form;
}

/** The source forms of one line (unit category), lowest rarity first. */
export function lineOf(data: SourceData, category: number): SourceUnit[] {
  return Object.values(data.units)
    .filter((unit) => unit.category === category)
    .sort((a, b) => a.rarity - b.rarity);
}

function toRecipe(
  data: SourceData,
  source: SourceUnit,
  materialSourceIds: Set<string>,
  items: Map<string, MaterialItem>,
): EvolutionRecipe | undefined {
  const evolution = data.evolutions[String(source.id)];
  if (!evolution) return undefined;
  const unitCounts = new Map<string, number>();
  const itemCounts = new Map<string, number>();
  for (const mat of evolution.mats) {
    if (mat.type === "unit") {
      const material = data.units[mat.id];
      if (!material) throw new Error(`${source.id}: evolution material ${mat.id} not in the data`);
      materialSourceIds.add(mat.id);
      const id = contentId(material.name);
      unitCounts.set(id, (unitCounts.get(id) ?? 0) + 1);
    } else {
      const item = data.items[mat.id];
      if (!item) throw new Error(`${source.id}: evolution item ${mat.id} not in the data`);
      const id = contentId(item.name);
      items.set(id, { id, kind: "material", name: item.name, description: item.desc });
      itemCounts.set(id, (itemCounts.get(id) ?? 0) + 1);
    }
  }
  const recipe: EvolutionRecipe = {
    units: [...unitCounts].map(([unit, count]) => ({ unit, count })),
    zel: evolution.amount,
  };
  if (itemCounts.size > 0) {
    recipe.items = [...itemCounts].map(([item, count]) => ({ item, count }));
  }
  return recipe;
}

function elementOf(source: SourceUnit): Element {
  if (!ELEMENTS.has(source.element)) {
    throw new Error(`${source.id}: unknown element ${JSON.stringify(source.element)}`);
  }
  return source.element as Element;
}

/**
 * Imports one character line (every form of `category`) as unit `unitId`, with original names
 * and level-10 burst values (RESOLVED-58, RESOLVED-100).
 */
export function importLine(
  data: SourceData,
  character: { unit: string; name: string; category: number },
  url: string,
): ImportedUnit {
  const { unit: unitId, category } = character;
  const line = lineOf(data, category);
  const first = line[0];
  if (!first) throw new Error(`category ${category}: no units in the data`);
  const issues: ImportIssue[] = [];
  const materialSourceIds = new Set<string>();
  const items = new Map<string, MaterialItem>();
  const forms = line.map((source, i) => {
    const form = toForm(data, unitId, source, issues);
    if (i < line.length - 1) {
      const recipe = toRecipe(data, source, materialSourceIds, items);
      if (recipe) form.evolution = recipe;
    }
    return form;
  });
  const last = line.at(-1) ?? first;
  const unit: Unit = {
    id: unitId,
    name: character.name,
    element: elementOf(first),
    source: { unit: `${first.name} → ${last.name} (category ${category})`, url },
    forms,
  };
  const patterns = new Set(line.map((source) => source.exp_pattern));
  const curve = EXP_CURVES[first.exp_pattern];
  if (patterns.size > 1 || curve === undefined) {
    issues.push({
      where: unitId,
      message: `EXP pattern(s) ${[...patterns].join(", ")} have no BFR curve (one per unit: 10 or 21)`,
    });
  } else if (curve !== 10) {
    unit.expCurve = curve;
  }
  return { unit, materialSourceIds: [...materialSourceIds], items: [...items.values()], issues };
}

/** Imports an evolution material (a single-form, stackable unit) from its source ID. */
export function importMaterial(data: SourceData, sourceId: string): ImportedUnit {
  const source = data.units[sourceId];
  if (!source) throw new Error(`material ${sourceId}: not in the data`);
  const id = contentId(source.name);
  const issues: ImportIssue[] = [];
  const form = toForm(data, id, source, issues);
  const unit: Unit = {
    id,
    name: source.name.trim(),
    element: elementOf(source),
    source: {
      unit: `${source.name.trim()} (${sourceId})`,
      url: "https://github.com/cheahjs/bravefrontier_data",
    },
    stackable: true,
    forms: [form],
  };
  return { unit, materialSourceIds: [], items: [], issues };
}
