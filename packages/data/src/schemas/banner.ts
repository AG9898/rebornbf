import { z } from "zod";
import { ContentIdSchema, PositiveIntSchema } from "./common.ts";

/** Rates are integer basis points: 1 bp = 0.01%, so a banner's rates sum to 10000 (100%). */
export const RATE_TOTAL_BP = 10_000;

/**
 * One summonable entry: a unit (`content/units/<unit>.json`) obtained in one of its forms
 * (`form`, e.g. `aurelle-5`), rolled at `rateBp` basis points.
 */
export const BannerEntrySchema = z.strictObject({
  unit: ContentIdSchema,
  form: ContentIdSchema,
  rateBp: PositiveIntSchema,
});
export type BannerEntry = z.infer<typeof BannerEntrySchema>;

/**
 * A Rare Summon banner (GAME_DESIGN §8). `featured` entries are the ones pity guarantees (one at
 * random after `pityPulls` pulls without a featured unit); `pool` is the rest. The rates of both
 * lists together sum to exactly 100%, and each unit form appears once.
 */
export const BannerSchema = z
  .strictObject({
    id: ContentIdSchema,
    name: z.string().min(1),
    pityPulls: PositiveIntSchema,
    featured: z.array(BannerEntrySchema).min(1),
    pool: z.array(BannerEntrySchema),
  })
  .superRefine((banner, ctx) => {
    const seen = new Set<string>();
    let total = 0;
    for (const list of ["featured", "pool"] as const) {
      banner[list].forEach((entry, i) => {
        total += entry.rateBp;
        if (seen.has(entry.form)) {
          ctx.addIssue({
            code: "custom",
            path: [list, i, "form"],
            message: `duplicate banner form "${entry.form}"`,
          });
        }
        seen.add(entry.form);
      });
    }
    if (total !== RATE_TOTAL_BP) {
      ctx.addIssue({
        code: "custom",
        path: [],
        message: `rates must sum to ${RATE_TOTAL_BP} bp (100%) (got ${total})`,
      });
    }
  });
export type Banner = z.infer<typeof BannerSchema>;
