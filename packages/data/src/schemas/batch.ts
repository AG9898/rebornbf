import { z } from "zod";
import { ContentIdSchema, PositiveIntSchema } from "./common.ts";

/**
 * How a character was obtained in the original, from the wiki's *Unit Batches* tag
 * (UNIT_ROADMAP → How characters are obtained): `rare` Rare Summon, `limited` time-limited summon,
 * `free` story, vortex, event, or Honor Summon rewards.
 */
export const BATCH_TAGS = ["rare", "limited", "free"] as const;
export const BatchTagSchema = z.enum(BATCH_TAGS);
export type BatchTag = z.infer<typeof BatchTagSchema>;

/**
 * `staged`: imported into `content/original/units/` and validated, but not obtainable: no banner,
 * stage, guest, or starter may reference its characters. `released`: obtainable (RESOLVED-100).
 */
export const BATCH_STATUSES = ["staged", "released"] as const;
export const BatchStatusSchema = z.enum(BATCH_STATUSES);
export type BatchStatus = z.infer<typeof BatchStatusSchema>;

/** One character of a batch: its content unit ID and the source data's unit category. */
export const BatchCharacterSchema = z.strictObject({
  unit: ContentIdSchema,
  /** The character's name, as the wiki's batch page lists it. */
  name: z.string().min(1),
  /** The character's unit category in the source data (e.g. 10010). */
  category: PositiveIntSchema,
  tag: BatchTagSchema,
  /** The renamed launch unit this character replaces when the batch is released (RESOLVED-99). */
  replaces: ContentIdSchema.optional(),
});
export type BatchCharacter = z.infer<typeof BatchCharacterSchema>;

/**
 * An original unit batch (`content/original/batches/<id>.json`, UNIT_ROADMAP → Batch Order): the
 * import script's input and the release switch for its characters.
 */
export const BatchSchema = z
  .strictObject({
    id: ContentIdSchema,
    name: z.string().min(1),
    /** Position in UNIT_ROADMAP's Batch Order table. */
    order: PositiveIntSchema,
    url: z.url(),
    status: BatchStatusSchema,
    characters: z.array(BatchCharacterSchema).min(1),
  })
  .superRefine((batch, ctx) => {
    for (const key of ["unit", "category"] as const) {
      const seen = new Set<string | number>();
      batch.characters.forEach((character, i) => {
        if (seen.has(character[key])) {
          ctx.addIssue({
            code: "custom",
            path: ["characters", i, key],
            message: `duplicate ${key} ${JSON.stringify(character[key])}`,
          });
        }
        seen.add(character[key]);
      });
    }
  });
export type Batch = z.infer<typeof BatchSchema>;
