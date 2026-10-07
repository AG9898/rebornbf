// Imports one original unit batch from the cheahjs Global export (UNIT_ROADMAP → Importing a batch).
//
//   pnpm --filter @bfr/data import:batch <batch-id> [--source <dir>] [--archive <dir>] [--dry-run]
//
// Reads `content/original/batches/<batch-id>.json`, converts every character line and the
// evolution materials and items its recipes use, validates them, and writes them to
// `content/original/{units,items}/`. Any effect the importer cannot convert fails the run, and
// nothing is written. `--source` is a directory holding the export's `info.json`,
// `evo_list.json`, and `items.json` (default `$BFR_CHEAHJS_DIR`, else `~/.cache/bfr/cheahjs`);
// the export stays outside the repo (IP_POLICY). `--archive` is the archive's `3-mst-translated`
// directory, read for each form's max level (default `$BFR_ARCHIVE_MST_DIR`, else
// `~/BF-Assets-All/21900/3-mst-translated`).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SourceData } from "../src/import/source.ts";
import { importLine, importMaterial } from "../src/import/unit.ts";
import { BatchSchema } from "../src/schemas/batch.ts";
import { MaterialItemSchema } from "../src/schemas/item.ts";
import { type Unit, UnitSchema } from "../src/schemas/unit.ts";
import { formatIssues } from "../src/validate.ts";

const args = process.argv.slice(2);
const batchId = args.find((arg, i) => !arg.startsWith("--") && !args[i - 1]?.startsWith("--"));
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = args.includes("--dry-run");
if (!batchId) {
  console.error("usage: import-batch <batch-id> [--source <dir>] [--archive <dir>] [--dry-run]");
  process.exit(2);
}
const sourceDir =
  flag("--source") ?? process.env.BFR_CHEAHJS_DIR ?? join(homedir(), ".cache", "bfr", "cheahjs");
const archiveDir =
  flag("--archive") ??
  process.env.BFR_ARCHIVE_MST_DIR ??
  join(homedir(), "BF-Assets-All", "21900", "3-mst-translated");

const originalDir = join(import.meta.dirname, "..", "content", "original");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

for (const file of ["info.json", "evo_list.json", "items.json"]) {
  if (!existsSync(join(sourceDir, file))) {
    console.error(
      `import-batch: ${join(sourceDir, file)} not found (see UNIT_ROADMAP → Importing a batch)`,
    );
    process.exit(2);
  }
}
const unitMstFiles = existsSync(archiveDir)
  ? readdirSync(archiveDir).filter((name) => /^F_UNIT_MST_\d+_Ver\d+\.json$/.test(name))
  : [];
if (unitMstFiles.length === 0) {
  console.error(
    `import-batch: no F_UNIT_MST_*.json in ${archiveDir} (see UNIT_ROADMAP → Importing a batch)`,
  );
  process.exit(2);
}
const maxLevels: Record<string, number> = {};
for (const name of unitMstFiles) {
  const rows = readJson(join(archiveDir, name)) as Array<{ unitId: string; unitMaxLevel: string }>;
  for (const row of rows) maxLevels[row.unitId] = Number(row.unitMaxLevel);
}
const data: SourceData = {
  units: readJson(join(sourceDir, "info.json")) as SourceData["units"],
  evolutions: readJson(join(sourceDir, "evo_list.json")) as SourceData["evolutions"],
  items: readJson(join(sourceDir, "items.json")) as SourceData["items"],
  maxLevels,
};

const batch = BatchSchema.parse(readJson(join(originalDir, "batches", `${batchId}.json`)));

const units = new Map<string, Unit>();
const items = new Map<string, unknown>();
const problems: string[] = [];
const materialIds = new Set<string>();

function add(imported: ReturnType<typeof importLine>): void {
  for (const issue of imported.issues) problems.push(`${issue.where}: ${issue.message}`);
  for (const id of imported.materialSourceIds) materialIds.add(id);
  for (const item of imported.items) items.set(item.id, item);
  units.set(imported.unit.id, imported.unit);
}

for (const character of batch.characters) add(importLine(data, character, batch.url));
for (const sourceId of [...materialIds].sort()) {
  const material = importMaterial(data, sourceId);
  if (!units.has(material.unit.id)) add(material);
}

for (const [id, unit] of units) {
  const parsed = UnitSchema.safeParse(unit);
  if (!parsed.success)
    problems.push(...formatIssues(`original/units/${id}.json`, parsed.error.issues));
}
for (const [id, item] of items) {
  const parsed = MaterialItemSchema.safeParse(item);
  if (!parsed.success)
    problems.push(...formatIssues(`original/items/${id}.json`, parsed.error.issues));
}

for (const [id, unit] of units) {
  const forms = unit.forms.map((form) => form.rarity).join(", ");
  console.log(`${unit.stackable ? "material" : "unit    "} ${id} (${unit.name}): ${forms}`);
}
for (const id of items.keys()) console.log(`item     ${id}`);

if (problems.length > 0) {
  for (const line of problems) console.error(line);
  console.error(`import-batch: ${problems.length} problem(s); nothing written`);
  process.exit(1);
}
if (dryRun) {
  console.log(`import-batch: ${units.size} unit(s), ${items.size} item(s) OK (dry run)`);
  process.exit(0);
}

function write(dir: string, id: string, json: unknown): void {
  mkdirSync(join(originalDir, dir), { recursive: true });
  writeFileSync(join(originalDir, dir, `${id}.json`), `${JSON.stringify(json, null, 2)}\n`);
}
for (const [id, unit] of units) write("units", id, unit);
for (const [id, item] of items) write("items", id, item);
console.log(
  `import-batch: wrote ${units.size} unit(s) and ${items.size} item(s) for "${batch.id}"`,
);
