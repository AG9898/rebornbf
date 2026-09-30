import { z } from "zod";
import { ContentIdSchema } from "./common.ts";

/** Guest pool entry; progress decides the form and level at battle start. */
export const GuestSchema = z.strictObject({
  id: ContentIdSchema,
  unit: ContentIdSchema,
  rarityCap: z.int().min(1).max(7),
});
export type Guest = z.infer<typeof GuestSchema>;
