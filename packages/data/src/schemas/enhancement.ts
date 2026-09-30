import { z } from "zod";
import type { BurstTiersSchema } from "./burst.ts";
import {
  ContentIdSchema,
  ElementSchema,
  NonNegativeIntSchema,
  PositiveIntSchema,
} from "./common.ts";
import { AilmentSchema, EffectSchema, isAttackShapeId } from "./effect.ts";

/** SP-only content contracts; the engine rejects primitives whose combat slice is still pending. */
export const EnhancementPassiveSchema = z.union([
  EffectSchema,
  z.strictObject({ id: z.literal("passive.atk_cap"), value: PositiveIntSchema }),
  z.strictObject({
    id: z.literal("passive.angel_idol_once"),
    chance: z.number().gt(0).max(100),
  }),
  z.strictObject({ id: z.literal("passive.afflicted_damage"), value: z.number().nonnegative() }),
  z.strictObject({ id: z.literal("passive.spark_resist"), value: z.number().gt(0).max(1) }),
  z.strictObject({
    id: z.literal("passive.element_resist"),
    element: ElementSchema,
    value: z.number().gt(0).max(1),
  }),
  z.strictObject({
    id: z.literal("passive.ailment_counter"),
    ailment: AilmentSchema,
    chance: z.number().gt(0).max(100),
  }),
  z.strictObject({
    id: z.literal("passive.normal_aoe"),
    chance: z.number().gt(0).max(100),
    damageMultiplier: z.number().gt(0).max(1),
  }),
  z.strictObject({ id: z.literal("passive.turn_start") }),
  z.strictObject({
    id: z.literal("passive.bc_efficacy_down"),
    value: z.number().gt(0).max(1),
    chance: z.number().gt(0).max(100),
    turns: PositiveIntSchema,
  }),
]);
export type EnhancementPassive = z.infer<typeof EnhancementPassiveSchema>;

const TierSchema = z.enum(["bb", "sbb", "ubb"]);
/** Index in canonical burst effects, or in a prerequisite option's burst.add effects. */
export const EnhancementEffectRefSchema = z.strictObject({
  tier: TierSchema,
  index: NonNegativeIntSchema,
  addedBy: ContentIdSchema.optional(),
});
export type EnhancementEffectRef = z.infer<typeof EnhancementEffectRefSchema>;

export const EnhancementChangeSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("passive"),
    effects: z.array(EnhancementPassiveSchema).min(1),
  }),
  z.strictObject({
    kind: z.literal("burst.add"),
    tier: TierSchema,
    effects: z
      .array(EffectSchema)
      .min(1)
      .refine(
        (effects) => effects.every((effect) => !isAttackShapeId(effect.id)),
        "enhancements cannot add frame-timed attacks",
      ),
  }),
  z.strictObject({
    kind: z.literal("burst.replace"),
    ref: EnhancementEffectRefSchema,
    effect: EffectSchema,
  }),
  z.strictObject({
    kind: z.literal("burst.duration"),
    refs: z.array(EnhancementEffectRefSchema).min(1),
    turns: PositiveIntSchema,
  }),
  z.strictObject({
    kind: z.literal("passive.replace"),
    option: ContentIdSchema,
    index: NonNegativeIntSchema,
    effect: EnhancementPassiveSchema,
  }),
]);
export type EnhancementChange = z.infer<typeof EnhancementChangeSchema>;

export const EnhancementOptionSchema = z.strictObject({
  id: ContentIdSchema,
  name: z.string().min(1),
  cost: PositiveIntSchema.max(100),
  requires: z.array(ContentIdSchema).optional(),
  changes: z.array(EnhancementChangeSchema).min(1),
});
export type EnhancementOption = z.infer<typeof EnhancementOptionSchema>;

export const EnhancementTreeSchema = z
  .array(EnhancementOptionSchema)
  .min(1)
  .superRefine((tree, ctx) => {
    const byId = new Map(tree.map((option) => [option.id, option]));
    tree.forEach((option, i) => {
      const issue = (path: (string | number)[], message: string): void => {
        ctx.addIssue({ code: "custom", path: [i, ...path], message });
      };
      if (tree.findIndex((entry) => entry.id === option.id) !== i) {
        issue(["id"], `duplicate enhancement ID "${option.id}"`);
      }
      const ancestors = new Set<string>();
      const walk = (id: string, visiting: Set<string>): void => {
        if (visiting.has(id)) {
          issue(["requires"], "enhancement prerequisites contain a cycle");
          return;
        }
        if (!byId.has(id)) {
          issue(["requires"], `missing prerequisite "${id}"`);
          return;
        }
        if (ancestors.has(id)) return;
        ancestors.add(id);
        const next = new Set(visiting).add(id);
        for (const required of byId.get(id)?.requires ?? []) walk(required, next);
      };
      for (const required of option.requires ?? []) walk(required, new Set([option.id]));
      if (new Set(option.requires).size !== (option.requires ?? []).length) {
        issue(["requires"], "duplicate prerequisites");
      }
      option.changes.forEach((change, j) => {
        if (change.kind === "passive.replace") {
          const grants = byId
            .get(change.option)
            ?.changes.filter((entry) => entry.kind === "passive");
          const original = grants?.flatMap((entry) => entry.effects)[change.index];
          if (!ancestors.has(change.option) || !original || original.id !== change.effect.id) {
            issue(["changes", j], "passive replacement must match a prerequisite grant");
          }
        }
        const refs =
          change.kind === "burst.replace"
            ? [change.ref]
            : change.kind === "burst.duration"
              ? change.refs
              : [];
        refs.forEach((ref) => {
          if (ref.addedBy && !ancestors.has(ref.addedBy)) {
            issue(["changes", j], "addedBy must name a prerequisite option");
          }
        });
      });
    });
  });
export type EnhancementTree = z.infer<typeof EnhancementTreeSchema>;

/** Form-local references are checked by FormSchema, so seed and CLI validation share the rule. */
export function checkEnhancementRefs(
  tree: EnhancementTree,
  bursts: z.infer<typeof BurstTiersSchema>,
  ctx: z.RefinementCtx,
): void {
  tree.forEach((option, i) => {
    option.changes.forEach((change, j) => {
      const issue = (message: string): void => {
        ctx.addIssue({ code: "custom", path: ["enhancements", i, "changes", j], message });
      };
      if (change.kind === "burst.add" && !bursts[change.tier]) issue("burst tier does not exist");
      const refs =
        change.kind === "burst.replace"
          ? [change.ref]
          : change.kind === "burst.duration"
            ? change.refs
            : [];
      for (const ref of refs) {
        const effects = ref.addedBy
          ? tree
              .find((entry) => entry.id === ref.addedBy)
              ?.changes.flatMap((entry) =>
                entry.kind === "burst.add" && entry.tier === ref.tier ? entry.effects : [],
              )
          : bursts[ref.tier]?.effects;
        const effect = effects?.[ref.index];
        if (!bursts[ref.tier] || !effect) {
          issue("burst effect reference does not exist");
        } else if (change.kind === "burst.replace") {
          // Whole-effect replacement keeps ranges, REC terms, element/stat qualifiers typed.
          if (
            effect.id !== change.effect.id ||
            effect.target !== change.effect.target ||
            effect.stat !== change.effect.stat ||
            effect.element !== change.effect.element ||
            effect.ailment !== change.effect.ailment
          ) {
            issue("replacement must preserve effect identity and target");
          }
        } else if (effect.turns === undefined || effect.turns === 0) {
          issue("duration upgrades require a timed effect");
        }
      }
    });
  });
}
