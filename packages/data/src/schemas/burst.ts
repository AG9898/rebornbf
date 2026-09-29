import { z } from "zod";
import { AttackSchema } from "./attack.ts";
import { PositiveIntSchema } from "./common.ts";
import { checkAttackShapes, EffectSchema } from "./effect.ts";

/**
 * One burst tier. `cost` is the BC cost of this tier (GAME_DESIGN §2 BB gauge tiers: bbCost,
 * sbbCost, ubbCost). `attacks` holds the burst's frame-timed attacks (empty for a non-damaging
 * burst); `effects` holds one attack-shape effect per attack, in order, whose `value` is that
 * attack's BB damage modifier (additive with ATK% buffs, 300% → 3.0), plus the other effects.
 */
export const BurstSchema = z
  .strictObject({
    name: z.string().min(1),
    cost: PositiveIntSchema,
    attacks: z.array(AttackSchema),
    effects: z.array(EffectSchema),
  })
  .superRefine((burst, ctx) => checkAttackShapes(burst.attacks.length, burst.effects, ctx));
export type Burst = z.infer<typeof BurstSchema>;

/** Burst tiers of one form. SBB and UBB exist only on forms that unlock them. */
export const BurstTiersSchema = z.strictObject({
  bb: BurstSchema,
  sbb: BurstSchema.optional(),
  ubb: BurstSchema.optional(),
});
export type BurstTiers = z.infer<typeof BurstTiersSchema>;
