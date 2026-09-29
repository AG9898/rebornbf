import { z } from "zod";
import { EffectSchema } from "./effect.ts";

/** Leader skill: effects applied while the unit leads (or is the ally). */
export const LeaderSkillSchema = z.strictObject({
  name: z.string().min(1),
  effects: z.array(EffectSchema).min(1),
});
export type LeaderSkill = z.infer<typeof LeaderSkillSchema>;

/** Extra Skill: per-unit passive, often conditioned on spheres (GAME_DESIGN §6). */
export const ExtraSkillSchema = z.strictObject({
  name: z.string().min(1),
  effects: z.array(EffectSchema).min(1),
});
export type ExtraSkill = z.infer<typeof ExtraSkillSchema>;
