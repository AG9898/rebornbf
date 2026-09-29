import { z } from "zod";
import { AttackSchema } from "./attack.ts";
import { ContentIdSchema, ElementSchema, PositiveIntSchema } from "./common.ts";
import { checkAttackShapes, EffectIdSchema, EffectSchema } from "./effect.ts";
import { StatsSchema } from "./unit.ts";

/** Skill reference used by AI rules for the enemy's normal attack. */
export const NORMAL_ATTACK_SKILL = "normal";

/**
 * One enemy skill: optional frame-timed attacks plus effects (GAME_DESIGN §4 — enemy skills use
 * the same effect catalog as units). A skill must do something: at least one attack or effect.
 * As in a burst, each attack has one attack-shape effect, in order.
 */
export const EnemySkillSchema = z
  .strictObject({
    id: ContentIdSchema,
    name: z.string().min(1),
    attacks: z.array(AttackSchema),
    effects: z.array(EffectSchema),
  })
  .refine((skill) => skill.attacks.length + skill.effects.length > 0, {
    message: "needs at least one attack or effect",
    path: ["attacks"],
  })
  .superRefine((skill, ctx) => checkAttackShapes(skill.attacks.length, skill.effects, ctx));
export type EnemySkill = z.infer<typeof EnemySkillSchema>;

/** How an AI rule picks its player target. */
export const AI_TARGETS = ["random", "lowest_hp"] as const;
export const AiTargetSchema = z.enum(AI_TARGETS);
export type AiTarget = z.infer<typeof AiTargetSchema>;

/** Battle-state checks for `condition` rules (GAME_DESIGN §5, e.g. "player has no mitigation"). */
export const AiConditionSchema = z.discriminatedUnion("type", [
  /** True when no living player unit has an active effect with this ID. */
  z.strictObject({ type: z.literal("party_lacks_effect"), effect: EffectIdSchema }),
  /** True when at least one living player unit has an active effect with this ID. */
  z.strictObject({ type: z.literal("party_has_effect"), effect: EffectIdSchema }),
]);
export type AiCondition = z.infer<typeof AiConditionSchema>;

/** `skill` is an ID from the enemy's `skills`, or `"normal"` for its normal attack. */
const aiAction = {
  skill: z.union([ContentIdSchema, z.literal(NORMAL_ATTACK_SKILL)]),
  target: AiTargetSchema,
};

/**
 * One AI script rule (GAME_DESIGN §5). Rules are evaluated in order each enemy turn and the first
 * that fires is used; the last rule must be the only `default` rule.
 */
export const AiRuleSchema = z.discriminatedUnion("when", [
  /** Fires on enemy turns `offset + n`, `offset + 2n`, … (turns counted from 1). */
  z.strictObject({
    when: z.literal("every_n_turns"),
    n: PositiveIntSchema,
    offset: z.int().nonnegative().optional(),
    ...aiAction,
  }),
  /** Fires once, the first enemy turn the enemy's HP is at or below `hpPercent` of max. */
  z.strictObject({
    when: z.literal("hp_threshold_once"),
    hpPercent: z.number().gt(0).lt(100),
    ...aiAction,
  }),
  /** Fires whenever `condition` holds. */
  z.strictObject({
    when: z.literal("condition"),
    condition: AiConditionSchema,
    ...aiAction,
  }),
  /** Fallback when no earlier rule fires. */
  z.strictObject({ when: z.literal("default"), ...aiAction }),
]);
export type AiRule = z.infer<typeof AiRuleSchema>;

/** Percentage drop chance with a fixed amount per successful roll. */
const CurrencyDropSchema = z.strictObject({
  rate: z.number().min(0).max(100),
  amount: PositiveIntSchema,
});

/**
 * A capture drop (GAME_DESIGN §7 → Farming dungeons, RESOLVED-70): defeating this enemy grants
 * `unit` (a `content/units/` ID, in its first form at level 1) with a `rate`% chance, rolled on the
 * server at reward settlement. A stage slot marked `capture: "always"` overrides the rate.
 */
export const CaptureDropSchema = z.strictObject({
  unit: ContentIdSchema,
  rate: z.number().min(0).max(100),
});
export type CaptureDrop = z.infer<typeof CaptureDropSchema>;

/**
 * Per-enemy drop table (GAME_DESIGN §2 Drops). `bcResistance` is the base BC drop resistance as a
 * fraction. Zel and item rates are % per defeated enemy, each rolled once on the server at reward
 * settlement (GAME_DESIGN §8); items are granted one at a time. Omitted fields mean no resistance /
 * no drop.
 */
export const DropTableSchema = z.strictObject({
  bcResistance: z.number().min(0).max(1).optional(),
  zel: CurrencyDropSchema.optional(),
  karma: CurrencyDropSchema.optional(),
  items: z
    .array(z.strictObject({ item: ContentIdSchema, rate: z.number().min(0).max(100) }))
    .optional(),
  capture: CaptureDropSchema.optional(),
});
export type DropTable = z.infer<typeof DropTableSchema>;

/** An original enemy or boss (GAME_DESIGN §5). Same stat and effect model as units. */
export const EnemySchema = z
  .strictObject({
    id: ContentIdSchema,
    name: z.string().min(1),
    element: ElementSchema,
    stats: StatsSchema,
    normalAttack: AttackSchema,
    skills: z.array(EnemySkillSchema),
    ai: z.array(AiRuleSchema).min(1),
    drops: DropTableSchema,
  })
  .superRefine((enemy, ctx) => {
    const skillIds = new Set<string>();
    enemy.skills.forEach((skill, i) => {
      if (skill.id === NORMAL_ATTACK_SKILL || skillIds.has(skill.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["skills", i, "id"],
          message:
            skill.id === NORMAL_ATTACK_SKILL
              ? `"${NORMAL_ATTACK_SKILL}" is reserved for the normal attack`
              : `duplicate skill ID "${skill.id}"`,
        });
      }
      skillIds.add(skill.id);
    });
    enemy.ai.forEach((rule, i) => {
      if (rule.skill !== NORMAL_ATTACK_SKILL && !skillIds.has(rule.skill)) {
        ctx.addIssue({
          code: "custom",
          path: ["ai", i, "skill"],
          message: `unknown skill "${rule.skill}"`,
        });
      }
      const last = i === enemy.ai.length - 1;
      if (rule.when === "default" && !last) {
        ctx.addIssue({
          code: "custom",
          path: ["ai", i, "when"],
          message: "the default rule must be the last rule",
        });
      } else if (last && rule.when !== "default") {
        ctx.addIssue({
          code: "custom",
          path: ["ai", i, "when"],
          message: 'the last rule must be "default"',
        });
      }
    });
  });
export type Enemy = z.infer<typeof EnemySchema>;
