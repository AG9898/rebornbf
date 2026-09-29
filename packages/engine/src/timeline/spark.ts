import type { EnemySlotId } from "../state/types.ts";
import type { ScheduledHit } from "./types.ts";

/**
 * Spark window in ticks (GAME_DESIGN §2 Sparks): the original's 60 fps loop at 60 ticks/s makes
 * "same frame" one tick, so only hits resolved on the same tick can spark.
 */
export const SPARK_WINDOW_TICKS = 1;

/**
 * Spark assist (RESOLVED-17): the factor that widens the spark window when the battle setup turns
 * assist on. Tunable; at 2× hits one tick apart on one target spark.
 */
export const SPARK_ASSIST_FACTOR = 2;

/** The battle's spark window in ticks: two hits on one target spark when `|Δtick| < window`. */
export function sparkWindowTicks(assist: boolean): number {
  return assist ? SPARK_WINDOW_TICKS * SPARK_ASSIST_FACTOR : SPARK_WINDOW_TICKS;
}

/** A resolved hit remembered for a widened spark window: when and on whom it landed. */
export interface SparkMark {
  readonly tick: number;
  readonly target: EnemySlotId;
}

/**
 * Hits outside the current tick that a widened window (> 1 tick) also counts: `recent` hits
 * already resolved and `pending` hits still on the timeline (sorted by tick).
 */
export interface SparkNeighbours {
  readonly window: number;
  readonly recent: readonly SparkMark[];
  readonly pending: readonly ScheduledHit[];
}

/**
 * Marks which hits of one tick's batch sparked: a hit sparks when at least one other hit lands on
 * the same target in the same window. The attacker does not matter (self-sparks count). Extra
 * normal-attack hits (`hit.extra`) neither count toward a spark nor spark on their own: each takes
 * its original hit's result. Returns one flag per hit, in input order. `hits` must share one tick.
 * With `neighbours` and a window above one tick (spark assist), resolved and pending hits less than
 * `window` ticks away on the same target count too.
 */
export function detectSparks(
  hits: readonly ScheduledHit[],
  neighbours?: SparkNeighbours,
): boolean[] {
  const perTarget = new Map<EnemySlotId, number>();
  const add = (target: EnemySlotId) => perTarget.set(target, (perTarget.get(target) ?? 0) + 1);
  for (const hit of hits) {
    if (!hit.extra) add(hit.target);
  }
  // Neighbours only raise targets this batch already hits; each needs one more hit to spark.
  const now = hits[0]?.tick;
  const batchCounts = new Map(perTarget);
  if (neighbours && neighbours.window > 1 && now !== undefined) {
    const { window, recent, pending } = neighbours;
    for (const mark of recent) {
      if (mark.tick < now && now - mark.tick < window && batchCounts.has(mark.target)) {
        add(mark.target);
      }
    }
    for (const hit of pending) {
      if (hit.tick - now >= window) break;
      if (hit.tick > now && !hit.extra && batchCounts.has(hit.target)) add(hit.target);
    }
  }
  return hits.map((hit) => (perTarget.get(hit.target) ?? 0) >= 2);
}

/**
 * The spark memory after resolving tick `now`: marks still inside the window for later ticks plus
 * this batch's hits (extra hits excluded). Empty when the window is one tick.
 */
export function rememberSparkHits(
  recent: readonly SparkMark[],
  batch: readonly ScheduledHit[],
  now: number,
  window: number,
): SparkMark[] {
  if (window <= 1) return [];
  const kept = recent.filter((mark) => mark.tick > now + 1 - window);
  for (const hit of batch) {
    if (!hit.extra) kept.push({ tick: hit.tick, target: hit.target });
  }
  return kept;
}
