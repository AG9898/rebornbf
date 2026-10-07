import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CHAPTER_1_DUNGEON_MOBS, StageSchema } from "@bfr/data";
import { describe, expect, it } from "vitest";
import { STORY_STAGES } from "../../lib/quests/quest-map.ts";
import { trialStage } from "../../lib/quests/trials.ts";
import stageArt from "./stage-art.json";
import { stageBackground, stageEnemyArt } from "./stage-art.ts";

const artDir = join(import.meta.dirname, "..", "..", "..", "..", "..", "art", "legacy");
const backgroundsPath = join(artDir, "backgrounds", "backgrounds.json");
const enemiesPath = join(artDir, "enemies", "enemies.json");

interface BackgroundManifest {
  backgrounds: Record<
    string,
    { chapters: number[]; stages: string[]; series?: string[]; fallback?: string }
  >;
}
interface EnemyManifest {
  enemies: Record<string, { canvas: number; fallback?: string }>;
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
        Object.entries(manifest.enemies).map(([id, { canvas, fallback }]) => [
          id,
          { canvas, ...(fallback ? { fallback } : {}) },
        ]),
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
    for (const stage of dungeonStages.filter((s) => s.dungeon?.series !== "toads")) {
      expect(stageBackground(stage)).toBe("fairy-meadow");
    }
  });

  it("fights the toad series in the Lantern Grotto (M6-07N)", () => {
    const toads = dungeonStages.filter((stage) => stage.dungeon?.series === "toads");
    expect(toads).toHaveLength(1);
    expect(stageArt.backgrounds["lantern-grotto"]).toEqual({
      chapters: [],
      stages: [],
      series: ["toads"],
    });
    for (const stage of toads) expect(stageBackground(stage)).toBe("lantern-grotto");
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

  const publicDir = join(import.meta.dirname, "../../../public");

  it("resolves every enemy of every dungeon stage to an exported sprite (M6-07O)", () => {
    for (const stage of dungeonStages) {
      const waves = stageEnemyArt(stage);
      expect(waves.map((w) => w.map((sprite) => sprite.id))).toEqual(
        stage.waves.map((w) => w.enemies.map((enemy) => enemy.enemy)),
      );
      for (const sprite of waves.flat()) {
        expect(sprite.size).toBeGreaterThan(0);
        expect(existsSync(join(publicDir, sprite.url)), `${stage.id}: ${sprite.url}`).toBe(true);
      }
      // A rare or final-wave spawn swaps in for a slot, so it needs a sprite too.
      const spawns = [
        ...(stage.dungeon?.rareSpawn ? [stage.dungeon.rareSpawn] : []),
        ...(stage.dungeon?.finalSpawns ?? []),
      ];
      for (const { enemy } of spawns) {
        const [sprite] = stageEnemyArt({ ...stage, waves: [{ enemies: [{ enemy }] }] }).flat();
        expect(sprite && existsSync(join(publicDir, sprite.url)), `${stage.id}: ${enemy}`).toBe(
          true,
        );
      }
    }
  });

  it("shows each material enemy as its unit's single-form idle sprite (M6-07O)", () => {
    const enemies: Record<string, unknown> = stageArt.enemies;
    const materials = dungeonStages.flatMap((stage) =>
      stageEnemyArt(stage)
        .flat()
        .filter((sprite) => sprite.id.startsWith("dg-") && !sprite.id.startsWith("dg-item-")),
    );
    expect(materials.length).toBeGreaterThan(0);
    for (const sprite of materials) {
      const unit = sprite.id.slice("dg-".length);
      expect(enemies[sprite.id]).toBeUndefined();
      expect(sprite.size).toBe(128);
      expect(sprite.flipX).toBe(true);
      expect(sprite.url).toMatch(new RegExp(`^/assets/units/${unit}/battle-idle-\\w+\\.png$`));
      expect(existsSync(join(publicDir, "assets/enemies", sprite.id))).toBe(false);
    }
    const cinder = dungeonStages.find((stage) => stage.id === "dungeon-cinder-sprite");
    expect(cinder && stageEnemyArt(cinder)[0]?.[0]?.url).toBe(
      "/assets/units/cinder-sprite/battle-idle-2star.png",
    );
  });

  it("shows the chapter 2 dungeon mobs with their own locked sprites (M6-07N)", () => {
    const toads = dungeonStages.find((stage) => stage.dungeon?.series === "toads");
    expect(toads).toBeDefined();
    if (!toads) return;
    const urls = Object.fromEntries(
      stageEnemyArt(toads)
        .flat()
        .filter((sprite) => sprite.id.startsWith("dg2-"))
        .map((sprite) => [sprite.id, sprite.url]),
    );
    expect(urls).toEqual({
      "dg2-vent-shrimp": "/assets/enemies/dg2-vent-shrimp/battle-idle.png",
      "dg2-brine-urchin": "/assets/enemies/dg2-brine-urchin/battle-idle.png",
      "dg2-glass-jelly": "/assets/enemies/dg2-glass-jelly/battle-idle.png",
    });
  });

  it("has a locked sprite for every item Hoarder (M6-07P)", () => {
    const enemies: Record<string, { canvas: number }> = stageArt.enemies;
    const itemStages = dungeonStages.filter((stage) => stage.dungeon?.series === "items");
    expect(itemStages).toHaveLength(6);
    for (const stage of itemStages) {
      expect(stageEnemyArt(stage).flat()).toHaveLength(9);
      const hoarder = stage.id.replace("dungeon-item-", "dg-item-");
      expect(enemies[hoarder]?.canvas).toBe(128);
      expect(
        existsSync(
          join(import.meta.dirname, "../../../public/assets/enemies", hoarder, "battle-idle.png"),
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
