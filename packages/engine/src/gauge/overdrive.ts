import { floorDamage } from "../formulas/rounding.ts";

/** OD gauge limit at quest start (GAME_DESIGN §2 Overdrive). */
export const OD_LIMIT_START = 10_000;
/** Limit growth after each Overdrive Mode activation (RESOLVED-38 item 9). */
export const OD_LIMIT_STEP = 5_000;
/** Highest OD gauge limit. */
export const OD_LIMIT_MAX = 40_000;
/** OD points per action and at turn end, before OD fill-rate boosts. */
export const OD_YIELD = {
  attack: 300,
  bb: 100,
  sbb: 200,
  ubb: 0,
  weakBonus: 100,
  turnEnd: 500,
} as const;
/** Turns (including the activation turn) a unit stays in Overdrive Mode without using UBB. */
export const OVERDRIVE_TURNS = 4;
/** Overdrive Mode stat bonus: +100% ATK, DEF, and REC, additive into `stat_mods`. */
export const OVERDRIVE_STAT_BONUS = 1;

/** The squad-wide OD gauge in points. */
export interface OdGauge {
  readonly points: number;
  readonly limit: number;
}

export function createOdGauge(): OdGauge {
  return { points: 0, limit: OD_LIMIT_START };
}

export type OdAction = "attack" | "bb" | "sbb" | "ubb";

/**
 * OD points an action yields (GAME_DESIGN §2 Overdrive): the action's base yield × (1 + OD fill
 * rate), floored, plus +100 per attack against an enemy weak to the attacker's element. The weak
 * bonus is not boosted (RESOLVED-38 item 10).
 */
export function actionOdYield(action: OdAction, weakAttacks = 0, fillRate = 0): number {
  return (
    floorDamage(OD_YIELD[action] * Math.max(0, 1 + fillRate)) + weakAttacks * OD_YIELD.weakBonus
  );
}

/** Turn-end OD yield: 500 × (1 + turn's-end OD fill boosts), floored. */
export function turnEndOdYield(fillRate = 0): number {
  return floorDamage(OD_YIELD.turnEnd * Math.max(0, 1 + fillRate));
}

/** Adds points, clamped to `[0, limit]`. */
export function addOd(od: OdGauge, points: number): OdGauge {
  return { ...od, points: Math.min(od.limit, Math.max(0, od.points + points)) };
}

/** Instant OD fill (`od.fill_instant`): a fraction of the current limit, floored. */
export function instantOdFill(od: OdGauge, fraction: number): OdGauge {
  return addOd(od, floorDamage(od.limit * fraction));
}

export function isOdFull(od: OdGauge): boolean {
  return od.points >= od.limit;
}

/** Activation empties the gauge and raises the limit by 5,000, up to 40,000. */
export function activateOd(od: OdGauge): OdGauge {
  return { points: 0, limit: Math.min(OD_LIMIT_MAX, od.limit + OD_LIMIT_STEP) };
}

export interface OverdriveUnit {
  readonly overdrive: boolean;
  /** Turns left in Overdrive Mode, counting the current one; 0 outside the mode. */
  readonly overdriveTurns: number;
  readonly bc: number;
}

/**
 * End-of-turn Overdrive countdown (called by the turn loop, M1-07B): one turn passes; a unit whose
 * turns run out leaves Overdrive Mode with an empty BB gauge.
 */
export function endOverdriveTurn<T extends OverdriveUnit>(unit: T): T {
  if (!unit.overdrive) return unit;
  const overdriveTurns = unit.overdriveTurns - 1;
  if (overdriveTurns > 0) return { ...unit, overdriveTurns };
  return { ...unit, overdrive: false, overdriveTurns: 0, bc: 0 };
}
