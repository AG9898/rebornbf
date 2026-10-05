import { readdirSync, readFileSync } from "node:fs";
import { UnitSchema } from "@bfr/data";

const directory = new URL("../../../data/content/units/", import.meta.url);

/** Shared by the roster invariants and reference coverage check; discovers new content. */
export const units = readdirSync(directory)
  .filter((file) => file.endsWith(".json"))
  .sort()
  .map((file) => {
    const unit = UnitSchema.parse(JSON.parse(readFileSync(new URL(file, directory), "utf8")));
    if (file !== `${unit.id}.json`) throw new Error(`${file}: unit ID must match file name`);
    return unit;
  });
