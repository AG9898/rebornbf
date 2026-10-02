import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CHAPTER_1_DUNGEON_MOBS, StageSchema } from "@bfr/data";
import { describe, expect, it } from "vitest";
import { STORY_STAGES } from "../../lib/quests/quest-map.ts";
import { trialStage } from "../../lib/quests/trials.ts";
import stageArt from "./stage-art.json";
import { stageBackground, stageEnemyArt } from "./stage-art.ts";

const artDir = join(import.meta.dirname, "..", "..", "..", "..", "..", "art");
const backgroundsPath = join(artDir, "backgrounds", "backgrounds.json");
const enemiesPath = join(artDir, "enemies", "enemies.json");

interface BackgroundManifest {
  backgrounds: Record<
    string,
    { chapters: number[]; stages: string[]; series?: string[]; fallback?: string }
  >;
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
        Object.entries(manifest.backgrounds).map(([id, { chapters, stages, series, fallback }]) => [
          id,
          { chapters, stages, ...(series ? { series } : {}), ...(fallback ? { fallback } : {}) },
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

describe("chapter 2 art", () => {
  it("fights on the coast with each coast enemy's own sprite", () => {
    expect(stageArt.backgrounds["saltglass-coast"]).toEqual({ chapters: [2], stages: [] });
    expect(
      existsSync(
        join(import.meta.dirname, "../../../public/assets/backgrounds/saltglass-coast.webp"),
      ),
    ).toBe(true);
    for (const stage of STORY_STAGES.filter((s) => s.story?.chapter === 2)) {
      expect(stageBackground(stage)).toBe("saltglass-coast");
      const waves = stageEnemyArt(stage);
      expect(waves.map((w) => w.length)).toEqual(stage.waves.map((w) => w.enemies.length));
      expect(waves.map((w) => w.map((sprite) => sprite.id))).toEqual(
        stage.waves.map((w) => w.enemies.map((enemy) => enemy.enemy)),
      );
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

describe("dungeon art", () => {
  const stagesDir = join(import.meta.dirname, "../../../../../packages/data/content/stages");
  const dungeonStages = readdirSync(stagesDir)
    .filter((file) => file.startsWith("dungeon-"))
    .map((file) => StageSchema.parse(JSON.parse(readFileSync(join(stagesDir, file), "utf8"))));
  const companions = new Set(Object.values(CHAPTER_1_DUNGEON_MOBS));

  it("fights every chapter 1 dungeon series in the fairy meadow (M6-07M)", () => {
    expect(dungeonStages.length).toBeGreaterThan(0);
    expect(
      existsSync(join(import.meta.dirname, "../../../public/assets/backgrounds/fairy-meadow.webp")),
    ).toBe(true);
    for (const stage of dungeonStages) expect(stageBackground(stage)).toBe("fairy-meadow");
  });

  it("has a locked sprite for every companion mob a dungeon fields", () => {
    const fielded = new Set(
      dungeonStages.flatMap((stage) =>
        stage.waves.flatMap((wave) => wave.enemies.map((slot) => slot.enemy)),
      ),
    );
    const enemies: Record<string, { canvas: number }> = stageArt.enemies;
    for (const mob of companions) {
      expect(fielded.has(mob)).toBe(true);
      expect(enemies[mob]?.canvas).toBe(128);
      expect(
        existsSync(
          join(import.meta.dirname, "../../../public/assets/enemies", mob, "battle-idle.png"),
        ),
      ).toBe(true);
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
