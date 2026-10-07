import { z } from "zod";
import { AttackSchema } from "./attack.ts";
import { BurstTiersSchema } from "./burst.ts";
import {
  ContentIdSchema,
  ElementSchema,
  NonNegativeIntSchema,
  PositiveIntSchema,
} from "./common.ts";
import { checkEnhancementRefs, EnhancementTreeSchema } from "./enhancement.ts";
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

/** Persisted imp totals, per-form caps and hob gains (GAME_DESIGN §6, RESOLVED-59). */
export const ImpStatsSchema = z.strictObject({
  hp: NonNegativeIntSchema,
  atk: NonNegativeIntSchema,
  def: NonNegativeIntSchema,
  rec: NonNegativeIntSchema,
});

/**
 * The cost of evolving a form into the next form of its unit (GAME_DESIGN §6 → Evolution
 * materials, RESOLVED-66): material units consumed (by unit ID), material items consumed (by item
 * ID, e.g. the Crown Shard), and Zel. Content validation checks that every unit and item exists.
 */
export const EvolutionRecipeSchema = z
  .strictObject({
    units: z.array(z.strictObject({ unit: ContentIdSchema, count: PositiveIntSchema })).min(1),
    items: z
      .array(z.strictObject({ item: ContentIdSchema, count: PositiveIntSchema }))
      .min(1)
      .optional(),
    zel: NonNegativeIntSchema,
  })
  .superRefine((recipe, ctx) => {
    const lists = [
      ["units", "unit", recipe.units.map((entry) => entry.unit)],
      ["items", "item", (recipe.items ?? []).map((entry) => entry.item)],
    ] as const;
    for (const [list, key, ids] of lists) {
      ids.forEach((id, i) => {
        if (ids.indexOf(id) !== i) {
          ctx.addIssue({
            code: "custom",
            path: [list, i, key],
            message: `duplicate ${key} "${id}" (use count)`,
          });
        }
      });
    }
  });
export type EvolutionRecipe = z.infer<typeof EvolutionRecipeSchema>;

/** One evolution form of a unit. `stats.base` is level 1, `stats.max` is `maxLevel`. */
export const FormSchema = z
  .strictObject({
    id: ContentIdSchema,
    name: z.string().min(1),
    rarity: RaritySchema,
    maxLevel: PositiveIntSchema,
    stats: z.strictObject({ base: StatsSchema, max: StatsSchema }),
    /** Omitted means zero caps (fodder and summon filler). */
    impCaps: ImpStatsSchema.optional(),
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
    /**
     * A non-EXP effect this form applies when fused (GAME_DESIGN §6 → Growth fodder, RESOLVED-55).
     * `sphereSlot` (the Satchel Toad) unlocks the target's second sphere slot once; `fuse` rejects
     * it on a target whose second slot is already open, since its +10 SP branch is post-launch
     * (RESOLVED-85). `{ burstLevels }` (the Lantern, Regent, and Matriarch Toads, M4-04E) adds that
     * many burst levels per copy by the duplicate overflow rule (BB to 10, then SBB to 10, excess
     * lost); `fuse` rejects it on a target with no burst level left to gain, since its SP branch is
     * post-launch too. `{ imps }` (stat hobs, M4-04B) grants flat persistent stat totals up to the
     * target form's `impCaps`; a copy with no gain is rejected atomically.
     */
    fusionEffect: z
      .union([
        z.literal("sphereSlot"),
        z.object({ burstLevels: z.number().int().min(1).max(20) }).strict(),
        z.strictObject({
          imps: ImpStatsSchema.refine((stats) => Object.values(stats).some((n) => n > 0)),
        }),
      ])
      .optional(),
    /**
     * Zel this form sells for, per copy (GAME_DESIGN §8 → Selling units, RESOLVED-79). Set only on
     * sale units, which exist to be sold; every other form omits it and `sell_units` refuses it.
     * No launch content sets it.
     */
    sellZel: PositiveIntSchema.optional(),
    /**
     * What evolving this form into the next form in `forms` costs. Omitted when the step is not
     * transcribed yet or does not exist; never set on a unit's last form.
     */
    evolution: EvolutionRecipeSchema.optional(),
    enhancements: EnhancementTreeSchema.optional(),
  })
  .superRefine((form, ctx) => {
    if (!form.enhancements) return;
    if (form.rarity !== "omni") {
      ctx.addIssue({
        code: "custom",
        path: ["enhancements"],
        message: "enhancements require an Omni form",
      });
    }
    checkEnhancementRefs(form.enhancements, form.bursts, ctx);
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

/** The longest unit quote, in characters: two short lines on the fusion result screen. */
export const UNIT_QUOTE_MAX_LENGTH = 80;

/**
 * A unit's quote (legacy/ART_GUIDE_BFR.md → UI → Fusion result): one original line in the unit's voice, never
 * original game text (IP_POLICY rule 1). Trimmed, one line (the screen wraps it to at most two),
 * and at most `UNIT_QUOTE_MAX_LENGTH` characters.
 */
export const UnitQuoteSchema = z
  .string()
  .min(1)
  .max(UNIT_QUOTE_MAX_LENGTH)
  .refine((quote) => quote === quote.trim(), "must not start or end with whitespace")
  .refine((quote) => !/[\r\n]/.test(quote), "must be one line");

export const UnitSchema = z
  .strictObject({
    id: ContentIdSchema,
    name: z.string().min(1),
    element: ElementSchema,
    source: UnitSourceSchema.optional(),
    /** The unit's quote; launch units only, never fodder or material units (`stackable`). */
    quote: UnitQuoteSchema.optional(),
    /**
     * Level EXP curve every form of this line uses, named by its level-1 "Next Lv" value
     * (GAME_DESIGN §6 → Level EXP and fusion, RESOLVED-57). Omitted means base 10.
     */
    expCurve: z.union([z.literal(10), z.literal(21)]).optional(),
    /**
     * Set on every single-form fodder and material unit (Sprites and Motes, Crucibles, EXP
     * vessels, evolution materials): a player's untouched copies are one count per unit and form
     * in `owned_unit_stacks`, not a row per copy (GAME_DESIGN §6 → Growth fodder → Stacking,
     * RESOLVED-75). Rejected on a unit with more than one form.
     */
    stackable: z.literal(true).optional(),
    forms: z.array(FormSchema).min(1),
  })
  .superRefine((unit, ctx) => {
    if (unit.stackable && unit.forms.length > 1) {
      ctx.addIssue({
        code: "custom",
        path: ["stackable"],
        message: "only a single-form unit can be stackable",
      });
    }
    if (unit.stackable && unit.quote !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["quote"],
        message: "fodder and material units have no quote",
      });
    }
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
      if (form.evolution && i === unit.forms.length - 1) {
        ctx.addIssue({
          code: "custom",
          path: ["forms", i, "evolution"],
          message: "the last form has no next form to evolve into",
        });
      }
    });
  });
export type Unit = z.infer<typeof UnitSchema>;
