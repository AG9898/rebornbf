import {
  type BattleInput,
  BattleInputError,
  type BattleResult,
  type BattleSetup,
  type BattleState,
  createBattle,
  endTurn,
  step,
} from "@bfr/engine";

/**
 * Battle input logs and their replay (M3-04C, RESOLVED-08). The battle page records every input it
 * passes to the engine and the tick each turn's `endTurn` ran at (`game/playback/live.ts`); the
 * finish route replays that log from the session's seed and setup and trusts only the engine's
 * result. Pure, so the client's recording and the server's replay share one format and limits.
 */

/** One turn's player phase: the inputs passed to `step`, in order, and the tick it ended at. */
export interface LoggedTurn {
  readonly inputs: readonly BattleInput[];
  readonly endTick: number;
}

/** A whole battle's player input, one entry per turn. */
export type BattleInputLog = readonly LoggedTurn[];

/** Size limits on a submitted log (RESOLVED-08: input logs have size limits). */
export const MAX_LOG_TURNS = 200;
export const MAX_TURN_INPUTS = 64;
export const MAX_LOG_INPUTS = 2000;
/** Largest finish request body the route reads, in bytes. */
export const MAX_FINISH_BODY_BYTES = 256 * 1024;

const PLAYER_SLOT = /^(p[0-9]|ally)$/;
const ENEMY_SLOT = /^e[0-9]{1,2}$/;
const TIERS: ReadonlySet<string> = new Set(["bb", "sbb", "ubb"]);

export type ParsedLog = { ok: true; log: BattleInputLog } | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One input from untrusted JSON, rebuilt with only the fields the engine reads. */
function parseInput(value: unknown): BattleInput | string {
  if (!isRecord(value)) return "an input is not an object";
  const { type, tick, actor, target, tier } = value;
  if (typeof tick !== "number" || !Number.isSafeInteger(tick) || tick < 0) {
    return "an input tick is not a non-negative integer";
  }
  if (typeof actor !== "string" || !PLAYER_SLOT.test(actor)) return "an input actor is invalid";
  const slot = actor as BattleInput["actor"];
  if (target !== undefined && (typeof target !== "string" || !ENEMY_SLOT.test(target))) {
    return "an input target is invalid";
  }
  const enemy = target as `e${number}` | undefined;
  const withTarget = enemy === undefined ? {} : { target: enemy };
  switch (type) {
    case "attack":
      return { type, tick, actor: slot, ...withTarget };
    case "burst":
      if (typeof tier !== "string" || !TIERS.has(tier)) return "a burst tier is invalid";
      return { type, tick, actor: slot, tier: tier as "bb" | "sbb" | "ubb", ...withTarget };
    case "guard":
    case "overdrive":
      return { type, tick, actor: slot };
    default:
      return "an input type is invalid";
  }
}

/** Validates an untrusted `input_log` (shape and size limits) before any replay. */
export function parseInputLog(value: unknown): ParsedLog {
  if (!Array.isArray(value)) return { ok: false, message: "input_log must be an array of turns" };
  if (value.length === 0) return { ok: false, message: "input_log is empty" };
  if (value.length > MAX_LOG_TURNS) {
    return { ok: false, message: `input_log has more than ${MAX_LOG_TURNS} turns` };
  }
  const log: LoggedTurn[] = [];
  let total = 0;
  for (const entry of value) {
    if (!isRecord(entry) || !Array.isArray(entry.inputs)) {
      return { ok: false, message: "each turn must be an object with an inputs array" };
    }
    const { inputs: turn, endTick } = entry;
    if (typeof endTick !== "number" || !Number.isSafeInteger(endTick) || endTick < 0) {
      return { ok: false, message: "a turn endTick is not a non-negative integer" };
    }
    if (turn.length > MAX_TURN_INPUTS) {
      return { ok: false, message: `a turn has more than ${MAX_TURN_INPUTS} inputs` };
    }
    total += turn.length;
    if (total > MAX_LOG_INPUTS) {
      return { ok: false, message: `input_log has more than ${MAX_LOG_INPUTS} inputs` };
    }
    const inputs: BattleInput[] = [];
    for (const raw of turn) {
      const input = parseInput(raw);
      if (typeof input === "string") return { ok: false, message: input };
      inputs.push(input);
    }
    log.push({ inputs, endTick });
  }
  return { ok: true, log };
}

export type ReplayResult =
  | { ok: true; result: BattleResult; turns: number }
  | { ok: false; message: string };

/**
 * The player phase is over as the battle page decides it (`isPlayerPhaseDone` in
 * `game/playback/live.ts`): every enemy is down, or every living unit has acted.
 */
function playerPhaseDone(state: BattleState): boolean {
  return (
    state.enemies.every((enemy) => enemy.hp <= 0) ||
    state.party.every((unit) => unit.hp <= 0 || state.acted.includes(unit.slot))
  );
}

/**
 * Replays `log` from `createBattle(setup, seed)`: each turn's inputs through one
 * `step(state, inputs, { untilTick: endTick })`, then `endTurn`, as the battle page drives the
 * engine (its per-frame `step` calls never revisit a stepped tick, so one call resolves the same
 * way). Rejects a turn whose player phase is not over (the page cannot end a turn early) or whose
 * hits are still pending at `endTick`, inputs the engine refuses, turns after the battle ended,
 * and a log that stops before the battle ends. The engine decides the result.
 */
export function replayBattle(setup: BattleSetup, seed: number, log: BattleInputLog): ReplayResult {
  let state = createBattle(setup, seed);
  for (const [index, { inputs, endTick }] of log.entries()) {
    if (state.result !== undefined) {
      return { ok: false, message: `turn ${index + 1} comes after the battle ended` };
    }
    try {
      const player = step(state, inputs, { untilTick: endTick });
      if (!playerPhaseDone(player.state)) {
        return { ok: false, message: `turn ${index + 1} ends before every unit has acted` };
      }
      state = endTurn(player.state).state;
    } catch (error) {
      if (error instanceof BattleInputError) {
        return { ok: false, message: `turn ${index + 1}: ${error.message}` };
      }
      throw error;
    }
  }
  if (state.result === undefined) return { ok: false, message: "the battle did not end" };
  return { ok: true, result: state.result, turns: log.length };
}
