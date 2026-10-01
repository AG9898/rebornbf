import { readFileSync } from "node:fs";
import {
  type Enemy,
  EnemySchema,
  isBossStage,
  type Stage,
  StageSchema,
  type Unit,
  UnitSchema,
} from "@bfr/data";
import { describe, expect, it } from "vitest";
import { evaluateEnemyAi } from "../ai/evaluate.ts";
import { autoBurstTier, autoInputs } from "../auto.ts";
import type { BattleEvent } from "../events.ts";
import { isOdFull } from "../gauge/overdrive.ts";
import { createBattle } from "../state/create-battle.ts";
import type {
  AllySetup,
  BattleSetup,
  BattleState,
  BattleUnit,
  EnemySetup,
  ResolvedStatsMember,
} from "../state/types.ts";
import type { BattleInput, BurstTier } from "../timeline/types.ts";
import { playTurn } from "../turn.ts";

// Trial 1 (M6-01A, RESOLVED-70): Captain Locke in two waves, tuned for GAME_DESIGN §5's evolved
// reference squad (one starter at 7★, two at 6★, two at 5★, one B1 unit at 6★, all at max level
// for their forms; no spheres, items, or SP). Correct play reads Locke's script: it guards the
// party on the turns his telegraphed nukes land, holds bursts while his Tower Guard is up, saves
// the healer's gauge for her healing burst, and spends Overdrive on Brand's UBB. Naive
// tap-everything play (engine auto: every unit bursts when charged, else attacks, and never
// guards) is worn down by the nukes it walks into, and guarding alone does not save it.

const CONTENT = new URL("../../../data/content/", import.meta.url);

function load(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, CONTENT), "utf8"));
}

const trial: Stage = StageSchema.parse(load("stages/trial-01-captain-locke.json"));

function enemySetup(id: string): EnemySetup {
  const enemy: Enemy = EnemySchema.parse(load(`enemies/${id}.json`));
  const { drops, ...rest } = enemy;
  return drops.bcResistance === undefined ? rest : { ...rest, bcResistance: drops.bcResistance };
}

/** A unit in its `rarity`★ form at that form's max level (max stats, no type gains). */
function maxed(id: string, rarity: number): ResolvedStatsMember {
  const unit: Unit = UnitSchema.parse(load(`units/${id}.json`));
  const form = unit.forms.find((f) => f.rarity === rarity);
  if (!form) throw new Error(`${id} has no ${rarity}★ form`);
  return { unit, formId: form.id, stats: form.stats.max };
}

/**
 * The reference squad: the chapter 1 starters evolved with the chapter 1 dungeons (Brand 7★ as
 * leader, Maren and Solen 6★, Garrick and Rook 5★) and a summoned Vespera 6★ as the ally.
 */
function referenceSetup(): BattleSetup {
  const ally: AllySetup = { ...maxed("vespera", 6), kind: "duplicate" };
  return {
    squad: [
      maxed("brand", 7),
      maxed("maren", 6),
      maxed("solen", 6),
      maxed("garrick", 5),
      maxed("rook", 5),
    ],
    leaderIndex: 0,
    ally,
    waves: trial.waves.map((wave) => wave.enemies.map((slot) => enemySetup(slot.enemy))),
    trial: true,
  };
}

/** Locke's skills that read as "brace now": the telegraphed nukes. */
const NUKES = new Set(["frost-glaive", "winter-requiem"]);

/** The skill each living enemy's script picks for its next turn (targets aside). */
function nextEnemySkills(state: BattleState): string[] {
  return state.enemies
    .filter((enemy) => enemy.hp > 0)
    .map(
      (enemy) =>
        evaluateEnemyAi({
          enemy,
          rules: enemy.ai,
          enemyTurn: enemy.turnsTaken + 1,
          party: state.party,
          memory: enemy.aiMemory,
          rng: state.rng,
        }).skill,
    );
}

/** Whether `unit`'s `tier` burst heals the party. */
function isHealingBurst(unit: BattleUnit, tier: BurstTier): boolean {
  return (unit.form.bursts[tier]?.effects ?? []).some((effect) => effect.id.startsWith("heal."));
}

/**
 * Correct play: guard every unit before a telegraphed nuke; while Locke's Tower Guard (his DEF
 * buff) is up, attack to build gauge and hold bursts; otherwise burst everything that is charged.
 */
function correctInputs(state: BattleState): BattleInput[] {
  const living = state.party.filter((u) => u.hp > 0 && !state.acted.includes(u.slot));
  const brace = nextEnemySkills(state).some((skill) => NUKES.has(skill));
  const shielded = state.enemies.some(
    (enemy) => enemy.hp > 0 && enemy.effects.some((effect) => effect.id === "buff.def"),
  );
  const inputs: BattleInput[] = [];
  if (!brace && !shielded && isOdFull(state.od)) {
    const brand = living.find((u) => u.unitId === "brand" && u.form.bursts.ubb);
    if (brand) inputs.push({ type: "overdrive", tick: state.tick, actor: brand.slot });
  }
  for (const unit of living) {
    const overdrive = inputs.some((i) => i.type === "overdrive" && i.actor === unit.slot);
    const charged = autoBurstTier(unit);
    const healer = (["sbb", "ubb"] as const).some((t) => isHealingBurst(unit, t));
    const heals = charged !== undefined && isHealingBurst(unit, charged);
    let tier: BurstTier | undefined;
    if (overdrive) tier = "ubb";
    // The healer saves its gauge for its healing burst and casts it whenever it is charged.
    else if (healer) tier = heals && !brace ? charged : undefined;
    // Bursts are held while the Tower Guard is up: they would only chip it.
    else if (!brace && !shielded) tier = charged;
    if (tier) inputs.push({ type: "burst", tick: state.tick, actor: unit.slot, tier });
    else if (brace) inputs.push({ type: "guard", tick: state.tick, actor: unit.slot });
    else inputs.push({ type: "attack", tick: state.tick, actor: unit.slot });
  }
  return inputs;
}

function playOut(
  start: BattleState,
  policy: (state: BattleState) => BattleInput[],
  maxTurns = 60,
): { state: BattleState; log: BattleEvent[] } {
  let state = start;
  const log: BattleEvent[] = [];
  for (let i = 0; i < maxTurns && state.result === undefined; i++) {
    const turn = playTurn(state, policy(state));
    log.push(...turn.events);
    state = turn.state;
  }
  return { state, log };
}

const SEEDS = [1, 7, 42, 2024, 31337];

function casts(log: readonly BattleEvent[], skill: string): number {
  return log.filter((e) => e.type === "EnemyActionStarted" && e.skill === skill).length;
}

describe("Trial 1: Captain Locke (M6-01A)", () => {
  it("is a trial gated on the chapter 1 clear, fought as Locke then his frost-berserk form", () => {
    expect(trial.trial).toEqual({ number: 1, gate: "story-08-beacon-hollow" });
    expect(isBossStage(trial)).toBe(true);
    expect(trial.waves.map((wave) => wave.enemies)).toEqual([
      [{ enemy: "trial1-locke" }],
      [{ enemy: "trial1-locke-p2", boss: true }],
    ]);
  });

  it.each(SEEDS)("the reference squad clears it with correct play (seed %i)", (seed) => {
    const { state, log } = playOut(createBattle(referenceSetup(), seed), correctInputs);
    expect(state.result).toBe("win");
    expect(state.waveIndex).toBe(1);
    // Wave 1 always shows both of Locke's tells: a telegraphed nuke and the Tower Guard.
    expect(casts(log, "frost-glaive")).toBeGreaterThan(0);
    expect(casts(log, "tower-guard")).toBeGreaterThan(0);
  });

  it("the frost-berserk form brings its own nuke and phase (Winter Requiem, Berserk Frost)", () => {
    const logs = SEEDS.map(
      (seed) => playOut(createBattle(referenceSetup(), seed), correctInputs).log,
    );
    // A fast wave 2 can end before its fourth turn, so the casts are counted over every seed.
    expect(logs.reduce((n, log) => n + casts(log, "winter-requiem"), 0)).toBeGreaterThan(0);
    for (const log of logs) expect(casts(log, "berserk-frost")).toBe(1);
  });

  it.each(SEEDS)("naive tap-everything play fails it (seed %i)", (seed) => {
    const { state } = playOut(createBattle(referenceSetup(), seed), (s) => autoInputs(s));
    expect(state.result).toBe("lose");
  });

  it.each(SEEDS)("guarding the nukes without burst timing also fails (seed %i)", (seed) => {
    // Braces like correct play but bursts the moment a gauge fills, into the Tower Guard too.
    const guardOnly = (s: BattleState): BattleInput[] =>
      nextEnemySkills(s).some((skill) => NUKES.has(skill))
        ? s.party
            .filter((u) => u.hp > 0)
            .map((u) => ({ type: "guard", tick: s.tick, actor: u.slot }))
        : autoInputs(s);
    const { state } = playOut(createBattle(referenceSetup(), seed), guardOnly);
    expect(state.result).toBe("lose");
  });
});
