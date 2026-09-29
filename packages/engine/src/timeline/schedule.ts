import type { Attack } from "@bfr/data";
import type { EnemySlotId, PlayerSlotId } from "../state/types.ts";
import { type AttackDamage, type ScheduledHit, TICKS_PER_SECOND } from "./types.ts";

/** Converts a millisecond timestamp (relative to battle start) to the tick it falls in. */
export function msToTick(ms: number): number {
  if (!Number.isFinite(ms) || ms < 0) {
    throw new RangeError(`timestamp must be a non-negative finite number (got ${ms})`);
  }
  return Math.floor((ms * TICKS_PER_SECOND) / 1000);
}

/** Total order of hits on the timeline. */
export function compareHits(a: ScheduledHit, b: ScheduledHit): number {
  return (
    a.tick - b.tick ||
    a.actionId - b.actionId ||
    a.attackIndex - b.attackIndex ||
    a.hitIndex - b.hitIndex ||
    (a.extra?.index ?? 0) - (b.extra?.index ?? 0) ||
    Number(a.target.slice(1)) - Number(b.target.slice(1))
  );
}

/** Where and when an action's hits land: shared by every hit the action schedules. */
export interface HitOrigin {
  readonly startTick: number;
  readonly actionId: number;
  readonly actor: PlayerSlotId;
}

/**
 * Schedules hit `hitIndex` of attack `attackIndex` on `target`: it lands at
 * `startTick + startDelayFrames + hitFrames[hitIndex]`, carries the attack's damage terms, and
 * rolls its share of the attack's drop checks (`dropChecks / hits`).
 */
export function scheduleHit(
  attack: Attack,
  attackIndex: number,
  hitIndex: number,
  origin: HitOrigin,
  target: EnemySlotId,
  terms: AttackDamage,
): ScheduledHit {
  return {
    tick: origin.startTick + attack.startDelayFrames + (attack.hitFrames[hitIndex] ?? 0),
    actionId: origin.actionId,
    actor: origin.actor,
    target,
    attackIndex,
    hitIndex,
    distribution: attack.damageDistribution[hitIndex] ?? 0,
    core: terms.core,
    critical: terms.critical,
    dropChecks: attack.dropChecks / attack.hitFrames.length,
    ...(terms.element ? { element: terms.element } : {}),
  };
}

/** Extra normal-attack hit clones (`hits.add_normal`) of one scheduled hit. */
export interface ExtraHitClones {
  /** Clones per original hit. */
  readonly count: number;
  /** Each clone deals `extraCore × multiplier`. */
  readonly multiplier: number;
  /** Whether the clones roll the original hit's drops. */
  readonly drops: boolean;
}

/**
 * Clones `hit` once per extra hit of every source, in source order, numbered from 1. Clones land on
 * the same tick and target with `extraCore × multiplier` as their core.
 */
export function cloneExtraHits(
  hit: ScheduledHit,
  sources: readonly ExtraHitClones[],
  extraCore: number,
): ScheduledHit[] {
  const clones: ScheduledHit[] = [];
  for (const source of sources) {
    for (let i = 0; i < source.count; i++) {
      const { ailmentRoll: _roll, ...original } = hit;
      clones.push({
        ...original,
        core: extraCore * source.multiplier,
        dropChecks: source.drops ? hit.dropChecks : 0,
        extra: { index: clones.length + 1, drops: source.drops },
      });
    }
  }
  return clones;
}

/**
 * Turns an action's frame-timed attacks into scheduled hits on one target: hit i of an attack lands
 * at `startTick + startDelayFrames + hitFrames[i]` (one frame = one tick at 60/s). `damage[k]`
 * holds attack k's per-attack damage terms, copied onto each of its hits; each hit carries its
 * share of the attack's drop checks (`dropChecks / hits`).
 */
export function scheduleAttacks(
  attacks: readonly Attack[],
  startTick: number,
  actionId: number,
  actor: PlayerSlotId,
  target: EnemySlotId,
  damage: readonly AttackDamage[],
): ScheduledHit[] {
  const origin = { startTick, actionId, actor };
  return attacks.flatMap((attack, attackIndex) => {
    const terms = damage[attackIndex];
    if (!terms) {
      throw new RangeError(`missing damage terms for attack ${attackIndex}`);
    }
    return attack.hitFrames.map((_, hitIndex) =>
      scheduleHit(attack, attackIndex, hitIndex, origin, target, terms),
    );
  });
}

/** Returns a new timeline with `hits` merged in, kept in `compareHits` order. */
export function insertHits(
  timeline: readonly ScheduledHit[],
  hits: readonly ScheduledHit[],
): ScheduledHit[] {
  return [...timeline, ...hits].sort(compareHits);
}
