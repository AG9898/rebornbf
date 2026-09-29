import { floorDamage } from "./rounding.ts";

/** Any total stat (HP/ATK/DEF/REC) is capped at this value (GAME_DESIGN §3 Attacker ATK). */
export const STAT_CAP = 99_999;

export interface AttackStatInput {
  /** Unit base ATK including imps. */
  readonly atk: number;
  /** A burst's flat damage value, if any (RESOLVED-37 item 1: added before the % sum). */
  readonly flatAtk?: number;
  /** Sum of every additive ATK% source as a fraction (+50% → 0.5). */
  readonly statMods?: number;
  /** The burst's damage modifier as a fraction (300% → 3.0); 0 for normal attacks. */
  readonly bbModifier?: number;
  /**
   * Flat ATK from Parameter Conversion (`buff.atk_from_def`: `value` × the unit's total DEF),
   * added after the % sum and not multiplied by it (GAME_DESIGN §4 Kit additions (M2-04C)).
   */
  readonly converted?: number;
}

/**
 * `atk_total = min(99999, floor((ATK + flat_atk) × (1 + stat_mods + bb_modifier) + converted))`
 * (GAME_DESIGN §3). Never below 0.
 */
export function attackTotal(input: AttackStatInput): number {
  const { atk, flatAtk = 0, statMods = 0, bbModifier = 0, converted = 0 } = input;
  const raw = floorDamage((atk + flatAtk) * (1 + statMods + bbModifier) + converted);
  return Math.min(STAT_CAP, Math.max(0, raw));
}
