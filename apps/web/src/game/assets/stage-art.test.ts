import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STORY_STAGES } from "../../lib/quests/quest-map.ts";
import { trialStage } from "../../lib/quests/trials.ts";
import stageArt from "./stage-art.json";
import { stageBackground, stageEnemyArt } from "./stage-art.ts";

const artDir = join(import.meta.dirname, "..", "..", "..", "..", "..", "art");
const backgroundsPath = join(artDir, "backgrounds", "backgrounds.json");
const enemiesPath = join(artDir, "enemies", "enemies.json");

interface BackgroundManifest {
  backgrounds: Record<string, { chapters: number[]; stages: string[]; fallback?: string }>;
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
        Object.entries(manifest.backgrounds).map(([id, { chapters, stages, fallback }]) => [
          id,
          { chapters, stages, ...(fallback ? { fallback } : {}) },
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

describe("chapter 2 pending art", () => {
  it("reserves its own theme and resolves temporary art for every coast wave", () => {
    expect(stageArt.backgrounds["saltglass-coast"]).toEqual({
      chapters: [2],
      stages: [],
      fallback: "plains",
    });
    for (const stage of STORY_STAGES.filter((s) => s.story?.chapter === 2)) {
      expect(stageBackground(stage)).toBe("plains");
      const waves = stageEnemyArt(stage);
      expect(waves.map((w) => w.length)).toEqual(stage.waves.map((w) => w.enemies.length));
      for (const sprite of waves.flat()) {
        expect(sprite.size).toBeGreaterThan(0);
        expect(
          existsSync(
            join(
              import.meta.dirname,
              "../../../public/assets/enemies",
              sprite.id,
              "battle-idle.png",
            ),
          ),
        ).toBe(true);
      }
    }
  });
});

describe("trial art", () => {
  it("fights every trial in the trial hall", () => {
    const stage = trialStage("trial-01-captain-locke");
    expect(stage).toBeDefined();
    if (!stage) return;
    expect(stageBackground(stage)).toBe("trial-hall");
    expect(
      existsSync(join(import.meta.dirname, "../../../public/assets/backgrounds/trial-hall.webp")),
    ).toBe(true);
  });
});
