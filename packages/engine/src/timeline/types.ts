import type { ElementRelation } from "../formulas/element.ts";
import type { EnemySlotId, PlayerSlotId } from "../state/types.ts";

/** Engine clock rate: integer ticks per second (GAME_DESIGN §2 Timing model). */
export const TICKS_PER_SECOND = 60;

/** Burst tiers an action can use; UBB needs Overdrive Mode. */
export type BurstTier = "bb" | "sbb" | "ubb";

/** Tap unit: a normal attack starting at `tick`. */
export interface AttackInput {
  readonly type: "attack";
  readonly tick: number;
  readonly actor: PlayerSlotId;
  /** Selected enemy; defaults to the first living enemy. */
  readonly target?: EnemySlotId;
}

/** Swipe up: a burst of the given tier starting at `tick`. */
export interface BurstInput {
  readonly type: "burst";
  readonly tick: number;
  readonly actor: PlayerSlotId;
  readonly tier: BurstTier;
  readonly target?: EnemySlotId;
}

/** Swipe down: guard for the rest of the turn; uses the unit's action. */
export interface GuardInput {
  readonly type: "guard";
  readonly tick: number;
  readonly actor: PlayerSlotId;
}

/** OD button: put a UBB-capable unit into Overdrive Mode; does not use the unit's action. */
export interface OverdriveInput {
  readonly type: "overdrive";
  readonly tick: number;
  readonly actor: PlayerSlotId;
}

/** A timestamped player input. `tick` is absolute battle time and never earlier than `state.tick`. */
export type BattleInput = AttackInput | BurstInput | GuardInput | OverdriveInput;

/**
 * One hit waiting on the timeline. Hits resolve in `(tick, actionId, attackIndex, hitIndex)` order,
 * so the timeline is a plain sorted array that serializes with the rest of `BattleState`.
 */
export interface ScheduledHit {
  readonly tick: number;
  readonly actionId: number;
  readonly actor: PlayerSlotId;
  readonly target: EnemySlotId;
  /** Index of the attack within the action (a burst may have several frame-timed attacks). */
  readonly attackIndex: number;
  readonly hitIndex: number;
  /** This hit's share of the attack's damage, in % (`damageDistribution[hitIndex]`). */
  readonly distribution: number;
  /** The attack's per-attack damage (`attackCore`), fixed when the action starts. */
  readonly core: number;
  /** Whether the attack crit (rolled once per attack). */
  readonly critical: boolean;
  /** BC drop checks this hit rolls: the attack's `dropChecks / hits` (GAME_DESIGN §2). */
  readonly dropChecks: number;
  /** The attack's own BC drop-rate bonus in % points (its shape's `bcDrop`); absent → 0. */
  readonly bcDrop?: number;
  /**
   * Set on the hit that rolls the attacker's added ailments (`buff.add_ailment`) for its attack
   * on this target: the first hit of a single-target or AoE attack per target, and every hit of a
   * random-target attack (GAME_DESIGN §4 Kit additions (M2-04G)). Extra-hit clones never roll.
   */
  readonly ailmentRoll?: true;
  /**
   * Set on an extra normal-attack hit (`hits.add_normal`): a clone of hit `hitIndex`, numbered
   * from 1 per original hit. `drops` is false for burst-granted clones, which roll no drops.
   */
  readonly extra?: { readonly index: number; readonly drops: boolean };
  /** The attack's elemental relation to the target (`elementOutcome`); absent when neutral. */
  readonly element?: ElementRelation;
}

/** Damage terms fixed once per attack when an action starts (GAME_DESIGN §3). */
export interface AttackDamage {
  readonly core: number;
  readonly critical: boolean;
  /** Core for extra hits: the same rolls without crit-damage and elemental-damage buffs. */
  readonly extraCore?: number;
  /** The attack's elemental relation to the target; absent when neutral. */
  readonly element?: ElementRelation;
}
