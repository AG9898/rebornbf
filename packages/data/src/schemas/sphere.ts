import { z } from "zod";
import { ContentIdSchema } from "./common.ts";
import { EffectSchema } from "./effect.ts";

/** Launch equipment; signature identity gates only the matching unit's Extra Skill. */
export const SphereSchema = z
  .strictObject({
    id: ContentIdSchema,
    name: z.string().min(1),
    kind: z.enum(["all-stat", "signature"]),
    signatureUnit: ContentIdSchema.optional(),
    rarity: z.literal(6).optional(),
    effects: z.array(EffectSchema).min(1),
  })
  .superRefine((sphere, ctx) => {
    if ((sphere.kind === "signature") !== (sphere.rarity !== undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["rarity"],
        message: "launch signatures require rarity 6",
      });
    }
    if ((sphere.kind === "signature") !== (sphere.signatureUnit !== undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["signatureUnit"],
        message: "required only for signature spheres",
      });
    }
    for (const effect of sphere.effects) {
      if (effect.target !== "self" || effect.turns !== undefined || effect.effects !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["effects"],
          message: "sphere effects must be permanent self effects",
        });
      }
    }
  });
export type Sphere = z.infer<typeof SphereSchema>;
