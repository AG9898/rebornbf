// Writes every templated farming-dungeon stage and material enemy, the battle item stages and
// their carriers, and the Crown Shard and Zenith Core stages (src/dungeons.ts), to content/.
// Run after editing a template, then `pnpm format` and `pnpm --filter @bfr/data seed`.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  crownShardStage,
  DUNGEON_FAMILIES,
  dungeonStage,
  familyElements,
  GRAND_HOB,
  HOB_DUNGEONS,
  hobEnemy,
  hobStage,
  ITEM_DUNGEONS,
  itemCarrier,
  itemStage,
  materialEnemy,
  zenithCoreStage,
} from "../src/dungeons.ts";

const content = join(import.meta.dirname, "..", "content");
let written = 0;
for (const entry of [...HOB_DUNGEONS, GRAND_HOB]) {
  const enemy = hobEnemy(entry);
  writeFileSync(
    join(content, "enemies", `${enemy.id}.json`),
    `${JSON.stringify(enemy, null, 2)}\n`,
  );
  written++;
}
for (const entry of HOB_DUNGEONS) {
  const stage = hobStage(entry);
  writeFileSync(join(content, "stages", `${stage.id}.json`), `${JSON.stringify(stage, null, 2)}\n`);
  written++;
}
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
for (const entry of ITEM_DUNGEONS) {
  for (const [dir, json] of [
    ["enemies", itemCarrier(entry)],
    ["stages", itemStage(entry)],
  ] as const) {
    writeFileSync(join(content, dir, `${json.id}.json`), `${JSON.stringify(json, null, 2)}\n`);
    written++;
  }
}
for (const stage of [crownShardStage(), zenithCoreStage()]) {
  writeFileSync(join(content, "stages", `${stage.id}.json`), `${JSON.stringify(stage, null, 2)}\n`);
  written++;
}
console.log(`dungeons: wrote ${written} file(s)`);
