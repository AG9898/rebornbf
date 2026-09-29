/** Base damage multiplier of a sparked hit (GAME_DESIGN §2 Sparks). */
export const SPARK_BASE_MULT = 1.5;

/**
 * `spark_mult_i` (GAME_DESIGN §3): `1.5 + spark-damage buffs` if the hit sparked, else 1.
 * Spark-damage bonuses (buffs, passives, spark-vulnerability debuffs) stack additively, uncapped.
 */
export function sparkMultiplier(sparked: boolean, sparkDamageBuffs = 0): number {
  return sparked ? SPARK_BASE_MULT + sparkDamageBuffs : 1;
}

/**
 * Extra drop chance a hit gets from sparking: only spark drop-bonus effects, no base bonus
 * (RESOLVED-38 item 4). The drop roll (M1-05A) adds this to the hit's drop rate.
 */
export function sparkDropBonus(sparked: boolean, sparkDropBuffs = 0): number {
  return sparked ? sparkDropBuffs : 0;
}
