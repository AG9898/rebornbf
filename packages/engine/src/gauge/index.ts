export * from "./overdrive.ts";

import type { Form } from "@bfr/data";
import type { BurstTier } from "../timeline/types.ts";

export interface GaugeModifiers {
  /** Additive cost reduction as a fraction; 1 means a free burst. */
  readonly costReduction?: number;
  /** Fraction of the reduced burst cost returned after use. */
  readonly consumptionReduction?: number;
}

export function reducedCost(cost: number, reduction = 0): number {
  return Math.ceil(cost * Math.max(0, 1 - reduction));
}

/** BB is one charge; SBB requires the BB charge plus its own charge. */
export function burstThreshold(
  form: Form,
  tier: BurstTier,
  modifiers: GaugeModifiers = {},
): number | undefined {
  const bb = reducedCost(form.bursts.bb.cost, modifiers.costReduction);
  if (tier === "bb") return bb;
  if (tier === "sbb") {
    return form.bursts.sbb
      ? bb + reducedCost(form.bursts.sbb.cost, modifiers.costReduction)
      : undefined;
  }
  return form.bursts.ubb ? reducedCost(form.bursts.ubb.cost, modifiers.costReduction) : undefined;
}

/** UBB is available only while the unit is in Overdrive Mode. */
export function canBurst(
  form: Form,
  tier: BurstTier,
  gauge: number,
  overdrive: boolean,
  modifiers: GaugeModifiers = {},
): boolean {
  const threshold = burstThreshold(form, tier, modifiers);
  return threshold !== undefined && (tier !== "ubb" || overdrive) && gauge >= threshold;
}

/** A burst empties the gauge, then consumption reduction refunds part of its reduced cost. */
export function gaugeAfterBurst(
  form: Form,
  tier: BurstTier,
  modifiers: GaugeModifiers = {},
): number {
  const burst = form.bursts[tier];
  if (!burst) throw new RangeError(`form has no ${tier} burst`);
  return (
    reducedCost(burst.cost, modifiers.costReduction) *
    Math.max(0, modifiers.consumptionReduction ?? 0)
  );
}
