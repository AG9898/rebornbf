import type { Stage } from "@bfr/data";
// A web-local copy of the art manifests' selection fields, so the app builds without art/ (the
// public mirror excludes it, RESOLVED-61); stage-art.test.ts keeps it in step with art/.
import stageArt from "./stage-art.json";

/** Battle art is selected from the locked background manifest, by chapter or stage ID. */
export function stageBackground(stage: Stage): string {
  const match = Object.entries(stageArt.backgrounds).find(([, entry]) =>
    stage.story ? entry.chapters.includes(stage.story.chapter) : entry.stages.includes(stage.id),
  );
  if (!match) throw new Error(`No battle background for stage ${stage.id}`);
  return match[0];
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
