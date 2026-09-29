import { z } from "zod";
import { ContentIdSchema, PositiveIntSchema } from "./common.ts";
import { AilmentSchema } from "./effect.ts";

/**
 * What a battle item does to each unit it reaches (GAME_DESIGN §2 → Battle items). Values are
 * per-item data; the engine applies them in order.
 *
 * - `heal`: restores a flat `amount` of HP to a living unit, capped at max HP.
 * - `cure`: removes the listed ailments (omitted: all six) from a living unit.
 * - `revive`: brings a KO'd unit back with `hpPercent`% of max HP (at least 1).
 * - `bb_fill`: fills a living unit's BB gauge by `bc` crystals (blocked by Curse, capped).
 */
export const ItemEffectSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("heal"), amount: PositiveIntSchema }),
  z.strictObject({
    kind: z.literal("cure"),
    ailments: z.array(AilmentSchema).min(1).optional(),
  }),
  z.strictObject({ kind: z.literal("revive"), hpPercent: z.int().min(1).max(100) }),
  z.strictObject({ kind: z.literal("bb_fill"), bc: z.number().positive() }),
]);
export type ItemEffect = z.infer<typeof ItemEffectSchema>;

/** Battle item targets: the one unit the item is used on, or the whole party. */
export const ITEM_TARGETS = ["single", "party"] as const;
export const ItemTargetSchema = z.enum(ITEM_TARGETS);
export type ItemTarget = z.infer<typeof ItemTargetSchema>;

/**
 * A battle item (heal, cure, revive, BB fill; GAME_DESIGN §2 → Battle items). Items come from
 * dungeon drops only (RESOLVED-17) and are brought into a battle as a per-battle inventory.
 */
export const ItemSchema = z
  .strictObject({
    id: ContentIdSchema,
    name: z.string().min(1),
    description: z.string().min(1).optional(),
    target: ItemTargetSchema,
    effects: z.array(ItemEffectSchema).min(1),
  })
  .refine((item) => item.effects.filter((effect) => effect.kind === "revive").length <= 1, {
    message: "an item has at most one revive effect",
    path: ["effects"],
  });
export type Item = z.infer<typeof ItemSchema>;
