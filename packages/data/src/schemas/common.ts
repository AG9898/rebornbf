import { z } from "zod";

/** The six elements (GAME_DESIGN §1). */
export const ELEMENTS = ["fire", "water", "earth", "thunder", "light", "dark"] as const;
export const ElementSchema = z.enum(ELEMENTS);
export type Element = z.infer<typeof ElementSchema>;

/** Content IDs are kebab-case (CONVENTIONS → Naming). */
export const ContentIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a kebab-case content ID");

export const NonNegativeIntSchema = z.int().nonnegative();
export const PositiveIntSchema = z.int().positive();
