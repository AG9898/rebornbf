import { z } from "zod";
import { AttackSchema } from "./attack.ts";
import { BurstTiersSchema } from "./burst.ts";
import {
  ContentIdSchema,
  ElementSchema,
  NonNegativeIntSchema,
  PositiveIntSchema,
} from "./common.ts";
import { ExtraSkillSchema, LeaderSkillSchema } from "./skill.ts";

/** Rarity: 1★–7★ or Omni (GAME_DESIGN §6). */
export const RaritySchema = z.union([z.int().min(1).max(7), z.literal("omni")]);
export type Rarity = z.infer<typeof RaritySchema>;

export const StatsSchema = z.strictObject({
  hp: PositiveIntSchema,
  atk: PositiveIntSchema,
  def: PositiveIntSchema,
  rec: PositiveIntSchema,
});
export type Stats = z.infer<typeof StatsSchema>;

/** One evolution form of a unit. `stats.base` is level 1, `stats.max` is `maxLevel`. */
export const FormSchema = z.strictObject({
  id: ContentIdSchema,
  name: z.string().min(1),
  rarity: RaritySchema,
  maxLevel: PositiveIntSchema,
  stats: z.strictObject({ base: StatsSchema, max: StatsSchema }),
  normalAttack: AttackSchema,
  bursts: BurstTiersSchema,
  leaderSkill: LeaderSkillSchema.optional(),
  extraSkill: ExtraSkillSchema.optional(),
  sphereSlots: NonNegativeIntSchema,
  /**
   * Fixed fusion EXP this form gives as fodder, before the matching-element ×1.5 and duplicate ×2
   * multipliers (GAME_DESIGN §6 → Level EXP and fusion, RESOLVED-57). Set only on fixed-EXP fodder:
   * the EXP vessels (Flask / Alembic / Athanor / Grail) and the Brass and Silver Crucibles. Every
   * other form omits it and gives ordinary fodder EXP computed from rarity, level, and `maxLevel`.
   */
  fusionExp: PositiveIntSchema.optional(),
});
export type Form = z.infer<typeof FormSchema>;

/**
 * Provenance (CONVENTIONS → Data): the homage source unit and a reference URL, never shown to
 * players. Test and placeholder content uses `{ placeholder: true }`; BFR-original content with no
 * homage source (the summon-pool filler units) uses `{ original: true }`, and its values are tunable.
 * Optional only because the public mirror export strips it (RESOLVED-61); the private repo's
 * `scripts/export-public.test.ts` requires it on every unit file, and it is never seeded.
 */
export const UnitSourceSchema = z.union([
  z.strictObject({ unit: z.string().min(1), url: z.url() }),
  z.strictObject({ placeholder: z.literal(true) }),
  z.strictObject({ original: z.literal(true) }),
]);
export type UnitSource = z.infer<typeof UnitSourceSchema>;

export const UnitSchema = z
  .strictObject({
    id: ContentIdSchema,
    name: z.string().min(1),
    element: ElementSchema,
    source: UnitSourceSchema.optional(),
    forms: z.array(FormSchema).min(1),
  })
  .superRefine((unit, ctx) => {
    const seen = new Set<string>();
    unit.forms.forEach((form, i) => {
      if (seen.has(form.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["forms", i, "id"],
          message: `duplicate form ID "${form.id}"`,
        });
      }
      seen.add(form.id);
    });
  });
export type Unit = z.infer<typeof UnitSchema>;
