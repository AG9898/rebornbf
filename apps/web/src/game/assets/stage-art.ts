import type { Stage } from "@bfr/data";
import { formArtFile, unitContent } from "../../lib/units/owned-units.ts";
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

/** One enemy's battle art: its texture key (the enemy ID), canvas size, and exported image. */
export interface EnemyArt {
  readonly id: string;
  readonly size: number;
  readonly url: string;
  /** Unit exports face left (toward the enemies), so a unit-backed enemy is mirrored to face the party. */
  readonly flipX?: boolean;
}

/** Unit idle sprites share the party's 128 px canvas. */
const UNIT_SPRITE_CANVAS = 128;

/**
 * A dungeon material enemy (`dg-<unit>`) shows its unit's exported battle-idle sprite, the unit's
 * single form (RESOLVED-72); undefined for any other enemy or a unit without exported art.
 */
function materialUnitArt(enemyId: string): string | undefined {
  if (!enemyId.startsWith("dg-")) return undefined;
  const unitId = enemyId.slice("dg-".length);
  const form = unitContent(unitId)?.forms[0];
  const file = form ? formArtFile(unitId, form.rarity) : null;
  return file ? `/assets/units/${unitId}/battle-idle-${file}.png` : undefined;
}

/**
 * Wave order is retained so a replacement wave uses its own enemy sprites. An enemy uses its locked
 * sprite in the enemy manifest, a reserved entry's named `fallback` sprite until its own is locked,
 * or (a dungeon material enemy) its unit's idle sprite.
 */
export function stageEnemyArt(stage: Stage): readonly (readonly EnemyArt[])[] {
  const sprites: Record<string, { canvas: number; fallback?: string }> = stageArt.enemies;
  return stage.waves.map((wave) =>
    wave.enemies.map((enemy) => {
      const id = enemy.enemy;
      const sprite = sprites[id];
      if (sprite) {
        return { id, size: sprite.canvas, url: enemySpriteUrl(sprite.fallback ?? id) };
      }
      const unitArt = materialUnitArt(id);
      if (unitArt) return { id, size: UNIT_SPRITE_CANVAS, url: unitArt, flipX: true };
      throw new Error(`No battle sprite for enemy ${id}`);
    }),
  );
}

export const enemySpriteUrl = (id: string): string => `/assets/enemies/${id}/battle-idle.png`;
