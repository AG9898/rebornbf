import type { Element } from "./schemas/common.ts";

/**
 * EXP one fixed-EXP fodder form (one with `fusionExp`) gives a fusion target
 * (GAME_DESIGN §6 → Level EXP and fusion, RESOLVED-57): ×1.5 when the fodder's element matches the
 * target's, ×2 more when the fodder is of the target's own unit line, rounded down once after all
 * multipliers. Integer math only, so the result is exact.
 */
export function fixedFusionExp(
  fusionExp: number,
  fodderElement: Element,
  targetElement: Element,
  duplicate = false,
): number {
  let numerator = fusionExp;
  let denominator = 1;
  if (fodderElement === targetElement) {
    numerator *= 3;
    denominator *= 2;
  }
  if (duplicate) numerator *= 2;
  return Math.floor(numerator / denominator);
}
