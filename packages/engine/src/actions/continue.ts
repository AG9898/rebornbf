import { gaugeMax } from "../drops/roll.ts";
import { isPassiveSource } from "../effects/buffs.ts";
import { refreshPassives } from "../effects/passive.ts";
import type { BattleEvent, ContinueRejectedReason } from "../events.ts";
import type { BattleState, BattleUnit } from "../state/types.ts";
import type { StepResult } from "../step.ts";

/** Why a continue would be refused now, or undefined when it is allowed. */
export function continueRefusal(state: BattleState): ContinueRejectedReason | undefined {
  if (state.result !== "lose") return "not_defeated";
  if (state.trial) return "trial";
  if (state.continued) return "already_continued";
  return undefined;
}

/** Full revive: max HP, a full BB gauge, no Overdrive, guard, burst buffs, or ailments. */
function restore(unit: BattleUnit, tick: number, events: BattleEvent[]): BattleUnit {
  const effects = unit.effects.filter((effect) => isPassiveSource(effect.source));
  const ended = new Set(
    unit.effects.filter((effect) => !isPassiveSource(effect.source)).map((e) => e.id),
  );
  for (const id of ended) events.push({ type: "EffectEnded", tick, target: unit.slot, effect: id });
  if (unit.overdrive) events.push({ type: "OverdriveEnded", tick, actor: unit.slot });
  const hp = unit.stats.hp;
  events.push({ type: "UnitRevived", tick, target: unit.slot, hp });
  const bc = gaugeMax(unit.form);
  if (bc > unit.bc) {
    events.push({
      type: "GaugeFilled",
      tick,
      actor: unit.slot,
      target: unit.slot,
      effect: "continue",
      gained: bc - unit.bc,
      gauge: bc,
    });
  }
  return {
    ...unit,
    hp,
    bc,
    effects,
    overdrive: false,
    overdriveTurns: 0,
    guarding: false,
  };
}

/**
 * Continue (GAME_DESIGN §2 → Continue, RESOLVED-17): after a party wipe (`result: "lose"`), every
 * party unit comes back at max HP with a full BB gauge, and the battle resumes with a new player
 * phase against the same wave (enemies, OD gauge, and items as they were). At most once per battle
 * and never in a trial; a refused continue emits `ContinueRejected` and returns the state
 * unchanged. Draws no RNG, so a replay that includes the continue at the same point matches.
 * The gem cost is charged by the server, not the engine.
 */
export function continueBattle(state: BattleState): StepResult {
  const tick = state.tick;
  const reason = continueRefusal(state);
  if (reason) {
    return { state, events: [{ type: "ContinueRejected", tick, reason }] };
  }
  const turn = state.turn + 1;
  const events: BattleEvent[] = [{ type: "BattleContinued", tick, turn }];
  const party = state.party.map((unit) => restore(unit, tick, events));
  const { result: _lost, ...rest } = state;
  const next = refreshPassives({
    ...rest,
    turn,
    phase: "player",
    party,
    timeline: [],
    recentHits: [],
    acted: [],
    continued: true,
  });
  events.push({ type: "TurnStarted", tick, turn });
  return { state: next, events };
}
