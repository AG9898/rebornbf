import type { Stage } from "@bfr/data";
// A web-local copy of the art manifests' selection fields, so the app builds without art/ (the
// public mirror excludes it, RESOLVED-61); stage-art.test.ts keeps it in step with art/.
import stageArt from "./stage-art.json";

interface BackgroundEntry {
  chapters: number[];
  stages: string[];
  /** Farming-dungeon series fought on this background (RESOLVED-72: the chapter dungeon theme). */
  series?: string[];
  fallback?: string;
}

/**
 * Battle art is selected from the locked background manifest: story stages by chapter, dungeon
 * stages by series, and any other stage by its ID.
 */
export function stageBackground(stage: Stage): string {
  const backgrounds: Record<string, BackgroundEntry> = stageArt.backgrounds;
  const match = Object.entries(backgrounds).find(([, entry]) => {
    if (stage.story) return entry.chapters.includes(stage.story.chapter);
    if (stage.dungeon) return (entry.series ?? []).includes(stage.dungeon.series);
    return entry.stages.includes(stage.id);
  });
  if (!match) throw new Error(`No battle background for stage ${stage.id}`);
  // A reserved theme uses its explicitly named placeholder until its master is approved.
  return match[1].fallback ?? match[0];
}

export const backgroundUrl = (id: string): string => `/assets/backgrounds/${id}.webp`;

/** Wave order is retained so a replacement wave uses its own enemy sprites. */
export function stageEnemyArt(stage: Stage): readonly (readonly { id: string; size: number }[])[] {
  const sprites: Record<string, { canvas: number }> = stageArt.enemies;
  return stage.waves.map((wave) =>
    wave.enemies.map((enemy) => {
      const sprite = sprites[enemy.enemy];
      if (!sprite) throw new Error(`No battle sprite for enemy ${enemy.enemy}`);
      return { id: enemy.enemy, size: sprite.canvas };
    }),
  );
}
