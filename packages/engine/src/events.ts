import type { Effect, EffectId } from "@bfr/data";
import type { ElementRelation } from "./formulas/element.ts";
import type { EnemySlotId, PlayerSlotId } from "./state/types.ts";
import type { BurstTier } from "./timeline/types.ts";

/** A unit began an action; its hits are now on the timeline. */
export interface ActionStartedEvent {
  readonly type: "ActionStarted";
  readonly tick: number;
  readonly actionId: number;
  readonly actor: PlayerSlotId;
  readonly action: "attack" | "burst";
  readonly tier?: BurstTier;
  readonly target: EnemySlotId;
  /** Number of hits scheduled for this action. */
  readonly hits: number;
}

export type ActionRejectedReason =
  | "actor_dead"
  | "already_acted"
  | "no_burst_tier"
  | "insufficient_gauge"
  | "overdrive_required"
  | "no_target"
  | "not_ubb_capable"
  | "already_overdrive"
  | "od_not_full"
  | "paralyzed"
  | "cursed"
  | "no_item"
  | "item_no_effect"
  | "battle_over";

/** A burst was accepted and its gauge was consumed before any hits land. */
export interface BurstUsedEvent {
  readonly type: "BurstUsed";
  readonly tick: number;
  readonly actionId: number;
  readonly actor: PlayerSlotId;
  readonly tier: BurstTier;
  readonly gaugeBefore: number;
  readonly gaugeAfter: number;
}

/** A burst applied a supported effect to one combatant at action start. */
export interface EffectAppliedEvent {
  readonly type: "EffectApplied";
  readonly tick: number;
  readonly actionId: number;
  readonly actor: PlayerSlotId;
  readonly target: PlayerSlotId | EnemySlotId;
  readonly effect: Effect;
}

/** A burst's `heal.instant` restored HP to a living party member at action start. */
export interface HealedEvent {
  readonly type: "Healed";
  readonly tick: number;
  readonly actionId: number;
  readonly actor: PlayerSlotId;
  readonly target: PlayerSlotId;
  /** HP actually restored after clamping to max HP. */
  readonly amount: number;
  readonly hp: number;
}

/**
 * An effect filled a living party member's BB gauge by a fixed BC amount: a burst's
 * `bb.fill_instant` (with `actionId`), `bb.fill_on_guard` when the unit guards, `bb.fill_on_hit`
 * after an enemy attack damages it, or `bb.fill_per_turn` at end of turn (the last three have no
 * action ID and `actor` is the unit itself), or a battle item's `bb_fill` (`effect: "item"`, no
 * action ID, `actor` is the unit the item was used on).
 */
export interface GaugeFilledEvent {
  readonly type: "GaugeFilled";
  readonly tick: number;
  readonly actionId?: number;
  /** An enemy slot when an enemy skill's `bb.fill_instant` filled a party unit's gauge (M1-07C). */
  readonly actor: PlayerSlotId | EnemySlotId;
  readonly target: PlayerSlotId;
  readonly effect:
    | "bb.fill_instant"
    | "bb.fill_on_guard"
    | "bb.fill_on_hit"
    | "bb.fill_on_attack"
    | "bb.fill_on_damage_taken"
    | "bb.fill_on_damage_dealt"
    | "bb.fill_on_spark"
    | "bb.fill_per_turn"
    | "item"
    | "continue";
  /** BC actually added after clamping to the gauge range. */
  readonly gained: number;
  /** Gauge after the fill. */
  readonly gauge: number;
}

/** A unit guarded: it used its action and takes ×`guardMultiplier` damage this turn. */
export interface GuardedEvent {
  readonly type: "Guarded";
  readonly tick: number;
  readonly actor: PlayerSlotId;
}

/**
 * The squad OD gauge gained points (GAME_DESIGN §2 Overdrive): from an action, emitted after its
 * `ActionStarted` (and `BurstUsed`), or from the end-of-turn yield (no `actionId` or `actor`).
 * Emitted only when the gauge rose; `gained` is after the limit cap.
 */
export interface OdGainedEvent {
  readonly type: "OdGained";
  readonly tick: number;
  readonly actionId?: number;
  readonly actor?: PlayerSlotId;
  readonly gained: number;
  readonly points: number;
  readonly limit: number;
}

/** A full OD gauge put `actor` into Overdrive Mode; the gauge emptied and its limit rose. */
export interface OverdriveActivatedEvent {
  readonly type: "OverdriveActivated";
  readonly tick: number;
  readonly actor: PlayerSlotId;
  readonly limitBefore: number;
  readonly limitAfter: number;
  readonly turns: number;
}

/** An input was valid but the rules refused it; nothing was scheduled. */
export interface ActionRejectedEvent {
  readonly type: "ActionRejected";
  readonly tick: number;
  readonly actor: PlayerSlotId;
  readonly reason: ActionRejectedReason;
}

/**
 * A scheduled hit resolved. `damage` is the formula result (GAME_DESIGN §3) before HP clamping;
 * `targetHp` is the target's HP after.
 */
export interface HitLandedEvent {
  readonly type: "HitLanded";
  readonly tick: number;
  readonly actionId: number;
  readonly actor: PlayerSlotId;
  readonly target: EnemySlotId;
  readonly attackIndex: number;
  readonly hitIndex: number;
  /** Set on an extra normal-attack hit (`hits.add_normal`): its clone number for `hitIndex`. */
  readonly extraIndex?: number;
  /** The hit belongs to an attack that crit (crits are rolled once per attack). */
  readonly critical: boolean;
  /** The hit sparked (another hit landed on the same target on the same tick). */
  readonly sparked: boolean;
  /** Set when a `buff.spark_crit` procced on this sparked hit (a red "SPARK!!"). */
  readonly sparkCritical?: true;
  /**
   * The attack's elemental relation to the target, fixed at action start with its damage
   * (`elementOutcome`): `"weak"` when the element multiplier's strong branch applied, `"resist"`
   * for ×0.5; absent when neutral. Presentation only (weakness/resist arrows).
   */
  readonly element?: ElementRelation;
  readonly damage: number;
  readonly targetHp: number;
}

/**
 * Two or more hits landed on `target` in the same spark window (GAME_DESIGN §2 Sparks). Emitted
 * once per target per tick, before that tick's `HitLanded` events; each of those hits has
 * `sparked: true`. `actors` lists the attackers in hit order (repeats mean self-sparks).
 */
export interface SparkedEvent {
  readonly type: "Sparked";
  readonly tick: number;
  readonly target: EnemySlotId;
  /** Number of hits that sparked on this target this tick. */
  readonly hits: number;
  readonly actors: readonly PlayerSlotId[];
}

/**
 * A hit spawned Brave and/or Heart Crystals (GAME_DESIGN §2 Brave Crystals). Emitted right after
 * the hit's `HitLanded` event, only when at least one crystal dropped. The attacking unit collects
 * them (RESOLVED-38 item 2): `bcGained` is the gauge change after BC efficacy and the gauge cap,
 * `healed` the HP restored after the max-HP cap; `gauge` and `hp` are the collector's values after.
 */
export interface CrystalDroppedEvent {
  readonly type: "CrystalDropped";
  readonly tick: number;
  readonly actionId: number;
  readonly collector: PlayerSlotId;
  readonly target: EnemySlotId;
  readonly attackIndex: number;
  readonly hitIndex: number;
  readonly bc: number;
  readonly hc: number;
  readonly bcGained: number;
  readonly healed: number;
  readonly gauge: number;
  readonly hp: number;
}

/** An enemy's HP reached 0. Later hits on it still land (overkill). */
export interface EnemyDefeatedEvent {
  readonly type: "EnemyDefeated";
  readonly tick: number;
  readonly target: EnemySlotId;
}

/**
 * An enemy began its enemy-phase action (GAME_DESIGN §2 Enemy phase): `skill` is the AI's choice
 * (`"normal"` or a skill ID) from rule `ruleIndex`; `target` is the AI's player target. A
 * paralyzed enemy loses its action: `skill` is absent and `paralyzed` is true.
 */
/**
 * An enemy skill applied a stored effect (buff, ailment, debuff, …) to one combatant at the
 * enemy's action start (M1-07C). An ailment appears only when its infliction roll succeeded.
 */
export interface EnemyEffectAppliedEvent {
  readonly type: "EnemyEffectApplied";
  readonly tick: number;
  readonly actor: EnemySlotId;
  readonly target: PlayerSlotId | EnemySlotId;
  readonly effect: Effect;
}

export interface EnemyActionStartedEvent {
  readonly type: "EnemyActionStarted";
  readonly tick: number;
  readonly actor: EnemySlotId;
  /** The enemy's own turn count, from 1. */
  readonly enemyTurn: number;
  readonly skill?: string;
  readonly ruleIndex?: number;
  readonly target?: PlayerSlotId;
  /** Hits the action deals (0 for a skill with no attacks, or a paralyzed enemy). */
  readonly hits: number;
  readonly paralyzed?: true;
}

/**
 * An enemy hit a party unit. `damage` is the HP damage after mitigation, guard, and any barrier;
 * `unitHp` is the unit's HP after (an `angel_idol` save sets `survived`). When a barrier took part
 * of the hit, `absorbed` is the damage it took and `barrierHp` what is left (0: it broke).
 */
export interface EnemyHitLandedEvent {
  readonly type: "EnemyHitLanded";
  readonly tick: number;
  readonly actor: EnemySlotId;
  readonly target: PlayerSlotId;
  readonly attackIndex: number;
  readonly hitIndex: number;
  readonly critical: boolean;
  /**
   * The attack's elemental relation to the unit's own element (not a barrier's), fixed at action
   * start: `"weak"`, `"resist"`, or absent when neutral. Presentation only.
   */
  readonly element?: ElementRelation;
  readonly damage: number;
  readonly unitHp: number;
  readonly survived?: true;
  readonly absorbed?: number;
  readonly barrierHp?: number;
}

/**
 * A party unit's damage taken reached a `mitigation_after_damage` threshold, granting it passive
 * `mitigation` of `value` for `turns` (counting the end of the current turn).
 */
export interface EffectTriggeredEvent {
  readonly type: "EffectTriggered";
  readonly tick: number;
  readonly target: PlayerSlotId;
  readonly effect: "mitigation_after_damage";
  readonly value: number;
  readonly turns: number;
}

/**
 * The last active effect with this ID left a combatant (M2-07B): its `turns` ran out at the
 * end-of-turn tick, a status cure removed it (emitted right after the cure's apply event), or an
 * enemy hit broke a barrier or used up an Angel Idol (right after that `EnemyHitLanded`). Passive
 * effects (leader and Extra Skills), which never have an apply event, emit none.
 */
export interface EffectEndedEvent {
  readonly type: "EffectEnded";
  readonly tick: number;
  readonly target: PlayerSlotId | EnemySlotId;
  readonly effect: EffectId;
}

/**
 * A battle item was used on `actor` (GAME_DESIGN §2 → Battle items) and one was taken from the
 * inventory, leaving `remaining`. Its results follow at the same tick: `UnitRevived`, then
 * `HpRestored`, `EffectEnded`, and `GaugeFilled` with `effect: "item"`.
 */
export interface ItemUsedEvent {
  readonly type: "ItemUsed";
  readonly tick: number;
  readonly actor: PlayerSlotId;
  readonly item: string;
  readonly remaining: number;
}

/** A revive item or a continue brought a KO'd party unit back with `hp` HP. */
export interface UnitRevivedEvent {
  readonly type: "UnitRevived";
  readonly tick: number;
  readonly target: PlayerSlotId;
  readonly hp: number;
}

/** A party unit's HP reached 0. */
export interface UnitDefeatedEvent {
  readonly type: "UnitDefeated";
  readonly tick: number;
  readonly target: PlayerSlotId;
}

/**
 * A party unit healed outside a burst: `damage_to_heal` after an enemy attack, `hp_drain` after
 * one of its own hits lands, or heal over time at end of turn. `amount` is after the max-HP cap.
 */
export interface HpRestoredEvent {
  readonly type: "HpRestored";
  readonly tick: number;
  /** The enemy whose skill's `heal.instant` restored the HP (M1-07C). */
  readonly actor?: EnemySlotId;
  readonly target: PlayerSlotId | EnemySlotId;
  /** The party action whose landed hit an `hp_drain` absorbed from. */
  readonly actionId?: number;
  readonly effect: "damage_to_heal" | "heal.over_time" | "heal.instant" | "hp_drain" | "item";
  readonly amount: number;
  readonly hp: number;
}

/** End-of-turn poison or damage-over-time damage (GAME_DESIGN §2 End-of-turn tick, step 1). */
export interface TurnDamagedEvent {
  readonly type: "TurnDamaged";
  readonly tick: number;
  readonly target: PlayerSlotId | EnemySlotId;
  readonly effect: "ailment.inflict.poison" | "debuff.dot";
  readonly damage: number;
  readonly hp: number;
  readonly survived?: true;
}

/**
 * A party unit's `damage_reflect` (*Damage Counter*) procced after an enemy attack cost it HP:
 * `damage` went to the attacking enemy, leaving it at `hp` (never below 1; GAME_DESIGN §4 Kit
 * additions (M2-04H)).
 */
export interface CounterDamagedEvent {
  readonly type: "CounterDamaged";
  readonly tick: number;
  readonly actor: PlayerSlotId;
  readonly target: EnemySlotId;
  readonly effect: "damage_reflect";
  readonly damage: number;
  readonly hp: number;
}

/** A unit's Overdrive Mode ran out of turns; its BB gauge emptied. */
export interface OverdriveEndedEvent {
  readonly type: "OverdriveEnded";
  readonly tick: number;
  readonly actor: PlayerSlotId;
}

/** Every enemy of wave `wave` (0-based) is defeated and a later wave follows. */
export interface WaveClearedEvent {
  readonly type: "WaveCleared";
  readonly tick: number;
  readonly wave: number;
}

/** Wave `wave` (0-based) spawned; its enemies are at full HP. */
export interface WaveStartedEvent {
  readonly type: "WaveStarted";
  readonly tick: number;
  readonly wave: number;
}

/** A new player phase began. */
export interface TurnStartedEvent {
  readonly type: "TurnStarted";
  readonly tick: number;
  readonly turn: number;
}

/** Terminal event: the last wave was cleared (`win`) or every party unit fell (`lose`). */
export interface BattleEndedEvent {
  readonly type: "BattleEnded";
  readonly tick: number;
  readonly result: "win" | "lose";
  readonly turn: number;
}

/**
 * A continue was accepted after a party wipe (GAME_DESIGN §2 → Continue): the battle resumes and
 * `turn` is the turn that starts. Followed at the same tick by each unit's `EffectEnded`,
 * `UnitRevived`, and `GaugeFilled` (`effect: "continue"`), then `TurnStarted`.
 */
export interface BattleContinuedEvent {
  readonly type: "BattleContinued";
  readonly tick: number;
  readonly turn: number;
}

/** Why a continue was refused. */
export type ContinueRejectedReason = "not_defeated" | "already_continued" | "trial";

/** A continue was refused; the state is unchanged. */
export interface ContinueRejectedEvent {
  readonly type: "ContinueRejected";
  readonly tick: number;
  readonly reason: ContinueRejectedReason;
}

/**
 * The ordered event log entries emitted by `step`, `endTurn`, and `continueBattle`. Events are in non-decreasing tick
 * order.
 */
export type BattleEvent =
  | ActionStartedEvent
  | BurstUsedEvent
  | EffectAppliedEvent
  | HealedEvent
  | GaugeFilledEvent
  | GuardedEvent
  | OdGainedEvent
  | OverdriveActivatedEvent
  | ActionRejectedEvent
  | SparkedEvent
  | HitLandedEvent
  | CrystalDroppedEvent
  | EnemyDefeatedEvent
  | EnemyActionStartedEvent
  | EnemyEffectAppliedEvent
  | EnemyHitLandedEvent
  | EffectTriggeredEvent
  | EffectEndedEvent
  | UnitDefeatedEvent
  | ItemUsedEvent
  | UnitRevivedEvent
  | HpRestoredEvent
  | TurnDamagedEvent
  | CounterDamagedEvent
  | OverdriveEndedEvent
  | WaveClearedEvent
  | WaveStartedEvent
  | TurnStartedEvent
  | BattleEndedEvent
  | BattleContinuedEvent
  | ContinueRejectedEvent;
