import type { z } from "zod";
import { BannerSchema } from "./schemas/banner.ts";
import { type Enemy, EnemySchema } from "./schemas/enemy.ts";
import { GuestSchema } from "./schemas/guest.ts";
import { ItemContentSchema } from "./schemas/item.ts";
import { SphereSchema } from "./schemas/sphere.ts";
import { isBossStage, type Stage, StageSchema } from "./schemas/stage.ts";
import { type Unit, UnitSchema } from "./schemas/unit.ts";

/** Formats an issue path as `forms[0].bursts.bb.effects[1].id`. */
export function formatPath(path: readonly PropertyKey[]): string {
  let out = "";
  for (const key of path) {
    if (typeof key === "number") {
      out += `[${key}]`;
    } else {
      out += out === "" ? String(key) : `.${String(key)}`;
    }
  }
  return out === "" ? "(root)" : out;
}

/** Turns zod issues into `<file>: <path>: <message>` lines. */
export function formatIssues(file: string, issues: readonly z.core.$ZodIssue[]): string[] {
  return issues.map((issue) => `${file}: ${formatPath(issue.path)}: ${issue.message}`);
}

/** Parses `json` with `schema` and checks that its `id` matches the file name (`<id>.json`). */
function validateContentFile<T extends { id: string }>(
  schema: z.ZodType<T>,
  file: string,
  json: unknown,
): { errors: string[]; data?: T } {
  const result = schema.safeParse(json);
  if (!result.success) {
    return { errors: formatIssues(file, result.error.issues) };
  }
  const expected = file.replace(/^.*\//, "").replace(/\.json$/, "");
  if (result.data.id !== expected) {
    return {
      errors: [`${file}: id: must match the file name "${expected}" (got "${result.data.id}")`],
    };
  }
  return { errors: [], data: result.data };
}

/**
 * Validates one parsed unit file. The unit `id` must match the file name (`<id>.json`).
 * Returns readable error lines; empty when valid.
 */
export function validateUnitFile(file: string, json: unknown): string[] {
  return validateContentFile(UnitSchema, file, json).errors;
}

/**
 * Checks that every evolution recipe in `unit` names existing material units (`unitIds`, the files
 * in `content/units/`) and items (`itemIds`, the files in `content/items/`). `file` prefixes each
 * error line.
 */
export function validateEvolutionRefs(
  file: string,
  unit: Unit,
  unitIds: ReadonlySet<string>,
  itemIds: ReadonlySet<string>,
): string[] {
  const errors: string[] = [];
  unit.forms.forEach((form, f) => {
    const recipe = form.evolution;
    if (!recipe) return;
    recipe.units.forEach((entry, i) => {
      if (!unitIds.has(entry.unit)) {
        const path = formatPath(["forms", f, "evolution", "units", i, "unit"]);
        errors.push(`${file}: ${path}: unknown unit "${entry.unit}"`);
      }
    });
    (recipe.items ?? []).forEach((entry, i) => {
      if (!itemIds.has(entry.item)) {
        const path = formatPath(["forms", f, "evolution", "items", i, "item"]);
        errors.push(`${file}: ${path}: unknown item "${entry.item}"`);
      }
    });
  });
  return errors;
}

/** Validates one parsed item file (battle or material item; schema and file name). */
export function validateItemFile(file: string, json: unknown): string[] {
  return validateContentFile(ItemContentSchema, file, json).errors;
}

/** Validates equipment and its signature unit reference. */
export function validateSphereFile(
  file: string,
  json: unknown,
  unitIds: ReadonlySet<string>,
): string[] {
  const result = validateContentFile(SphereSchema, file, json);
  if (result.data?.signatureUnit && !unitIds.has(result.data.signatureUnit)) {
    result.errors.push(`${file}: signatureUnit: unknown unit "${result.data.signatureUnit}"`);
  }
  return result.errors;
}

/** Validates guest entries and their unit reference. */
export function validateGuestFile(
  file: string,
  json: unknown,
  unitIds: ReadonlySet<string>,
): string[] {
  const result = validateContentFile(GuestSchema, file, json);
  if (result.data && !unitIds.has(result.data.unit)) {
    result.errors.push(`${file}: unit: unknown unit "${result.data.unit}"`);
  }
  return result.errors;
}

/** Validates one parsed enemy file (schema, AI rule references, file name). */
export function validateEnemyFile(file: string, json: unknown): string[] {
  return validateContentFile(EnemySchema, file, json).errors;
}

/**
 * Checks that an enemy's drops name existing content: its capture unit is one of `unitIds` (the
 * files in `content/units/`) and each item drop one of `itemIds` (the files in `content/items/`).
 */
export function validateDropRefs(
  file: string,
  enemy: Enemy,
  unitIds: ReadonlySet<string>,
  itemIds: ReadonlySet<string>,
): string[] {
  const errors: string[] = [];
  const capture = enemy.drops.capture;
  if (capture && !unitIds.has(capture.unit)) {
    errors.push(`${file}: drops.capture.unit: unknown unit "${capture.unit}"`);
  }
  (enemy.drops.items ?? []).forEach((entry, i) => {
    if (!itemIds.has(entry.item)) {
      errors.push(
        `${file}: ${formatPath(["drops", "items", i, "item"])}: unknown item "${entry.item}"`,
      );
    }
  });
  return errors;
}

/**
 * Cross-file dungeon checks over every parsed stage (GAME_DESIGN §7 → Farming dungeons): a
 * dungeon's gate is an existing non-dungeon stage, its key item is one of `itemIds`, and every
 * `capture: "always"` slot names an enemy (in `enemies`, by ID) that has a capture drop.
 */
export function validateDungeons(
  stages: readonly Stage[],
  enemies: ReadonlyMap<string, Enemy>,
  itemIds: ReadonlySet<string>,
): string[] {
  const errors: string[] = [];
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  for (const stage of stages) {
    const dungeon = stage.dungeon;
    if (!dungeon) continue;
    const file = `stages/${stage.id}.json`;
    const gate = byId.get(dungeon.gate);
    if (!gate) {
      errors.push(`${file}: dungeon.gate: unknown stage "${dungeon.gate}"`);
    } else if (gate.dungeon) {
      errors.push(`${file}: dungeon.gate: "${dungeon.gate}" is a dungeon stage, not a story gate`);
    }
    if (dungeon.keyItem && !itemIds.has(dungeon.keyItem.item)) {
      errors.push(`${file}: dungeon.keyItem.item: unknown item "${dungeon.keyItem.item}"`);
    }
    stage.waves.forEach((wave, w) => {
      wave.enemies.forEach((slot, e) => {
        const enemy = enemies.get(slot.enemy);
        if (slot.capture === "always" && enemy && !enemy.drops.capture) {
          const path = formatPath(["waves", w, "enemies", e, "capture"]);
          errors.push(`${file}: ${path}: enemy "${slot.enemy}" has no capture drop`);
        }
      });
    });
  }
  return errors;
}

/**
 * Cross-file tutorial checks over every parsed stage (GAME_DESIGN §8 → New player flow): each
 * preset unit (in `units`, by ID) has a form at the tutorial's rarity whose max level reaches the
 * tutorial's level, and every wave enemy (in `enemies`, by ID) drops nothing that is granted
 * (no Zel, Karma, items, or capture), since the tutorial grants nothing.
 */
export function validateTutorials(
  stages: readonly Stage[],
  units: ReadonlyMap<string, Unit>,
  enemies: ReadonlyMap<string, Enemy>,
): string[] {
  const errors: string[] = [];
  for (const stage of stages) {
    const tutorial = stage.tutorial;
    if (!tutorial) continue;
    const file = `stages/${stage.id}.json`;
    const members: Array<[string, string]> = tutorial.units.map((id, i) => [`units[${i}]`, id]);
    if (tutorial.ally) members.push(["ally", tutorial.ally]);
    for (const [path, id] of members) {
      const unit = units.get(id);
      const form = unit?.forms.find((f) => f.rarity === tutorial.rarity);
      if (!unit) {
        errors.push(`${file}: tutorial.${path}: unknown unit "${id}"`);
      } else if (!form) {
        errors.push(`${file}: tutorial.${path}: "${id}" has no ${tutorial.rarity}★ form`);
      } else if (tutorial.level > form.maxLevel) {
        errors.push(`${file}: tutorial.level: above ${form.id}'s max level ${form.maxLevel}`);
      }
    }
    stage.waves.forEach((wave, w) => {
      wave.enemies.forEach((slot, e) => {
        const drops = enemies.get(slot.enemy)?.drops;
        if (drops && (drops.zel || drops.karma || drops.items?.length || drops.capture)) {
          const path = formatPath(["waves", w, "enemies", e, "enemy"]);
          errors.push(`${file}: ${path}: "${slot.enemy}" drops rewards; the tutorial grants none`);
        }
      });
    });
  }
  return errors;
}

/**
 * Validates one parsed stage file. Every wave enemy must be one of `enemyIds` (the IDs of the
 * files in `content/enemies/`).
 */
export function validateStageFile(
  file: string,
  json: unknown,
  enemyIds: ReadonlySet<string>,
): string[] {
  const { errors, data } = validateContentFile(StageSchema, file, json);
  if (!data) return errors;
  data.waves.forEach((wave, w) => {
    wave.enemies.forEach((slot, e) => {
      if (!enemyIds.has(slot.enemy)) {
        const path = formatPath(["waves", w, "enemies", e, "enemy"]);
        errors.push(`${file}: ${path}: unknown enemy "${slot.enemy}"`);
      }
      if (slot.boss && w !== data.waves.length - 1) {
        const path = formatPath(["waves", w, "enemies", e, "boss"]);
        errors.push(`${file}: ${path}: a boss may only be in the last wave`);
      }
    });
  });
  return errors;
}

/** Story stages per chapter (GAME_DESIGN §7: chapter c is stages 8(c−1)+1 … 8c). */
export const STAGES_PER_CHAPTER = 8;

/**
 * Cross-file story checks over every parsed stage: each story number is used once and lies in its
 * chapter's range, every chapter that has a story stage has all of them, and each chapter's last
 * stage is a boss stage. Returns readable error lines; empty when valid.
 */
export function validateStory(stages: readonly Stage[]): string[] {
  const errors: string[] = [];
  const byNumber = new Map<number, Stage>();
  const chapters = new Set<number>();
  for (const stage of stages) {
    const story = stage.story;
    if (!story) continue;
    const file = `stages/${stage.id}.json`;
    chapters.add(story.chapter);
    const first = (story.chapter - 1) * STAGES_PER_CHAPTER + 1;
    const last = story.chapter * STAGES_PER_CHAPTER;
    if (story.number < first || story.number > last) {
      errors.push(
        `${file}: story.number: stage ${story.number} is outside chapter ${story.chapter} (${first}-${last})`,
      );
    }
    const other = byNumber.get(story.number);
    if (other) {
      errors.push(`${file}: story.number: stage ${story.number} is also "${other.id}"`);
    } else {
      byNumber.set(story.number, stage);
    }
  }
  for (const chapter of [...chapters].sort((a, b) => a - b)) {
    const last = chapter * STAGES_PER_CHAPTER;
    for (let n = last - STAGES_PER_CHAPTER + 1; n <= last; n++) {
      if (!byNumber.has(n)) errors.push(`stages: chapter ${chapter} has no stage ${n}`);
    }
    const boss = byNumber.get(last);
    if (boss && !isBossStage(boss)) {
      errors.push(
        `stages/${boss.id}.json: waves: stage ${last} ends chapter ${chapter} and needs a boss`,
      );
    }
  }
  return errors;
}

/**
 * Validates one parsed banner file. `unitForms` maps each unit ID (the files in `content/units/`)
 * to its form IDs; every entry must name an existing unit and one of that unit's forms.
 */
export function validateBannerFile(
  file: string,
  json: unknown,
  unitForms: ReadonlyMap<string, ReadonlySet<string>>,
): string[] {
  const { errors, data } = validateContentFile(BannerSchema, file, json);
  if (!data) return errors;
  for (const list of ["featured", "pool"] as const) {
    data[list].forEach((entry, i) => {
      const forms = unitForms.get(entry.unit);
      if (!forms) {
        errors.push(`${file}: ${formatPath([list, i, "unit"])}: unknown unit "${entry.unit}"`);
      } else if (!forms.has(entry.form)) {
        const path = formatPath([list, i, "form"]);
        errors.push(`${file}: ${path}: unit "${entry.unit}" has no form "${entry.form}"`);
      }
    });
  }
  return errors;
}
