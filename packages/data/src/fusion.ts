import type { Element } from "./schemas/common.ts";
import type { Rarity } from "./schemas/unit.ts";

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

/** Ordinary fodder `base` EXP by rarity (RESOLVED-57). There is no launch 1★ form. */
export const ORDINARY_FUSION_BASE_EXP: Readonly<Partial<Record<Rarity, number>>> = {
  2: 50,
  3: 100,
  4: 200,
  5: 400,
  6: 700,
  7: 1_000,
  omni: 1_500,
};

/**
 * EXP an ordinary fodder unit (a form without `fusionExp`) gives: `base × (1 + (level − 1) /
 * (maxLevel − 1))`, so `base` at level 1 and `2 × base` at max level, times the same multipliers as
 * {@link fixedFusionExp}, rounded down once after all of them (RESOLVED-57).
 */
export function ordinaryFusionExp(
  rarity: Rarity,
  level: number,
  maxLevel: number,
  fodderElement: Element,
  targetElement: Element,
  duplicate = false,
): number {
  const base = ORDINARY_FUSION_BASE_EXP[rarity];
  if (base === undefined) throw new RangeError(`no ordinary fusion EXP is defined for ${rarity}★`);
  const span = maxLevel - 1;
  let numerator = span === 0 ? base : base * (span + level - 1);
  let denominator = span === 0 ? 1 : span;
  if (fodderElement === targetElement) {
    numerator *= 3;
    denominator *= 2;
  }
  if (duplicate) numerator *= 2;
  return Math.floor(numerator / denominator);
}

/** Zel a fusion costs: 100 × the target's current level, per fodder unit (RESOLVED-57). */
export function fusionZelCost(targetLevel: number, fodderCount: number): number {
  return 100 * targetLevel * fodderCount;
}
