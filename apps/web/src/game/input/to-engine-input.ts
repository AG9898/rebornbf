import {
  type BattleInput,
  type BattleState,
  type BattleUnit,
  type BurstTier,
  canBurst,
  type EnemySlotId,
  isOdFull,
  msToTick,
} from "@bfr/engine";
import type { Gesture } from "./gesture.ts";
import type { InputTarget } from "./hit-test.ts";

/** UI-only input state: the selected enemy and whether the OD button is waiting for a unit. */
export interface InputUiState {
  readonly selectedTarget?: EnemySlotId;
  readonly odArmed: boolean;
}

export const INITIAL_INPUT_UI: InputUiState = { odArmed: false };

export interface InputResult {
  readonly ui: InputUiState;
  /** The engine input to pass to `step`, if the gesture produced one. */
  readonly input?: BattleInput;
}

/**
 * The highest burst tier the unit can use now (UBB, then SBB, then BB), using the engine's own
 * gauge rule, or `undefined` when no tier is charged. The engine re-checks it on `step`.
 */
export function pickBurstTier(unit: BattleUnit): BurstTier | undefined {
  const tiers: readonly BurstTier[] = ["ubb", "sbb", "bb"];
  return tiers.find((tier) => canBurst(unit.form, tier, unit.bc, unit.overdrive));
}

/** Battle time in ms → engine tick, never earlier than the battle clock. */
export function inputTick(state: BattleState, timeMs: number): number {
  return Math.max(state.tick, msToTick(timeMs));
}

/**
 * Converts a classified gesture on a target into an engine input (GAME_DESIGN §2 Player phase):
 *
 * - Tap enemy: select it as the target (UI state only; no engine input).
 * - Tap OD button: arm (or disarm) Overdrive selection while the OD gauge is full.
 * - Any gesture on a unit while OD is armed: `overdrive` for that unit, then disarm.
 * - Tap unit: `attack`; swipe up: `burst` at the highest charged tier (nothing if none);
 *   swipe down: `guard`. Attacks and bursts carry the selected target.
 *
 * Gestures on dead units, unknown slots, or nothing are ignored. Every other legality rule
 * (already acted, phase, gauge) is the engine's to decide when it receives the input.
 */
export function toEngineInput(
  ui: InputUiState,
  state: BattleState,
  gesture: Gesture,
  target: InputTarget | undefined,
): InputResult {
  if (gesture.kind === "none" || !target) {
    return { ui };
  }
  const tick = inputTick(state, gesture.timeMs);

  if (target.kind === "enemy") {
    const enemy = state.enemies.find((e) => e.slot === target.slot);
    if (gesture.kind !== "tap" || !enemy || enemy.hp <= 0) return { ui };
    return { ui: { ...ui, selectedTarget: enemy.slot } };
  }

  if (target.kind === "od") {
    if (gesture.kind !== "tap") return { ui };
    return { ui: { ...ui, odArmed: !ui.odArmed && isOdFull(state.od) } };
  }

  const unit = state.party.find((u) => u.slot === target.slot);
  if (!unit || unit.hp <= 0) return { ui };
  const aim = ui.selectedTarget === undefined ? {} : { target: ui.selectedTarget };

  if (ui.odArmed) {
    return { ui: { ...ui, odArmed: false }, input: { type: "overdrive", tick, actor: unit.slot } };
  }
  switch (gesture.kind) {
    case "tap":
      return { ui, input: { type: "attack", tick, actor: unit.slot, ...aim } };
    case "swipe-down":
      return { ui, input: { type: "guard", tick, actor: unit.slot } };
    case "swipe-up": {
      const tier = pickBurstTier(unit);
      if (!tier) return { ui };
      return { ui, input: { type: "burst", tick, actor: unit.slot, tier, ...aim } };
    }
  }
}
