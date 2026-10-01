import type { BattleResult } from "@bfr/engine";
import { parseInputLog, replayBattle } from "./replay.ts";
import { type BattleSessionRow, sessionBattle, sessionProblem } from "./session-battle.ts";

/**
 * The finish route's verdict (M3-04C, RESOLVED-08): whether a submitted input log proves a win of
 * a battle session (or a terminal loss for settlement). Pure; `src/server/finish-battle.ts` loads
 * the row with the secret key, then settles with replay-derived leftovers. Only wins grant rewards.
 */

/** `battle_sessions` columns the finish route loads (with the owner, which RLS normally hides). */
export const FINISH_SESSION_COLUMNS =
  "id, user_id, stage_id, seed, squad, items, content_version, expires_at, finished_at, continued_turn";

export type FinishSessionRow = BattleSessionRow & { user_id: string };

export type FinishVerdict =
  | { ok: true; result: BattleResult; turns: number; remainingItems: Record<string, number> }
  | { ok: false; status: number; error: string };

function reject(status: number, error: string): FinishVerdict {
  return { ok: false, status, error };
}

/**
 * Checks, in order: the session exists and belongs to `userId`; it is not finished, expired, or
 * from other content (`sessionProblem`); the log is well-formed and within the size limits; its
 * replay from the session's seed, squad and item snapshot ends in the expected result.
 */
export function verifyFinish(
  row: FinishSessionRow | undefined,
  userId: string,
  inputLog: unknown,
  now: Date,
  expectedResult: BattleResult | "either" = "win",
): FinishVerdict {
  if (!row) return reject(404, "This battle was not found.");
  if (row.user_id !== userId) return reject(403, "This battle belongs to another player.");
  const problem = sessionProblem(row, now);
  if (problem) {
    const expired = row.finished_at === null && Date.parse(row.expires_at) <= now.getTime();
    return reject(expired ? 410 : 409, problem);
  }

  const parsed = parseInputLog(inputLog);
  if (!parsed.ok) return reject(400, `Invalid input log: ${parsed.message}.`);

  const markers = parsed.log.flatMap((turn, index) => (turn.continued ? [index + 1] : []));
  const paidTurn = row.continued_turn ?? null;
  if (markers.length > 1 || (markers[0] ?? null) !== paidTurn) {
    return reject(422, "The continue marker does not match the paid session continue.");
  }

  const battle = sessionBattle(row);
  if (!battle.ok) return reject(409, battle.message);
  const replay = replayBattle(battle.battle.setup, battle.battle.seed, parsed.log);
  if (!replay.ok) return reject(422, `The input log does not replay: ${replay.message}.`);
  if (expectedResult !== "either" && replay.result !== expectedResult) {
    return reject(422, `The input log does not replay to a ${expectedResult}.`);
  }
  return {
    ok: true,
    result: replay.result,
    turns: replay.turns,
    remainingItems: replay.remainingItems,
  };
}
