import type { z } from "zod";
import { BannerSchema } from "./schemas/banner.ts";
import { EnemySchema } from "./schemas/enemy.ts";
import { isBossStage, type Stage, StageSchema } from "./schemas/stage.ts";
import { UnitSchema } from "./schemas/unit.ts";

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

/** Validates one parsed enemy file (schema, AI rule references, file name). */
export function validateEnemyFile(file: string, json: unknown): string[] {
  return validateContentFile(EnemySchema, file, json).errors;
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
