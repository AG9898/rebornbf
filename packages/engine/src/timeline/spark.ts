import type { EnemySlotId } from "../state/types.ts";
import type { ScheduledHit } from "./types.ts";

/**
 * Spark window in ticks (GAME_DESIGN §2 Sparks): the original's 60 fps loop at 60 ticks/s makes
 * "same frame" one tick, so only hits resolved on the same tick can spark.
 */
export const SPARK_WINDOW_TICKS = 1;

/**
 * Marks which hits of one tick's batch sparked: a hit sparks when at least one other hit lands on
 * the same target in the same window. The attacker does not matter (self-sparks count). Extra
 * normal-attack hits (`hit.extra`) neither count toward a spark nor spark on their own: each takes
 * its original hit's result. Returns one flag per hit, in input order. `hits` must share one tick.
 */
export function detectSparks(hits: readonly ScheduledHit[]): boolean[] {
  const perTarget = new Map<EnemySlotId, number>();
  for (const hit of hits) {
    if (!hit.extra) perTarget.set(hit.target, (perTarget.get(hit.target) ?? 0) + 1);
  }
  return hits.map((hit) => (perTarget.get(hit.target) ?? 0) >= 2);
}
