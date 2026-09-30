// Writes every templated farming-dungeon stage and material enemy, and the Crown Shard stage
// (src/dungeons.ts), to content/.
// Run after editing a template, then `pnpm format` and `pnpm --filter @bfr/data seed`.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  crownShardStage,
  DUNGEON_FAMILIES,
  dungeonStage,
  familyElements,
  materialEnemy,
} from "../src/dungeons.ts";

const content = join(import.meta.dirname, "..", "content");
let written = 0;
for (const family of Object.values(DUNGEON_FAMILIES)) {
  for (const element of familyElements(family)) {
    for (const [dir, json] of [
      ["enemies", materialEnemy(family, element)],
      ["stages", dungeonStage(family, element)],
    ] as const) {
      writeFileSync(join(content, dir, `${json.id}.json`), `${JSON.stringify(json, null, 2)}\n`);
      written++;
    }
  }
}
const crown = crownShardStage();
writeFileSync(join(content, "stages", `${crown.id}.json`), `${JSON.stringify(crown, null, 2)}\n`);
written++;
console.log(`dungeons: wrote ${written} file(s)`);
