import { floorDamage } from "../formulas/rounding.ts";

/** Base BC drop rate per drop check, in % (GAME_DESIGN §2 Brave Crystals). */
export const BC_BASE_RATE = 35;
/** Base HC drop rate per hit, in %. */
export const HC_BASE_RATE = 10;
/** Every drop rate is doubled once the target is at 0 HP. */
export const OVERKILL_DROP_MULT = 2;
/** Drop rolls draw an integer uniform in `[0, DROP_ROLL_MAX]` (RESOLVED-38 item 6). */
export const DROP_ROLL_MAX = 100;
/** HC heal divisor range `random[3.0, 4.2]`. */
export const HC_DIVISOR_MIN = 3.0;
export const HC_DIVISOR_MAX = 4.2;

/**
 * Additive BC drop bonuses of one hit, in % (GAME_DESIGN §2 BC drop rate). Only one BB/SBB and
 * one UBB drop buff are active per unit and the newest item buff overwrites the older, so each of
 * those slots holds one value; sphere and leader-skill bonuses are already summed.
 */
export interface BcDropBonuses {
  /** Per-attack bonus from burst data (almost always 0). */
  readonly inherent?: number;
  readonly burstBuff?: number;
  readonly ubbBuff?: number;
  readonly itemBuff?: number;
  readonly spheres?: number;
  readonly leaderSkills?: number;
  /** Spark drop-bonus effects on a sparked hit (`sparkDropBonus`; no base spark bonus). */
  readonly spark?: number;
}

export interface BcDropRateParams extends BcDropBonuses {
  /** Enemy base BC resistance (fraction; 0 unless enemy data defines it). */
  readonly baseResistance?: number;
  /** Enemy resistance to buffed BC drops (fraction). */
  readonly buffedResistance?: number;
  /** The target was already at 0 HP when the hit landed. */
  readonly overkill?: boolean;
}

/**
 * BC drop rate per check, in %, uncapped:
 * `(35 × (1 − base_res) + (inherent + burst + ubb + item + spheres + leader + spark)
 *   × (1 − buffed_res)) × overkill`.
 * Spark drop bonuses sit with the other buffs (RESOLVED-38 item 4 working reading).
 */
export function bcDropRate(params: BcDropRateParams = {}): number {
  const {
    inherent = 0,
    burstBuff = 0,
    ubbBuff = 0,
    itemBuff = 0,
    spheres = 0,
    leaderSkills = 0,
    spark = 0,
    baseResistance = 0,
    buffedResistance = 0,
    overkill = false,
  } = params;
  const bonus = inherent + burstBuff + ubbBuff + itemBuff + spheres + leaderSkills + spark;
  const rate = BC_BASE_RATE * (1 - baseResistance) + bonus * (1 - buffedResistance);
  return rate * (overkill ? OVERKILL_DROP_MULT : 1);
}

export interface HcDropRateParams {
  /** Summed `drop.hc` bonuses, in %. */
  readonly bonus?: number;
  /** Spark drop-bonus effects on a sparked hit. */
  readonly spark?: number;
  readonly overkill?: boolean;
}

/** HC drop rate per hit, in %: `(10 + drop.hc bonuses + spark bonus) × overkill`. */
export function hcDropRate(params: HcDropRateParams = {}): number {
  const { bonus = 0, spark = 0, overkill = false } = params;
  return (HC_BASE_RATE + bonus + spark) * (overkill ? OVERKILL_DROP_MULT : 1);
}

/** A drop roll `draw` (integer in [0, 100]) spawns a crystal when `draw ≤ rate`; rate ≤ 0 never. */
export function dropSpawns(draw: number, rate: number): boolean {
  return rate > 0 && draw <= rate;
}

/**
 * Gauge BC filled by collecting `count` BC: `count × (1 + efficacy)`. BC efficacy boosts
 * collected crystals only; a negative total (efficacy reduction below −100%) drains.
 */
export function bcCrystalFill(count: number, efficacy = 0): number {
  return count * (1 + efficacy);
}

/**
 * HP one HC heals: `floor(REC_total × (1 + HC efficacy) / divisor)`, divisor in [3.0, 4.2]
 * (heal floored: RESOLVED-38 item 7).
 */
export function hcHeal(recTotal: number, divisor: number, efficacy = 0): number {
  return floorDamage((recTotal * (1 + efficacy)) / divisor);
}
