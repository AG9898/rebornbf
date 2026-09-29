import { z } from "zod";
import { ContentIdSchema, NonNegativeIntSchema, PositiveIntSchema } from "./common.ts";

/**
 * One enemy slot in a wave; `enemy` is a `content/enemies/<id>.json` ID. `boss: true` marks the
 * stage boss (only in the last wave; GAME_DESIGN §2).
 */
export const WaveEnemySchema = z.strictObject({
  enemy: ContentIdSchema,
  boss: z.literal(true).optional(),
});
export type WaveEnemy = z.infer<typeof WaveEnemySchema>;

/** One wave: its enemies in slot order (`e0`…). */
export const WaveSchema = z.strictObject({ enemies: z.array(WaveEnemySchema).min(1) });
export type Wave = z.infer<typeof WaveSchema>;

/**
 * Where a story stage sits (GAME_DESIGN §7): its chapter and its story-wide stage number (chapter 1
 * is stages 1–8, chapter 2 is 9–16), plus the line of story shown on the quest map.
 */
export const StoryPlacementSchema = z.strictObject({
  chapter: PositiveIntSchema,
  number: PositiveIntSchema,
  text: z.string().min(1),
});
export type StoryPlacement = z.infer<typeof StoryPlacementSchema>;

/** Rewards for a stage's first clear (granted server-side after replay; GAME_DESIGN §8). */
export const FirstClearRewardSchema = z.strictObject({ gems: NonNegativeIntSchema });
export type FirstClearReward = z.infer<typeof FirstClearRewardSchema>;

/**
 * A quest battle: 1..N waves; the last may contain a boss (GAME_DESIGN §2). Story stages carry a
 * `story` placement and a `firstClear` reward; the demo and test stages carry neither.
 */
export const StageSchema = z.strictObject({
  id: ContentIdSchema,
  name: z.string().min(1),
  story: StoryPlacementSchema.optional(),
  firstClear: FirstClearRewardSchema.optional(),
  waves: z.array(WaveSchema).min(1),
});
export type Stage = z.infer<typeof StageSchema>;

/** Whether the stage has a boss (a `boss: true` enemy, which may only be in the last wave). */
export function isBossStage(stage: Stage): boolean {
  return stage.waves.some((wave) => wave.enemies.some((slot) => slot.boss === true));
}
