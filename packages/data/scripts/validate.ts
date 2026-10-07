// Content validation entry point: parses every file in content/ against its zod schema.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type Batch, BatchSchema } from "../src/schemas/batch.ts";
import { type Enemy, EnemySchema } from "../src/schemas/enemy.ts";
import { type Stage, StageSchema } from "../src/schemas/stage.ts";
import { type Unit, UnitSchema } from "../src/schemas/unit.ts";
import {
  formatIssues,
  obtainableUnitIds,
  validateBannerFile,
  validateBatches,
  validateDropRefs,
  validateDungeons,
  validateEnemyFile,
  validateEvolutionRefs,
  validateFirstClearItems,
  validateFirstClearSpheres,
  validateFirstClearUnits,
  validateGemBudget,
  validateGuestFile,
  validateItemFile,
  validateSphereFile,
  validateStageFile,
  validateStory,
  validateTrials,
  validateTutorials,
  validateUnitFile,
} from "../src/validate.ts";

const contentDir = join(import.meta.dirname, "..", "content");

function jsonFiles(dir: string): string[] {
  if (!existsSync(join(contentDir, dir))) return [];
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
// Imported original content (UNIT_ROADMAP): units and items, and the batches that release them.
const originalUnits = new Map<string, Unit>();
validateDir("original/units", (file, json) => {
  const parsed = UnitSchema.safeParse(json);
  if (parsed.success) originalUnits.set(parsed.data.id, parsed.data);
  return validateUnitFile(file, json);
});
validateDir("original/items", validateItemFile);
const batches: Batch[] = [];
validateDir("original/batches", (file, json) => {
  const parsed = BatchSchema.safeParse(json);
  if (!parsed.success) return formatIssues(file, parsed.error.issues);
  batches.push(parsed.data);
  const expected = file.replace(/^.*\//, "").replace(/\.json$/, "");
  return parsed.data.id === expected ? [] : [`${file}: id: must match the file name "${expected}"`];
});
const idsIn = (dir: string) => jsonFiles(dir).map((file) => file.slice(dir.length + 1, -5));
const legacyUnitIds = new Set(idsIn("units"));
for (const id of idsIn("original/units")) {
  if (legacyUnitIds.has(id)) errors.push(`original/units/${id}.json: id: also a unit in units/`);
}
for (const id of idsIn("original/items")) {
  if (idsIn("items").includes(id))
    errors.push(`original/items/${id}.json: id: also an item in items/`);
}
errors.push(...validateBatches(batches, originalUnits, legacyUnitIds));
// Other content may name launch units, imported materials, and released batches' characters only.
const unitIds = obtainableUnitIds(legacyUnitIds, originalUnits, batches);
const itemIds = new Set([...idsIn("items"), ...idsIn("original/items")]);
// Evolution recipes may name any imported unit or item.
const recipeUnitIds = new Set([...legacyUnitIds, ...originalUnits.keys()]);
validateDir("guests", (file, json) => validateGuestFile(file, json, unitIds));
validateDir("spheres", (file, json) => validateSphereFile(file, json, unitIds));
const sphereIds = new Set(jsonFiles("spheres").map((file) => file.slice("spheres/".length, -5)));
for (const unit of units) {
  errors.push(...validateEvolutionRefs(`units/${unit.id}.json`, unit, unitIds, itemIds));
}
for (const unit of originalUnits.values()) {
  errors.push(
    ...validateEvolutionRefs(`original/units/${unit.id}.json`, unit, recipeUnitIds, itemIds),
  );
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
// Chapter first-clear gems must meet the §8 gem budget (350 for chapter 1, 400 for chapter 2).
errors.push(...validateGemBudget(stages));
// Dungeon gates, key items, and always-captured slots span stages, enemies, and items.
errors.push(...validateDungeons(stages, enemies, itemIds));
// First-clear reward items name item files.
errors.push(...validateFirstClearItems(stages, itemIds));
// First-clear reward units name stackable unit files.
errors.push(...validateFirstClearUnits(stages, new Map(units.map((unit) => [unit.id, unit]))));
// First-clear reward spheres name sphere files.
errors.push(...validateFirstClearSpheres(stages, sphereIds));
// Trial numbers are unique and each trial opens on a story stage's first clear.
errors.push(...validateTrials(stages));
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
// Released batches' characters and imported materials are bannerable; staged characters are not.
for (const unit of originalUnits.values()) {
  if (unitIds.has(unit.id)) unitForms.set(unit.id, new Set(unit.forms.map((form) => form.id)));
}
validateDir("banners", (file, json) => validateBannerFile(file, json, unitForms));

if (errors.length > 0) {
  for (const line of errors) console.error(line);
  console.error(`validate: ${errors.length} error(s) in ${checked} file(s)`);
  process.exit(1);
}
console.log(`validate: ${checked} file(s) OK`);
