import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import stageArt from "./stage-art.json";

const artDir = join(import.meta.dirname, "..", "..", "..", "..", "..", "art");
const backgroundsPath = join(artDir, "backgrounds", "backgrounds.json");
const enemiesPath = join(artDir, "enemies", "enemies.json");

interface BackgroundManifest {
  backgrounds: Record<string, { chapters: number[]; stages: string[] }>;
}
interface EnemyManifest {
  enemies: Record<string, { canvas: number }>;
}

// The public mirror has no art/ (RESOLVED-61), so this drift check runs in the private repo only.
describe.skipIf(!existsSync(backgroundsPath) || !existsSync(enemiesPath))(
  "stage-art.json matches the art manifests",
  () => {
    it("has each background's chapters and stages", () => {
      const manifest = JSON.parse(readFileSync(backgroundsPath, "utf8")) as BackgroundManifest;
      const expected = Object.fromEntries(
        Object.entries(manifest.backgrounds).map(([id, { chapters, stages }]) => [
          id,
          { chapters, stages },
        ]),
      );
      expect(stageArt.backgrounds).toEqual(expected);
    });

    it("has each enemy sprite's canvas", () => {
      const manifest = JSON.parse(readFileSync(enemiesPath, "utf8")) as EnemyManifest;
      const expected = Object.fromEntries(
        Object.entries(manifest.enemies).map(([id, { canvas }]) => [id, { canvas }]),
      );
      expect(stageArt.enemies).toEqual(expected);
    });
  },
);
