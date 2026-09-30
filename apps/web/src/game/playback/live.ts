import {
  type BattleEvent,
  type BattleInput,
  type BattleState,
  continueBattle,
  endTurn,
  msToTick,
  step,
} from "@bfr/engine";
import type { LoggedTurn } from "../../lib/battle/replay.ts";

/** A battle being played in real time: engine state plus inputs and events waiting for their tick. */
export interface LiveBattle {
  readonly state: BattleState;
  /** Inputs not yet passed to `step` because their tick is still in the future. */
  readonly queued: readonly BattleInput[];
  /**
   * Events from `endTurn` not yet shown. `endTurn` computes the enemy phase and end-of-turn tick
   * at once, ahead of the clock; they are released as the clock reaches each event's tick.
   */
  readonly pending: readonly BattleEvent[];
  /**
   * The last tick this player phase has already stepped through (`untilTick`), or -1 before its
   * first `step`. Inputs run strictly after it, so one `step` over the whole turn's inputs (the
   * server replay) resolves them in the same order as these per-frame calls.
   */
  readonly steppedTo: number;
  /** Inputs passed to `step` this turn, as passed (moved to the tick they actually ran at). */
  readonly turnInputs: readonly BattleInput[];
  /**
   * The input log (M3-04C): every finished turn's inputs and the tick `endTurn` ran at. A session
   * battle submits it to `POST /api/battles/finish`, which replays it (`lib/battle/replay.ts`).
   */
  readonly log: readonly LoggedTurn[];
}

export function startLive(state: BattleState, inputs: readonly BattleInput[] = []): LiveBattle {
  return { state, queued: [...inputs], pending: [], steppedTo: -1, turnInputs: [], log: [] };
}

/** Queues an input; it reaches the engine on the first `advanceLive` at or after its tick. */
export function queueInput(live: LiveBattle, input: BattleInput): LiveBattle {
  return { ...live, queued: [...live.queued, input] };
}

/**
 * The player phase is over: no input or hit is pending, and either every living unit has acted
 * or every enemy is down. The next `advanceLive` calls `endTurn`.
 */
export function isPlayerPhaseDone(live: LiveBattle): boolean {
  const { state } = live;
  if (state.result !== undefined || live.pending.length > 0) return false;
  if (live.queued.length > 0 || state.timeline.length > 0) return false;
  return (
    state.enemies.every((enemy) => enemy.hp <= 0) ||
    state.party.every((unit) => unit.hp <= 0 || state.acted.includes(unit.slot))
  );
}

/** The player may act: no battle result, and no enemy-phase events are still playing. */
export function acceptsInput(live: LiveBattle): boolean {
  return live.state.result === undefined && live.pending.length === 0;
}

/** The battle has ended and its last event has been shown. */
export function isOver(live: LiveBattle): boolean {
  return live.state.result !== undefined && live.pending.length === 0;
}

function releaseDue(
  live: LiveBattle,
  clockTick: number,
): { live: LiveBattle; events: BattleEvent[] } {
  const cut = live.pending.findIndex((event) => event.tick > clockTick);
  const count = cut < 0 ? live.pending.length : cut;
  return {
    live: { ...live, pending: live.pending.slice(count) },
    events: live.pending.slice(0, count),
  };
}

/**
 * Advances the battle to battle time `nowMs`. While no enemy-phase events are pending, it calls
 * `step(state, due, { untilTick })` with the inputs that became due (an input stamped at or before
 * a tick already stepped through, from a late frame, runs on the next tick). Once the player phase is done it
 * calls `endTurn` and holds the resulting events, releasing each when the clock reaches its tick.
 * The engine decides every outcome; this only feeds it time and inputs and paces its events.
 */
export function advanceLive(
  live: LiveBattle,
  nowMs: number,
): { readonly live: LiveBattle; readonly events: readonly BattleEvent[] } {
  const clockTick = msToTick(nowMs);
  const events: BattleEvent[] = [];
  let current = live;
  if (current.pending.length === 0 && current.state.result === undefined) {
    const untilTick = Math.max(current.state.tick, clockTick);
    const due: BattleInput[] = [];
    const queued: BattleInput[] = [];
    for (const input of current.queued) {
      const tick = Math.max(input.tick, current.state.tick, current.steppedTo + 1);
      if (tick <= untilTick) {
        due.push(tick === input.tick ? input : { ...input, tick });
      } else {
        queued.push(input);
      }
    }
    const result = step(current.state, due, { untilTick });
    current = {
      ...current,
      state: result.state,
      queued,
      steppedTo: untilTick,
      turnInputs: due.length > 0 ? [...current.turnInputs, ...due] : current.turnInputs,
    };
    events.push(...result.events);
  }
  if (isPlayerPhaseDone(current)) {
    const turn = endTurn(current.state);
    current = {
      ...current,
      state: turn.state,
      pending: turn.events,
      steppedTo: -1,
      turnInputs: [],
      log: [...current.log, { inputs: current.turnInputs, endTick: current.state.tick }],
    };
  }
  const released = releaseDue(current, clockTick);
  events.push(...released.events);
  return { live: released.live, events };
}

/** Resumes the same live battle only after the server confirms the gem payment. */
export function continueLive(live: LiveBattle): {
  live: LiveBattle;
  events: readonly BattleEvent[];
} {
  const next = continueBattle(live.state);
  if (next.state.result !== undefined || !isOver(live)) return { live, events: [] };
  const log = live.log.map((turn, index) =>
    index === live.log.length - 1 ? { ...turn, continued: true as const } : turn,
  );
  return {
    live: {
      ...live,
      state: next.state,
      log,
      queued: [],
      pending: [],
      steppedTo: -1,
      turnInputs: [],
    },
    events: next.events,
  };
}
