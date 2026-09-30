import { type ConditionedEffect, type Effect, isAttackShapeId, type PassiveStat } from "@bfr/data";
import type { BattleState, BattleUnit } from "../state/types.ts";
import { type ActiveEffect, isPassiveSource, type PassiveSource } from "./buffs.ts";
import { conditionHolds, isCondId } from "./conditional.ts";
import type { EffectHandler } from "./gauge.ts";

/**
 * Passive effects (GAME_DESIGN §4 → Passives and conditions). Leader skills (the leader's and the
 * ally's) and every squad unit's Extra Skill are materialised as permanent `ActiveEffect`s in the
 * `passive` slot by `refreshPassives`: at battle start and once per turn (turn loop: M1-07B).
 */
export const PASSIVE_IDS = [
  "passive.stat_pct",
  "passive.exp_gain",
  "passive.bc_per_turn",
  "passive.atk_hp_scaled",
] as const satisfies readonly Effect["id"][];

export type PassiveId = (typeof PASSIVE_IDS)[number];

export function isPassiveId(id: Effect["id"]): id is PassiveId {
  return (PASSIVE_IDS as readonly string[]).includes(id);
}

/** Passives come from skills; one in a burst's effect list stores nothing. */
const inert: EffectHandler = (effects: readonly ActiveEffect[]) => [...effects];

/** One registered handler per passive ID. */
export const PASSIVE_HANDLERS: Readonly<Record<PassiveId, EffectHandler>> = {
  "passive.stat_pct": inert,
  "passive.exp_gain": inert,
  "passive.bc_per_turn": inert,
  "passive.atk_hp_scaled": inert,
};

/** Summed `passive.stat_pct` for one stat: added to that stat's `stat_mods` (§3). */
export function passiveStatTotal(effects: readonly ActiveEffect[], stat: PassiveStat): number {
  return effects.reduce(
    (total, effect) =>
      total + (effect.id === "passive.stat_pct" && effect.stat === stat ? effect.value : 0),
    0,
  );
}

/**
 * Summed `passive.atk_hp_scaled` ATK `stat_mods` term: each adds `value + hpScaling × (hp /
 * maxHp)`, using the unit's current HP when its attack is rolled (BF data: "ATK boost relative to
 * HP remaining"). Not rounded.
 */
export function hpScaledAtkTotal(
  effects: readonly ActiveEffect[],
  hp: number,
  maxHp: number,
): number {
  const ratio = maxHp > 0 ? Math.min(1, Math.max(0, hp / maxHp)) : 0;
  return effects.reduce(
    (total, effect) =>
      total +
      (effect.id === "passive.atk_hp_scaled" ? effect.value + (effect.hpScaling ?? 0) * ratio : 0),
    0,
  );
}

/** Summed `passive.exp_gain` (fraction) for the post-battle EXP reward. */
export function expGainBonus(effects: readonly ActiveEffect[]): number {
  return effects.reduce(
    (total, effect) => total + (effect.id === "passive.exp_gain" ? effect.value : 0),
    0,
  );
}

/**
 * IDs never materialised as passives: one-shot burst effects (instant heals and fills, cures,
 * attack shapes) and ailment infliction ("adds X% ailment to attacks" is an attack proc), plus
 * `angel_idol`, whose once-per-battle use needs a consumption record the state does not keep yet.
 */
function isMaterialised(id: Effect["id"]): boolean {
  return !(
    isAttackShapeId(id) ||
    id.startsWith("ailment.inflict.") ||
    id === "ailment.cure" ||
    id === "heal.instant" ||
    id === "bb.fill_instant" ||
    id === "od.fill_instant" ||
    id === "angel_idol"
  );
}

interface SkillOwner {
  readonly owner: BattleUnit;
  readonly source: PassiveSource;
  readonly effects: readonly Effect[];
}

/** Whether a skill effect owned by `owner` reaches `recipient` (enemy targets never do). */
function reaches(
  effect: Effect | ConditionedEffect,
  owner: BattleUnit,
  recipient: BattleUnit,
): boolean {
  if (effect.element !== undefined && effect.element !== recipient.element) return false;
  switch (effect.target) {
    case "party":
      return true;
    case "self":
      return owner.slot === recipient.slot;
    case "ally":
      return recipient.slot === "ally";
    default:
      return false;
  }
}

/**
 * Passives store no `turns`; a `mitigation_after_damage` keeps its skill `turns` as
 * `triggerTurns`, the duration of the mitigation it grants.
 */
function toPassive(effect: Effect | ConditionedEffect, source: PassiveSource): ActiveEffect {
  const { turns, effects: _gated, ...rest } = effect as Effect;
  const trigger =
    effect.id === "mitigation_after_damage" && turns !== undefined ? { triggerTurns: turns } : {};
  return { ...rest, ...trigger, source };
}

/** Every skill in force: leader skill, ally leader skill, then each unit's Extra Skill. */
function skillsInForce(state: BattleState): SkillOwner[] {
  const skills: SkillOwner[] = [];
  const leader = state.party.find((unit) => unit.isLeader);
  const ally = state.party.find((unit) => unit.slot === "ally");
  if (leader && state.leaderSkills.leader) {
    skills.push({ owner: leader, source: "leader", effects: state.leaderSkills.leader.effects });
  }
  if (ally && state.leaderSkills.ally) {
    skills.push({ owner: ally, source: "ally_leader", effects: state.leaderSkills.ally.effects });
  }
  for (const unit of state.party) {
    for (const sphere of unit.spheres ?? []) {
      skills.push({ owner: unit, source: "sphere", effects: sphere.effects });
    }
    if (unit.form.extraSkill) {
      skills.push({ owner: unit, source: "extra", effects: unit.form.extraSkill.effects });
    }
  }
  return skills;
}

/**
 * The passive effects one party unit receives from every skill in force. A `cond.*` effect adds
 * its gated effects only while its condition holds for the recipient (its own HP and BB gauge; the
 * battle turn); both the condition's and the gated effect's targets must reach the recipient.
 */
export function passivesFor(state: BattleState, recipient: BattleUnit): ActiveEffect[] {
  const context = {
    hp: recipient.hp,
    maxHp: recipient.stats.hp,
    turn: state.turn,
    bc: recipient.bc,
    bbCost: recipient.form.bursts.bb.cost,
    signatureSphere:
      recipient.spheres?.some((sphere) => sphere.signatureUnit === recipient.unitId) ?? false,
  };
  const result: ActiveEffect[] = [];
  for (const { owner, source, effects } of skillsInForce(state)) {
    for (const effect of effects) {
      if (!reaches(effect, owner, recipient)) continue;
      const gated = isCondId(effect.id)
        ? conditionHolds(effect, context)
          ? (effect.effects ?? [])
          : []
        : [effect];
      for (const inner of gated) {
        if (inner === effect || reaches(inner, owner, recipient)) {
          if (isMaterialised(inner.id)) result.push(toPassive(inner, source));
        }
      }
    }
  }
  return result;
}

/**
 * Re-evaluates every party unit's passives: removes the previous skill passives and adds the
 * current ones, so conditional effects switch on and off as their condition changes. Burst and
 * triggered effects are untouched. Pure; draws no RNG.
 */
export function refreshPassives(state: BattleState): BattleState {
  return {
    ...state,
    party: state.party.map((unit) => ({
      ...unit,
      effects: [
        ...unit.effects.filter((effect) => !isPassiveSource(effect.source)),
        ...passivesFor(state, unit),
      ],
    })),
  };
}
