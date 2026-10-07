import { existsSync, readdirSync, readFileSync } from "node:fs";
import { type Unit, UnitSchema } from "@bfr/data";

function load(directory: URL): Unit[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => {
      const unit = UnitSchema.parse(JSON.parse(readFileSync(new URL(file, directory), "utf8")));
      if (file !== `${unit.id}.json`) throw new Error(`${file}: unit ID must match file name`);
      return unit;
    });
}

/** Shared by the roster invariants and reference coverage check; discovers new content. */
export const units = load(new URL("../../../data/content/units/", import.meta.url));

/**
 * Units imported from the original's data (UNIT_ROADMAP), staged or released. They get the same
 * engine invariants; their kits are checked against the source by the importer, not by kit cases.
 */
export const originalUnits = load(
  new URL("../../../data/content/original/units/", import.meta.url),
);
