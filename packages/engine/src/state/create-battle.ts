import {
  AiRuleSchema,
  AttackSchema,
  type Effect,
  EnemySkillSchema,
  type Form,
  ItemSchema,
  SphereSchema,
  type Stats,
  StatsSchema,
  UnitSchema,
} from "@bfr/data";
import { createAiMemory } from "../ai/evaluate.ts";
import { assertKnownEffect, passiveStatTotal, refreshPassives } from "../effects/index.ts";
import { attackTotal } from "../formulas/attack-stat.ts";
import { createOdGauge } from "../gauge/overdrive.ts";
import { createRng } from "../rng.ts";
import { sparkWindowTicks } from "../timeline/spark.ts";
import { formAtBurstLevels, MAX_BURST_LEVEL, MIN_BURST_LEVEL } from "./burst-levels.ts";
import { formWithEnhancementBursts } from "./enhancement-bursts.ts";
import { enhancementPassives, selectedEnhancements } from "./enhancements.ts";
import {
  type AllySetup,
  AUTO_UNIT_MODES,
  type AutoSettings,
  type BattleEnemy,
  type BattleItemStack,
  type BattleSetup,
  type BattleState,
  type BattleUnit,
  type EnemySetup,
  type FormChangeSetup,
  MAX_SQUAD_UNITS,
  type PlayerSlotId,
  type SquadMemberSetup,
} from "./types.ts";
import { formStatsAtLevel, impStatsProblem, typeRollProblem } from "./unit-stats.ts";

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
    if (member.level !== undefined || member.unitType !== undefined || member.imps !== undefined) {
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
  if (member.imps !== undefined) {
    const problem = impStatsProblem(form, member.imps);
    if (problem) throw new BattleSetupError(`${path}.imps: ${problem}`);
  }
  return formStatsAtLevel(form, level, unitType, member.imps);
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
  const spheres = (member.spheres ?? []).map((sphere, i) => {
    const parsed = SphereSchema.safeParse(sphere);
    assertParsed(parsed, `${path}.spheres[${i}]`);
    if (!parsed.success) throw new BattleSetupError(`${path}.spheres[${i}]: invalid sphere`);
    for (const effect of parsed.data.effects) assertKnownEffect(effect.id);
    return parsed.data;
  });
  if (member.secondSphereSlot !== undefined && typeof member.secondSphereSlot !== "boolean") {
    throw new BattleSetupError(`${path}.secondSphereSlot: must be a boolean`);
  }
  if (spheres.length > (member.secondSphereSlot === true ? 2 : 1)) {
    throw new BattleSetupError(`${path}.spheres: sphere slot is locked`);
  }
  if (spheres.filter((sphere) => sphere.kind === "all-stat").length > 1) {
    throw new BattleSetupError(`${path}.spheres: cannot equip two all-stat spheres`);
  }
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
  let spPassives: Effect[];
  let enhancementAtkCap: number | undefined;
  let angelIdolChance: number | undefined;
  let ailmentPassives: Pick<
    BattleUnit,
    "enhancementAfflictedDamage" | "enhancementAilmentCounters"
  >;
  let battleForm: Form;
  try {
    const options = selectedEnhancements(
      form,
      member.level,
      member.burstLevels,
      member.selectedEnhancements,
    );
    const resolved = enhancementPassives(options);
    spPassives = resolved.effects;
    enhancementAtkCap = resolved.atkCap;
    angelIdolChance = resolved.angelIdolChance;
    ailmentPassives = {
      ...(resolved.afflictedDamage !== undefined
        ? { enhancementAfflictedDamage: resolved.afflictedDamage }
        : {}),
      ...(resolved.ailmentCounters.length
        ? { enhancementAilmentCounters: resolved.ailmentCounters }
        : {}),
    };
    battleForm = formAtBurstLevels(formWithEnhancementBursts(form, options), member.burstLevels);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    throw new BattleSetupError(`${path}.selectedEnhancements: ${error.message}`);
  }
  for (const effect of spPassives) {
    assertKnownEffect(effect.id);
    for (const gated of effect.effects ?? []) assertKnownEffect(gated.id);
  }
  for (const burst of Object.values(battleForm.bursts)) {
    for (const effect of burst?.effects ?? []) {
      assertKnownEffect(effect.id);
      for (const gated of effect.effects ?? []) assertKnownEffect(gated.id);
    }
  }
  return {
    slot,
    unitId: unit.id,
    name: unit.name,
    element: unit.element,
    form: battleForm,
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
    ...(spheres.length ? { spheres } : {}),
    ...(spPassives.length ? { enhancementPassives: spPassives } : {}),
    ...(enhancementAtkCap !== undefined ? { enhancementAtkCap } : {}),
    ...ailmentPassives,
    ...(angelIdolChance !== undefined
      ? { passiveAngelIdol: { chance: angelIdolChance, consumed: false, protected: false } }
      : {}),
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
 * Validates turn-triggered form changes (GAME_DESIGN §2 → Form changes): each names a wave that is
 * not the last, at most once, with a positive integer turn count, and that wave and the next hold
 * exactly one enemy each (the form and its next form).
 */
function checkFormChanges(
  formChanges: BattleSetup["formChanges"],
  waves: BattleSetup["waves"],
): FormChangeSetup[] {
  const seen = new Set<number>();
  return (formChanges ?? []).map((change, i) => {
    const { wave, afterTurns } = change;
    if (!Number.isInteger(wave) || wave < 0 || wave >= waves.length - 1) {
      throw new BattleSetupError(`formChanges[${i}].wave: must be a wave index before the last`);
    }
    if (seen.has(wave)) {
      throw new BattleSetupError(`formChanges[${i}].wave: wave ${wave} already changes form`);
    }
    seen.add(wave);
    if (!Number.isInteger(afterTurns) || afterTurns < 1) {
      throw new BattleSetupError(`formChanges[${i}].afterTurns: must be a positive integer`);
    }
    if (waves[wave]?.length !== 1 || waves[wave + 1]?.length !== 1) {
      throw new BattleSetupError(
        `formChanges[${i}]: waves ${wave} and ${wave + 1} must each hold exactly one enemy`,
      );
    }
    return { wave, afterTurns };
  });
}

/** The per-battle item inventory: valid items, each ID once, with positive integer counts. */
function checkItems(items: BattleSetup["items"]): BattleItemStack[] {
  const seen = new Set<string>();
  return (items ?? []).map((stack, i) => {
    const parsed = ItemSchema.safeParse(stack.item);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new BattleSetupError(`items[${i}].item: ${issue?.path.join(".")} ${issue?.message}`);
    }
    if (seen.has(parsed.data.id)) {
      throw new BattleSetupError(
        `items[${i}].item: "${parsed.data.id}" is already in the inventory`,
      );
    }
    seen.add(parsed.data.id);
    if (!Number.isSafeInteger(stack.count) || stack.count <= 0) {
      throw new BattleSetupError(
        `items[${i}].count: must be a positive integer (got ${stack.count})`,
      );
    }
    return { item: parsed.data, count: stack.count };
  });
}

/** Validates the auto-battle settings: known modes on existing slots, boolean toggles. */
function checkAutoSettings(settings: AutoSettings, party: readonly BattleUnit[]): AutoSettings {
  if (typeof settings !== "object" || settings === null) {
    throw new BattleSetupError("autoSettings: must be an object");
  }
  for (const key of ["sbbPriority", "forcedBbPriority", "odUbbPriority"] as const) {
    const value = settings[key];
    if (value !== undefined && typeof value !== "boolean") {
      throw new BattleSetupError(`autoSettings.${key}: must be a boolean`);
    }
  }
  for (const [slot, mode] of Object.entries(settings.modes ?? {})) {
    if (!party.some((unit) => unit.slot === slot)) {
      throw new BattleSetupError(`autoSettings.modes.${slot}: no party unit in that slot`);
    }
    if (!(AUTO_UNIT_MODES as readonly unknown[]).includes(mode)) {
      throw new BattleSetupError(`autoSettings.modes.${slot}: unknown mode ${String(mode)}`);
    }
  }
  return settings;
}

/**
 * Builds the initial `BattleState` from a squad snapshot and a seed (GAME_DESIGN §2 Battle
 * Structure). Rejects squads outside 1–5 units plus one ally, a missing leader, unknown forms,
 * invalid unit content (including unknown effect IDs), and empty waves. No combat happens here.
 */
export function createBattle(setup: BattleSetup, seed: number): BattleState {
  const { squad, leaderIndex, ally, waves, sparkAssist } = setup;
  if (squad.length === 0 || squad.length > MAX_SQUAD_UNITS) {
    throw new BattleSetupError(
      `squad: must have 1–${MAX_SQUAD_UNITS} units plus an optional ally (got ${squad.length})`,
    );
  }
  if (!Number.isInteger(leaderIndex) || leaderIndex < 0 || leaderIndex >= squad.length) {
    throw new BattleSetupError(`leaderIndex: ${leaderIndex} is not a squad index`);
  }
  checkWaves(waves);
  const formChanges = checkFormChanges(setup.formChanges, waves);
  if (sparkAssist !== undefined && typeof sparkAssist !== "boolean") {
    throw new BattleSetupError("sparkAssist: must be a boolean");
  }
  const items = checkItems(setup.items);
  if (setup.trial !== undefined && typeof setup.trial !== "boolean") {
    throw new BattleSetupError("trial: must be a boolean");
  }

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
    waveStartTurn: 1,
    formChanges,
    enemies: spawnWave(firstWave),
    timeline: [],
    sparkWindowTicks: sparkWindowTicks(sparkAssist === true),
    recentHits: [],
    nextActionId: 0,
    od: createOdGauge(),
    acted: [],
    items,
    trial: setup.trial === true,
    continued: false,
    ...(setup.autoSettings === undefined
      ? {}
      : { autoSettings: checkAutoSettings(setup.autoSettings, party) }),
  };
  return withPassiveHp(refreshPassives(state));
}

/**
 * Leader-skill, Extra Skill, sphere and SP passives go into force at battle start. HP passives
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
