import { type AiCondition, type AiRule, type AiTarget, NORMAL_ATTACK_SKILL } from "@bfr/data";
import { nextInt, type RngState } from "../rng.ts";
import type { BattleEnemy, BattleUnit, PlayerSlotId } from "../state/types.ts";

/**
 * Per-enemy AI memory carried between enemy turns (GAME_DESIGN §5 AI script). `firedOnce` holds
 * the indexes of `hp_threshold_once` rules that have already fired.
 */
export interface EnemyAiMemory {
  readonly firedOnce: readonly number[];
}

export function createAiMemory(): EnemyAiMemory {
  return { firedOnce: [] };
}

export interface AiTurnContext {
  readonly enemy: BattleEnemy;
  /** The enemy's validated AI script (last rule is the `default`). */
  readonly rules: readonly AiRule[];
  /** The enemy's own turn count, from 1. */
  readonly enemyTurn: number;
  readonly party: readonly BattleUnit[];
  readonly memory: EnemyAiMemory;
  readonly rng: RngState;
}

export interface AiDecision {
  /** Skill ID from the enemy's `skills`, or `"normal"` for its normal attack. */
  readonly skill: string;
  /** Index of the rule that fired. */
  readonly ruleIndex: number;
  /** The chosen player target; absent when no party unit is alive. */
  readonly target?: PlayerSlotId;
  readonly memory: EnemyAiMemory;
  readonly rng: RngState;
}

/** `every_n_turns`: fires on enemy turns `offset + n`, `offset + 2n`, … */
export function everyNTurnsFires(enemyTurn: number, n: number, offset = 0): boolean {
  const since = enemyTurn - offset;
  return since > 0 && since % n === 0;
}

/** HP at or below `hpPercent` of max HP (`stats.hp`), compared without float division. */
export function hpAtOrBelow(enemy: BattleEnemy, hpPercent: number): boolean {
  return enemy.hp * 100 <= hpPercent * enemy.stats.hp;
}

/** `condition` rules look at living player units' active effects (passives included). */
export function aiConditionHolds(condition: AiCondition, party: readonly BattleUnit[]): boolean {
  const has = party.some(
    (unit) => unit.hp > 0 && unit.effects.some((effect) => effect.id === condition.effect),
  );
  return condition.type === "party_has_effect" ? has : !has;
}

function ruleFires(rule: AiRule, index: number, ctx: AiTurnContext): boolean {
  switch (rule.when) {
    case "every_n_turns":
      return everyNTurnsFires(ctx.enemyTurn, rule.n, rule.offset);
    case "hp_threshold_once":
      return !ctx.memory.firedOnce.includes(index) && hpAtOrBelow(ctx.enemy, rule.hpPercent);
    case "condition":
      return aiConditionHolds(rule.condition, ctx.party);
    case "default":
      return true;
  }
}

/**
 * Picks a living party unit. `random` draws one `nextInt(0, living − 1)` over living units in
 * party order; `lowest_hp` takes the lowest current HP (ties → party order) and draws nothing.
 * With no living unit there is no target and no draw.
 */
export function chooseAiTarget(
  target: AiTarget,
  party: readonly BattleUnit[],
  rng: RngState,
): { readonly target?: PlayerSlotId; readonly rng: RngState } {
  const living = party.filter((unit) => unit.hp > 0);
  if (living.length === 0) return { rng };
  if (target === "lowest_hp") {
    const lowest = living.reduce((best, unit) => (unit.hp < best.hp ? unit : best));
    return { target: lowest.slot, rng };
  }
  const draw = nextInt(rng, 0, living.length - 1);
  return { target: living[draw.value]?.slot, rng: draw.rng };
}

/**
 * Evaluates an enemy's AI script for one enemy turn (GAME_DESIGN §5): rules are tried in order and
 * the first that fires chooses the skill and target. A fired `hp_threshold_once` rule is recorded
 * in the returned memory so it never fires again. Pure: the caller stores `memory` and `rng`.
 */
export function evaluateEnemyAi(ctx: AiTurnContext): AiDecision {
  if (ctx.enemy.hp <= 0) {
    throw new RangeError(`enemy ${ctx.enemy.slot} is defeated and cannot act`);
  }
  if (!Number.isSafeInteger(ctx.enemyTurn) || ctx.enemyTurn < 1) {
    throw new RangeError(`enemyTurn must be a positive integer (got ${ctx.enemyTurn})`);
  }
  const ruleIndex = ctx.rules.findIndex((rule, index) => ruleFires(rule, index, ctx));
  const rule = ctx.rules[ruleIndex];
  // A validated script ends in `default`; an unvalidated one falls back to the normal attack.
  const skill = rule?.skill ?? NORMAL_ATTACK_SKILL;
  const picked = chooseAiTarget(rule?.target ?? "random", ctx.party, ctx.rng);
  const memory =
    rule?.when === "hp_threshold_once"
      ? { firedOnce: [...ctx.memory.firedOnce, ruleIndex] }
      : ctx.memory;
  return {
    skill,
    ruleIndex,
    ...(picked.target === undefined ? {} : { target: picked.target }),
    memory,
    rng: picked.rng,
  };
}
