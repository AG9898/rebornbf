import { z } from "zod";
import { ContentIdSchema, NonNegativeIntSchema, PositiveIntSchema } from "./common.ts";
import { RaritySchema } from "./unit.ts";

/**
 * One enemy slot in a wave; `enemy` is a `content/enemies/<id>.json` ID. `boss: true` marks the
 * stage boss (only in the last wave; GAME_DESIGN §2). `capture: "always"` marks a dungeon's
 * final-wave material enemy, always captured whatever its capture rate (GAME_DESIGN §7 → Farming
 * dungeons); the enemy must have a capture drop.
 */
export const WaveEnemySchema = z.strictObject({
  enemy: ContentIdSchema,
  boss: z.literal(true).optional(),
  capture: z.literal("always").optional(),
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
 * A dungeon's key item (the Crown Shard or Zenith Core; GAME_DESIGN §7 → Farming dungeons): 1 on
 * the stage's first clear, then one with a `rate`% chance per later clear.
 */
export const KeyItemRuleSchema = z.strictObject({
  item: ContentIdSchema,
  rate: z.number().min(0).max(100),
});
export type KeyItemRule = z.infer<typeof KeyItemRuleSchema>;

/**
 * Where a farming-dungeon stage sits (GAME_DESIGN §7 → Farming dungeons, RESOLVED-67/70): its
 * `series` and the `gate` stage whose first clear opens it (a story stage, or Trial 1 for the
 * Zenith Core and growth series). `keyItem` is set on the Crown Shard and Zenith Core stages.
 * `ramp` is the series' difficulty ramp in percent (RESOLVED-71): every enemy's HP and ATK are
 * raised by it when the battle is built (`rampedStats`); absent means 0.
 */
export const DungeonPlacementSchema = z.strictObject({
  series: ContentIdSchema,
  gate: ContentIdSchema,
  keyItem: KeyItemRuleSchema.optional(),
  ramp: z.number().int().min(1).max(100).optional(),
});
export type DungeonPlacement = z.infer<typeof DungeonPlacementSchema>;

/** The mechanics the tutorial teaches, one per script step (GAME_DESIGN §8 → New player flow). */
export const TUTORIAL_LESSONS = ["tap", "burst", "spark", "guard", "crystals"] as const;
export const TutorialLessonSchema = z.enum(TUTORIAL_LESSONS);
export type TutorialLesson = z.infer<typeof TutorialLessonSchema>;

/** A battle slot the script acts with: `p0`–`p4` for the squad, `ally` for the sixth unit. */
const PlayerSlotSchema = z.string().regex(/^(p[0-4]|ally)$/, "must be p0–p4 or ally");
/** An enemy slot of the current wave. */
const EnemySlotSchema = z.string().regex(/^e[0-9]+$/, "must be e0, e1, …");

const scriptInput = {
  actor: PlayerSlotSchema,
  /** Ticks after the turn's first tick at which the input is made. */
  delay: NonNegativeIntSchema,
};

/** One scripted player input; the same actions as the engine's attack, burst, and guard inputs. */
export const TutorialInputSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("attack"), ...scriptInput, target: EnemySlotSchema.optional() }),
  z.strictObject({
    type: z.literal("burst"),
    ...scriptInput,
    tier: z.enum(["bb", "sbb"]),
    target: EnemySlotSchema.optional(),
  }),
  z.strictObject({ type: z.literal("guard"), ...scriptInput }),
]);
export type TutorialInput = z.infer<typeof TutorialInputSchema>;

/** One player turn of the script: the lesson it teaches and the inputs that demonstrate it. */
export const TutorialStepSchema = z.strictObject({
  lesson: TutorialLessonSchema,
  inputs: z.array(TutorialInputSchema).min(1),
});
export type TutorialStep = z.infer<typeof TutorialStepSchema>;

/**
 * The tutorial battle (GAME_DESIGN §8 → New player flow, RESOLVED-68): a preset squad of `units`
 * (squad order, leader first) plus an optional `ally`, all in their `rarity`★ form at `level`
 * with no type gains; the battle `seed`; and the scripted turns, played in order.
 */
export const TutorialSchema = z.strictObject({
  units: z.array(ContentIdSchema).min(1).max(5),
  ally: ContentIdSchema.optional(),
  rarity: RaritySchema,
  level: PositiveIntSchema,
  seed: NonNegativeIntSchema,
  script: z.array(TutorialStepSchema).min(1),
});
export type Tutorial = z.infer<typeof TutorialSchema>;

/**
 * A quest battle: 1..N waves; the last may contain a boss (GAME_DESIGN §2). Story stages carry a
 * `story` placement and a `firstClear` reward; farming-dungeon stages carry a `dungeon` placement
 * instead (never both); the demo and test stages carry neither. The tutorial stage carries a
 * `tutorial` block and no story, dungeon, or first-clear reward, since it grants nothing. Only a
 * dungeon stage may mark a final-wave slot `capture: "always"`.
 */
export const StageSchema = z
  .strictObject({
    id: ContentIdSchema,
    name: z.string().min(1),
    story: StoryPlacementSchema.optional(),
    dungeon: DungeonPlacementSchema.optional(),
    firstClear: FirstClearRewardSchema.optional(),
    tutorial: TutorialSchema.optional(),
    waves: z.array(WaveSchema).min(1),
  })
  .superRefine((stage, ctx) => {
    if (stage.story && stage.dungeon) {
      ctx.addIssue({
        code: "custom",
        path: ["dungeon"],
        message: "a stage is a story stage or a dungeon stage, not both",
      });
    }
    if (stage.tutorial && (stage.story || stage.dungeon || stage.firstClear)) {
      ctx.addIssue({
        code: "custom",
        path: ["tutorial"],
        message: "the tutorial grants nothing: no story, dungeon, or first-clear reward",
      });
    }
    if (stage.dungeon && stage.dungeon.gate === stage.id) {
      ctx.addIssue({
        code: "custom",
        path: ["dungeon", "gate"],
        message: "a stage cannot gate itself",
      });
    }
    stage.waves.forEach((wave, w) => {
      wave.enemies.forEach((slot, e) => {
        if (slot.capture === undefined) return;
        const path = ["waves", w, "enemies", e, "capture"];
        if (!stage.dungeon) {
          ctx.addIssue({ code: "custom", path, message: "only a dungeon stage captures" });
        } else if (w !== stage.waves.length - 1) {
          ctx.addIssue({ code: "custom", path, message: "always-captured is for the final wave" });
        }
      });
    });
  });
export type Stage = z.infer<typeof StageSchema>;

/** Whether the stage has a boss (a `boss: true` enemy, which may only be in the last wave). */
export function isBossStage(stage: Stage): boolean {
  return stage.waves.some((wave) => wave.enemies.some((slot) => slot.boss === true));
}
