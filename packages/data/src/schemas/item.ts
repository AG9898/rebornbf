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
 * `kind` is optional: a content item without one is a battle item.
 */
export const ItemSchema = z
  .strictObject({
    id: ContentIdSchema,
    kind: z.literal("battle").optional(),
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

/**
 * A non-battle material item: stackable in the player's item inventory and spent by evolution
 * recipes, never usable in battle (GAME_DESIGN §6 → Evolution materials; the Crown Shard,
 * RESOLVED-67).
 */
export const MaterialItemSchema = z.strictObject({
  id: ContentIdSchema,
  kind: z.literal("material"),
  name: z.string().min(1),
  description: z.string().min(1).optional(),
});
export type MaterialItem = z.infer<typeof MaterialItemSchema>;

/** One file in `content/items/`: a battle item or a material item. */
export const ItemContentSchema = z.union([ItemSchema, MaterialItemSchema]);
export type ItemContent = z.infer<typeof ItemContentSchema>;
