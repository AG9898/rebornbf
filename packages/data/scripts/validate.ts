// Content validation entry point: parses every file in content/ against its zod schema.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type Enemy, EnemySchema } from "../src/schemas/enemy.ts";
import { type Stage, StageSchema } from "../src/schemas/stage.ts";
import { type Unit, UnitSchema } from "../src/schemas/unit.ts";
import {
  validateBannerFile,
  validateDropRefs,
  validateDungeons,
  validateEnemyFile,
  validateEvolutionRefs,
  validateItemFile,
  validateStageFile,
  validateStory,
  validateTutorials,
  validateUnitFile,
} from "../src/validate.ts";

const contentDir = join(import.meta.dirname, "..", "content");

function jsonFiles(dir: string): string[] {
  return readdirSync(join(contentDir, dir))
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => `${dir}/${name}`);
}

const errors: string[] = [];
let checked = 0;

/** Parses each file in `dir` and runs `validate` on it. */
function validateDir(dir: string, validate: (file: string, json: unknown) => string[]): void {
  for (const file of jsonFiles(dir)) {
    checked++;
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(join(contentDir, file), "utf8"));
    } catch (error) {
      errors.push(`${file}: (root): invalid JSON: ${(error as Error).message}`);
      continue;
    }
    errors.push(...validate(file, json));
  }
}

const units: Unit[] = [];
validateDir("units", (file, json) => {
  const parsed = UnitSchema.safeParse(json);
  if (parsed.success) units.push(parsed.data);
  return validateUnitFile(file, json);
});
validateDir("items", validateItemFile);
// Evolution recipes reference material units and items by file name.
const unitIds = new Set(jsonFiles("units").map((file) => file.slice("units/".length, -5)));
const itemIds = new Set(jsonFiles("items").map((file) => file.slice("items/".length, -5)));
for (const unit of units) {
  errors.push(...validateEvolutionRefs(`units/${unit.id}.json`, unit, unitIds, itemIds));
}
const enemies = new Map<string, Enemy>();
validateDir("enemies", (file, json) => {
  const parsed = EnemySchema.safeParse(json);
  if (parsed.success) enemies.set(parsed.data.id, parsed.data);
  return validateEnemyFile(file, json);
});
// Enemy drops reference capture units and items by file name.
for (const enemy of enemies.values()) {
  errors.push(...validateDropRefs(`enemies/${enemy.id}.json`, enemy, unitIds, itemIds));
}
// Stages reference enemies by file name; a broken enemy file is reported above.
const enemyIds = new Set(
  jsonFiles("enemies").map((file) => file.slice("enemies/".length, -".json".length)),
);
const stages: Stage[] = [];
validateDir("stages", (file, json) => {
  const parsed = StageSchema.safeParse(json);
  if (parsed.success) stages.push(parsed.data);
  return validateStageFile(file, json, enemyIds);
});
// Story placement spans files: numbering, complete chapters, and chapter bosses.
errors.push(...validateStory(stages));
// Dungeon gates, key items, and always-captured slots span stages, enemies, and items.
errors.push(...validateDungeons(stages, enemies, itemIds));
// The tutorial's preset squad names unit forms, and its enemies may drop nothing granted.
errors.push(...validateTutorials(stages, new Map(units.map((unit) => [unit.id, unit])), enemies));
// Banners reference unit forms; unreadable unit files are reported above and skipped here.
const unitForms = new Map<string, Set<string>>();
for (const file of jsonFiles("units")) {
  try {
    const unit = JSON.parse(readFileSync(join(contentDir, file), "utf8")) as {
      id?: unknown;
      forms?: Array<{ id?: unknown }>;
    };
    if (typeof unit.id !== "string" || !Array.isArray(unit.forms)) continue;
    unitForms.set(unit.id, new Set(unit.forms.map((form) => String(form.id))));
  } catch {
    // Invalid JSON is already reported by validateDir("units", …).
  }
}
validateDir("banners", (file, json) => validateBannerFile(file, json, unitForms));

if (errors.length > 0) {
  for (const line of errors) console.error(line);
  console.error(`validate: ${errors.length} error(s) in ${checked} file(s)`);
  process.exit(1);
}
console.log(`validate: ${checked} file(s) OK`);
