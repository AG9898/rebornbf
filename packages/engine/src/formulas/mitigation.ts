/** Passive mitigation (leader skills, spheres, …) stacks additively up to this cap. */
export const PASSIVE_MITIGATION_CAP = 0.5;
/** Base guard damage multiplier (GAME_DESIGN §2 Player phase, §3). */
export const GUARD_BASE = 0.5;

export interface MitigationInput {
  /** BB/SBB mitigation buff (one category), fraction. */
  readonly bb?: number;
  /** UBB mitigation buff, fraction. */
  readonly ubb?: number;
  /** Sum of passive mitigation sources, fraction (capped at 0.5). */
  readonly passive?: number;
  /** BB/SBB elemental mitigation buff, fraction. */
  readonly bbElemental?: number;
  /** UBB elemental mitigation buff, fraction. */
  readonly ubbElemental?: number;
}

/**
 * Fraction of damage taken after mitigation (GAME_DESIGN §3 Mitigation):
 * `((1 − bb) × (1 − ubb) − passive) × (1 − bb_elem) × (1 − ubb_elem)`, never below 0.
 */
export function mitigationMultiplier(input: MitigationInput = {}): number {
  const { bb = 0, ubb = 0, passive = 0, bbElemental = 0, ubbElemental = 0 } = input;
  const normalLeft = (1 - bb) * (1 - ubb) - Math.min(PASSIVE_MITIGATION_CAP, passive);
  const elementalLeft = (1 - bbElemental) * (1 - ubbElemental);
  return Math.max(0, normalLeft * elementalLeft);
}

/** `max(0, 0.5 − guard bonuses)` when the target guards, else 1. */
export function guardMultiplier(guarding: boolean, guardBonuses = 0): number {
  return guarding ? Math.max(0, GUARD_BASE - guardBonuses) : 1;
}
