import { autoInputs, type BattleInput, type EnemySlotId } from "@bfr/engine";
import { acceptsInput, type LiveBattle } from "../playback/live.ts";

/** Playback speed (GAME_DESIGN §2 Player phase): presentation only, never engine tick timing. */
export type PlaybackSpeed = 1 | 2;

/** The battle HUD's Auto and Speed toggles (M2-02D). UI state only; the engine never sees it. */
export interface BattleControls {
  readonly auto: boolean;
  readonly speed: PlaybackSpeed;
}

export const INITIAL_CONTROLS: BattleControls = { auto: false, speed: 1 };

export function toggleAuto(controls: BattleControls): BattleControls {
  return { ...controls, auto: !controls.auto };
}

export function toggleSpeed(controls: BattleControls): BattleControls {
  return { ...controls, speed: controls.speed === 1 ? 2 : 1 };
}

/** The Speed pill's label. */
export function speedLabel(speed: PlaybackSpeed): string {
  return `x${speed}`;
}

/**
 * The battle-clock steps one frame of `elapsedMs` wall time runs: `speed` steps of `elapsedMs`.
 * At x2 a frame runs two whole x1 frames back to back, so the battle clock visits the same times,
 * `advanceLive` ends each player phase at the same tick, and every event carries the same tick as
 * at x1; only fewer wall-clock frames pass. (One doubled step could end a phase a tick later.)
 */
export function playbackSteps(elapsedMs: number, speed: PlaybackSpeed): number[] {
  return Array.from({ length: speed }, () => elapsedMs);
}

/**
 * The auto-battle inputs to queue now (RESOLVED-17, engine `autoInputs`): only while Auto is on,
 * the player may act, and nothing is queued or still resolving. Units already given an action
 * this turn (acted, or an input sent and rejected) are skipped, so each unit is queued at most
 * once per turn and turning Auto on mid-turn only moves the units still waiting. Items never
 * count as a unit's action.
 */
export function dueAutoInputs(
  controls: BattleControls,
  live: LiveBattle,
  target?: EnemySlotId,
): BattleInput[] {
  if (!controls.auto || !acceptsInput(live)) return [];
  if (live.queued.length > 0 || live.state.timeline.length > 0) return [];
  const sent = new Set(
    live.turnInputs.filter((input) => input.type !== "item").map((input) => input.actor),
  );
  const aim =
    target !== undefined && live.state.enemies.some((e) => e.slot === target && e.hp > 0)
      ? { target }
      : {};
  return autoInputs(live.state, aim).filter((input) => !sent.has(input.actor));
}
