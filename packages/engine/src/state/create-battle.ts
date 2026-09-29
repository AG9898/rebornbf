import {
  AiRuleSchema,
  AttackSchema,
  EnemySkillSchema,
  type Form,
  type Stats,
  StatsSchema,
  UnitSchema,
} from "@bfr/data";
import { createAiMemory } from "../ai/evaluate.ts";
import { assertKnownEffect, passiveStatTotal, refreshPassives } from "../effects/index.ts";
import { attackTotal } from "../formulas/attack-stat.ts";
import { createOdGauge } from "../gauge/overdrive.ts";
import { createRng } from "../rng.ts";
import { formAtBurstLevels, MAX_BURST_LEVEL, MIN_BURST_LEVEL } from "./burst-levels.ts";
import {
  type AllySetup,
  type BattleEnemy,
  type BattleSetup,
  type BattleState,
  type BattleUnit,
  type EnemySetup,
  MAX_SQUAD_UNITS,
  type PlayerSlotId,
  type SquadMemberSetup,
} from "./types.ts";
import { formStatsAtLevel, typeRollProblem } from "./unit-stats.ts";

/** Thrown when a battle setup breaks a rule; the message names the offending setup path. */
export class BattleSetupError extends Error {
  override readonly name = "BattleSetupError";
}

/**
 * A member's base stats: the given `stats`, or the form's stats at `level` with the persisted type
 * roll (GAME_DESIGN §6 → Stat growth and unit types). Exactly one of the two must be set.
 */
function memberStats(member: SquadMemberSetup, form: Form, path: string): Stats {
  if (member.stats !== undefined) {
    if (member.level !== undefined || member.unitType !== undefined) {
      throw new BattleSetupError(`${path}: give either stats or level and unitType, not both`);
    }
    if (!StatsSchema.safeParse(member.stats).success) {
      throw new BattleSetupError(`${path}.stats: must be positive integers`);
    }
    return { ...member.stats };
  }
  const { level, unitType } = member;
  if (!(Number.isInteger(level) && level >= 1 && level <= form.maxLevel)) {
    throw new BattleSetupError(`${path}.level: must be an integer 1–${form.maxLevel}`);
  }
  if (unitType !== undefined) {
    const problem = typeRollProblem(unitType);
    if (problem) throw new BattleSetupError(`${path}.unitType.${problem}`);
  }
  return formStatsAtLevel(form, level, unitType);
}

function toBattleUnit(
  member: SquadMemberSetup,
  slot: PlayerSlotId,
  path: string,
  isLeader: boolean,
  allyKind?: AllySetup["kind"],
): BattleUnit {
  const parsedUnit = UnitSchema.safeParse(member.unit);
  if (!parsedUnit.success) {
    const issue = parsedUnit.error.issues[0];
    throw new BattleSetupError(
      `${path}.unit: ${issue?.path.join(".") ?? ""}: ${issue?.message ?? "invalid unit"}`,
    );
  }
  const unit = parsedUnit.data;
  const form = unit.forms.find((f) => f.id === member.formId);
  if (!form) {
    throw new BattleSetupError(`${path}.formId: unit "${unit.id}" has no form "${member.formId}"`);
  }
  const stats = memberStats(member, form, path);
  for (const tier of ["bb", "sbb"] as const) {
    const level = member.burstLevels?.[tier];
    if (
      level !== undefined &&
      !(Number.isInteger(level) && level >= MIN_BURST_LEVEL && level <= MAX_BURST_LEVEL)
    ) {
      throw new BattleSetupError(`${path}.burstLevels.${tier}: must be an integer 1–10`);
    }
  }
  for (const form of unit.forms) {
    for (const burst of Object.values(form.bursts)) {
      for (const effect of burst?.effects ?? []) assertKnownEffect(effect.id);
    }
    for (const skill of [form.leaderSkill, form.extraSkill]) {
      for (const effect of skill?.effects ?? []) {
        assertKnownEffect(effect.id);
        for (const gated of effect.effects ?? []) assertKnownEffect(gated.id);
      }
    }
  }
  return {
    slot,
    unitId: unit.id,
    name: unit.name,
    element: unit.element,
    form: formAtBurstLevels(form, member.burstLevels),
    stats,
    hp: stats.hp,
    effects: [],
    bc: 0,
    overdrive: false,
    overdriveTurns: 0,
    guarding: false,
    damageTaken: 0,
    damageDealt: 0,
    isLeader,
    ...(allyKind ? { allyKind } : {}),
  };
}

/** Instantiates one wave's enemies at full HP, in slot order `e0`, `e1`, … */
export function spawnWave(wave: readonly EnemySetup[]): BattleEnemy[] {
  return wave.map((enemy, i) => ({
    slot: `e${i}`,
    enemyId: enemy.id,
    name: enemy.name,
    element: enemy.element,
    stats: { ...enemy.stats },
    hp: enemy.stats.hp,
    effects: [],
    ...(enemy.bcResistance !== undefined ? { bcResistance: enemy.bcResistance } : {}),
    normalAttack: enemy.normalAttack,
    skills: enemy.skills,
    ai: enemy.ai,
    aiMemory: createAiMemory(),
    turnsTaken: 0,
  }));
}

/** Throws the first issue of a failed parse as a `BattleSetupError` under `path`. */
function assertParsed(
  result:
    | { success: true }
    | {
        success: false;
        error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] };
      },
  path: string,
): void {
  if (result.success) return;
  const issue = result.error.issues[0];
  const inner = issue?.path.map(String).join(".") ?? "";
  throw new BattleSetupError(`${path}${inner ? `.${inner}` : ""}: ${issue?.message ?? "invalid"}`);
}

/**
 * Validates an enemy's normal attack, skills, and AI script against the content schemas, plus the
 * cross-checks the turn loop relies on: every rule names `"normal"` or one of the enemy's skills,
 * the last rule is `default`, and every skill effect ID is known.
 */
function checkEnemyKit(enemy: EnemySetup, path: string): void {
  assertParsed(AttackSchema.safeParse(enemy.normalAttack), `${path}.normalAttack`);
  enemy.skills.forEach((skill, i) => {
    assertParsed(EnemySkillSchema.safeParse(skill), `${path}.skills.${i}`);
  });
  if (enemy.ai.length === 0) throw new BattleSetupError(`${path}.ai: needs at least one rule`);
  enemy.ai.forEach((rule, i) => {
    assertParsed(AiRuleSchema.safeParse(rule), `${path}.ai.${i}`);
  });
  const skillIds = new Set(enemy.skills.map((skill) => skill.id));
  enemy.ai.forEach((rule, i) => {
    if (rule.skill !== "normal" && !skillIds.has(rule.skill)) {
      throw new BattleSetupError(`${path}.ai.${i}.skill: unknown skill "${rule.skill}"`);
    }
  });
  if (enemy.ai[enemy.ai.length - 1]?.when !== "default") {
    throw new BattleSetupError(`${path}.ai: the last rule must be "default"`);
  }
  for (const skill of enemy.skills) {
    for (const effect of skill.effects) assertKnownEffect(effect.id);
  }
}

function checkWaves(waves: BattleSetup["waves"]): void {
  if (waves.length === 0) {
    throw new BattleSetupError("waves: a battle needs at least one wave");
  }
  waves.forEach((wave, w) => {
    if (wave.length === 0) {
      throw new BattleSetupError(`waves[${w}]: a wave needs at least one enemy`);
    }
    wave.forEach((enemy, e) => {
      if (!StatsSchema.safeParse(enemy.stats).success) {
        throw new BattleSetupError(`waves[${w}][${e}].stats: must be positive integers`);
      }
      checkEnemyKit(enemy, `waves[${w}][${e}]`);
      const res = enemy.bcResistance;
      if (res !== undefined && !Number.isFinite(res)) {
        throw new BattleSetupError(`waves[${w}][${e}].bcResistance: must be a finite number`);
      }
    });
  });
}

/**
 * Builds the initial `BattleState` from a squad snapshot and a seed (GAME_DESIGN §2 Battle
 * Structure). Rejects squads outside 1–5 units plus one ally, a missing leader, unknown forms,
 * invalid unit content (including unknown effect IDs), and empty waves. No combat happens here.
 */
export function createBattle(setup: BattleSetup, seed: number): BattleState {
  const { squad, leaderIndex, ally, waves } = setup;
  if (squad.length === 0 || squad.length > MAX_SQUAD_UNITS) {
    throw new BattleSetupError(
      `squad: must have 1–${MAX_SQUAD_UNITS} units plus an optional ally (got ${squad.length})`,
    );
  }
  if (!Number.isInteger(leaderIndex) || leaderIndex < 0 || leaderIndex >= squad.length) {
    throw new BattleSetupError(`leaderIndex: ${leaderIndex} is not a squad index`);
  }
  checkWaves(waves);

  const party: BattleUnit[] = squad.map((member, i) =>
    toBattleUnit(member, `p${i}`, `squad[${i}]`, i === leaderIndex),
  );
  if (ally) {
    party.push(toBattleUnit(ally, "ally", "ally", false, ally.kind));
  }

  const leaderSkill = party[leaderIndex]?.form.leaderSkill;
  const allyLeaderSkill = ally ? party[party.length - 1]?.form.leaderSkill : undefined;
  const firstWave = waves[0] ?? [];

  const state: BattleState = {
    seed,
    rng: createRng(seed),
    tick: 0,
    turn: 1,
    phase: "player",
    party,
    leaderSkills: {
      ...(leaderSkill ? { leader: leaderSkill } : {}),
      ...(allyLeaderSkill ? { ally: allyLeaderSkill } : {}),
    },
    waves,
    waveIndex: 0,
    enemies: spawnWave(firstWave),
    timeline: [],
    nextActionId: 0,
    od: createOdGauge(),
    acted: [],
  };
  return withPassiveHp(refreshPassives(state));
}

/**
 * Leader-skill and Extra Skill passives go into force at battle start. HP passives
 * (`passive.stat_pct` on `hp`) raise max HP once here, capped at 99,999, and each unit starts at
 * its new max HP.
 */
function withPassiveHp(state: BattleState): BattleState {
  return {
    ...state,
    party: state.party.map((unit) => {
      const hp = attackTotal({
        atk: unit.stats.hp,
        statMods: passiveStatTotal(unit.effects, "hp"),
      });
      return { ...unit, stats: { ...unit.stats, hp }, hp };
    }),
  };
}
