import { z } from "zod";
import { NonNegativeIntSchema } from "./common.ts";

/** How the attacker reaches the target; affects start delay (GAME_DESIGN §2 Timing model). */
export const MOVE_TYPES = ["melee", "ranged", "teleport"] as const;
export const MoveTypeSchema = z.enum(MOVE_TYPES);
export type MoveType = z.infer<typeof MoveTypeSchema>;

/** Tolerance for the damage distribution sum (allows e.g. three hits of 33.333…). */
const DISTRIBUTION_EPSILON = 1e-6;

/**
 * Frame-timed attack data. `hitFrames[i]` is the frame offset of hit i after the start delay;
 * `damageDistribution[i]` is its % of the attack's damage. Distributions sum to 100.
 * `dropChecks` is the attack's hidden total BC drop-check count; each hit rolls
 * `dropChecks / hits`, so it must divide evenly by the hit count (GAME_DESIGN §2, RESOLVED-38 item 3).
 */
export const AttackSchema = z
  .strictObject({
    moveType: MoveTypeSchema,
    startDelayFrames: NonNegativeIntSchema,
    hitFrames: z.array(NonNegativeIntSchema).min(1),
    damageDistribution: z.array(z.number().positive()).min(1),
    dropChecks: NonNegativeIntSchema,
  })
  .superRefine((attack, ctx) => {
    if (attack.hitFrames.length !== attack.damageDistribution.length) {
      ctx.addIssue({
        code: "custom",
        path: ["damageDistribution"],
        message: `has ${attack.damageDistribution.length} entries but hitFrames has ${attack.hitFrames.length}`,
      });
    }
    const sum = attack.damageDistribution.reduce((total, pct) => total + pct, 0);
    if (Math.abs(sum - 100) > DISTRIBUTION_EPSILON) {
      ctx.addIssue({
        code: "custom",
        path: ["damageDistribution"],
        message: `must sum to 100 (got ${sum})`,
      });
    }
    if (attack.dropChecks % attack.hitFrames.length !== 0) {
      ctx.addIssue({
        code: "custom",
        path: ["dropChecks"],
        message: `must divide evenly by the hit count ${attack.hitFrames.length} (got ${attack.dropChecks})`,
      });
    }
    for (let i = 1; i < attack.hitFrames.length; i++) {
      const prev = attack.hitFrames[i - 1] ?? 0;
      const current = attack.hitFrames[i] ?? 0;
      if (current < prev) {
        ctx.addIssue({
          code: "custom",
          path: ["hitFrames", i],
          message: "hit frames must be in non-decreasing order",
        });
      }
    }
  });
export type Attack = z.infer<typeof AttackSchema>;
