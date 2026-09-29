import type { BattleResult } from "@bfr/engine";
import { parseInputLog, replayBattle } from "./replay.ts";
import { type BattleSessionRow, sessionBattle, sessionProblem } from "./session-battle.ts";

/**
 * The finish route's verdict (M3-04C, RESOLVED-08): whether a submitted input log proves a win of
 * a battle session. Pure; `src/server/finish-battle.ts` loads the row with the secret key and
 * calls the atomic reward RPC only on a verified win.
 */

/** `battle_sessions` columns the finish route loads (with the owner, which RLS normally hides). */
export const FINISH_SESSION_COLUMNS =
  "id, user_id, stage_id, seed, squad, content_version, expires_at, finished_at";

export type FinishSessionRow = BattleSessionRow & { user_id: string };

export type FinishVerdict =
  | { ok: true; result: BattleResult; turns: number }
  | { ok: false; status: number; error: string };

function reject(status: number, error: string): FinishVerdict {
  return { ok: false, status, error };
}

/**
 * Checks, in order: the session exists and belongs to `userId`; it is not finished, expired, or
 * from other content (`sessionProblem`); the log is well-formed and within the size limits; its
 * replay from the session's seed and squad snapshot ends in a win.
 */
export function verifyFinish(
  row: FinishSessionRow | undefined,
  userId: string,
  inputLog: unknown,
  now: Date,
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

  const battle = sessionBattle(row);
  if (!battle.ok) return reject(409, battle.message);
  const replay = replayBattle(battle.battle.setup, battle.battle.seed, parsed.log);
  if (!replay.ok) return reject(422, `The input log does not replay: ${replay.message}.`);
  if (replay.result !== "win") return reject(422, "The input log does not replay to a win.");
  return { ok: true, result: replay.result, turns: replay.turns };
}
