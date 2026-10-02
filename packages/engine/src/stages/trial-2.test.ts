import { readFileSync } from "node:fs";
import {
  type Enemy,
  EnemySchema,
  isBossStage,
  type Sphere,
  SphereSchema,
  type Stage,
  StageSchema,
  stageFormChanges,
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

// Trial 2 (M6-01B_2, RESOLVED-72): Master Ozric, an elder master who strikes with every element,
// fought as his Dark form and then, after 5 turns, his Light dawn form through the M6-01B_1
// turn-triggered form change. Tuned for GAME_DESIGN §5's Trial 2 reference squad: starters with
// three at 7★, an evolved B1 ally, and Trial 1's +20% all-stat spheres (Vanguard Seal), all at max
// level for their forms; no items or SP. Correct play guards the whole party into the telegraphed
// turn-1 Verdict of Ages and every Radiant Sentence, saves the healer's gauge for her healing
// burst, spends Overdrive on Brand's UBB, and otherwise bursts on charge to out-damage the dawn
// form's heal over time. Naive tap-everything play never guards and is wiped on turn 1.

const CONTENT = new URL("../../../data/content/", import.meta.url);

function load(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, CONTENT), "utf8"));
}

const trial: Stage = StageSchema.parse(load("stages/trial-02-master-ozric.json"));
const vanguard: Sphere = SphereSchema.parse(load("spheres/vanguard-seal.json"));

function enemySetup(id: string): EnemySetup {
  const enemy: Enemy = EnemySchema.parse(load(`enemies/${id}.json`));
  const { drops, ...rest } = enemy;
  return drops.bcResistance === undefined ? rest : { ...rest, bcResistance: drops.bcResistance };
}

/** A unit in its `rarity`★ form at that form's max level, with a Vanguard Seal. */
function maxed(id: string, rarity: number): ResolvedStatsMember {
  const unit: Unit = UnitSchema.parse(load(`units/${id}.json`));
  const form = unit.forms.find((f) => f.rarity === rarity);
  if (!form) throw new Error(`${id} has no ${rarity}★ form`);
  return { unit, formId: form.id, stats: form.stats.max, spheres: [vanguard] };
}

/**
 * The reference squad: Brand (leader), Maren, and Solen at 7★, Morrick and Rook at 6★, and an
 * Aurelle 6★ ally, each with a Vanguard Seal.
 */
function referenceSetup(): BattleSetup {
  const ally: AllySetup = { ...maxed("aurelle", 6), kind: "duplicate" };
  return {
    squad: [
      maxed("brand", 7),
      maxed("maren", 7),
      maxed("solen", 7),
      maxed("morrick", 6),
      maxed("rook", 6),
    ],
    leaderIndex: 0,
    ally,
    waves: trial.waves.map((wave) => wave.enemies.map((slot) => enemySetup(slot.enemy))),
    formChanges: stageFormChanges(trial),
    trial: true,
  };
}

/** Ozric's telegraphed nukes: the whole party guards into them. */
const NUKES = new Set(["verdict-of-ages", "radiant-sentence"]);

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
 * Correct play: the whole party guards when a nuke is next (with `guardTurnOne` false, not on
 * turn 1); otherwise Brand spends a full OD gauge on his UBB, the healer casts only her healing
 * bursts, and everyone else bursts when charged.
 */
function correctInputs(state: BattleState, guardTurnOne = true): BattleInput[] {
  const living = state.party.filter((u) => u.hp > 0 && !state.acted.includes(u.slot));
  const brace =
    nextEnemySkills(state).some((skill) => NUKES.has(skill)) && (guardTurnOne || state.turn > 1);
  const inputs: BattleInput[] = [];
  if (!brace && isOdFull(state.od)) {
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
    else if (brace) tier = undefined;
    else if (healer) tier = heals ? charged : undefined;
    else tier = charged;
    if (tier) inputs.push({ type: "burst", tick: state.tick, actor: unit.slot, tier });
    else if (brace) inputs.push({ type: "guard", tick: state.tick, actor: unit.slot });
    else inputs.push({ type: "attack", tick: state.tick, actor: unit.slot });
  }
  return inputs;
}

/** Naive tap-everything play: engine auto (bursts when charged, else attacks, never guards). */
const naive = (state: BattleState): BattleInput[] => autoInputs(state);

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

describe("Trial 2: Master Ozric (M6-01B_2)", () => {
  it("is a trial gated on the chapter 2 clear: Ozric, then his dawn form after 5 turns", () => {
    expect(trial.trial).toEqual({ number: 2, gate: "story-16-tidewright-spire" });
    expect(isBossStage(trial)).toBe(true);
    expect(trial.waves.map((wave) => wave.enemies)).toEqual([
      [{ enemy: "trial2-ozric" }],
      [{ enemy: "trial2-ozric-p2", boss: true }],
    ]);
    expect(stageFormChanges(trial)).toEqual([{ wave: 0, afterTurns: 5 }]);
    const [dark, light] = referenceSetup().waves.map((wave) => wave[0]);
    expect(dark?.element).toBe("dark");
    expect(light?.element).toBe("light");
    // The dawn form lowers his ATK.
    expect(light?.stats.atk).toBeLessThan(dark?.stats.atk ?? 0);
  });

  it.each(SEEDS)("the reference squad clears it with correct play (seed %i)", (seed) => {
    const { state, log } = playOut(createBattle(referenceSetup(), seed), correctInputs);
    expect(state.result).toBe("win");
    expect(casts(log, "verdict-of-ages")).toBe(1);
    // He outlasts five turns of correct play, so the form change (not a kill) ends wave 1, at the
    // end of turn 5.
    expect(log.find((e) => e.type === "FormChanged")).toMatchObject({ wave: 0 });
    expect(log.some((e) => e.type === "WaveCleared")).toBe(false);
    const started = log.find((e) => e.type === "WaveStarted" && e.wave === 1);
    const sixth = log.find((e) => e.type === "TurnStarted" && e.turn === 6);
    expect(started?.tick).toBe(sixth?.tick);
  });

  it("strikes with every element: Verdict of Ages hits each unit on a weakness", () => {
    const start = createBattle(referenceSetup(), 1);
    const { events } = playTurn(start, correctInputs(start));
    const hits = events.filter((e) => e.type === "EnemyHitLanded");
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) expect(hit.type === "EnemyHitLanded" && hit.element).toBe("weak");
  });

  it("the dawn form heals itself over time", () => {
    const logs = SEEDS.map(
      (seed) => playOut(createBattle(referenceSetup(), seed), correctInputs).log,
    );
    for (const log of logs) expect(casts(log, "dawn-vigil")).toBeGreaterThan(0);
    const healed = logs
      .flat()
      .filter((e) => e.type === "HpRestored" && e.target === "e0" && e.effect === "heal.over_time");
    expect(healed.length).toBeGreaterThan(0);
  });

  it.each(SEEDS)("naive tap-everything play fails it (seed %i)", (seed) => {
    const { state } = playOut(createBattle(referenceSetup(), seed), naive);
    expect(state.result).toBe("lose");
  });

  it.each(SEEDS)("skipping the turn-1 guard wipes the squad on turn 1 (seed %i)", (seed) => {
    const start = createBattle(referenceSetup(), seed);
    const { state } = playTurn(start, correctInputs(start, false));
    expect(state.party.every((unit) => unit.hp === 0)).toBe(true);
    expect(state.result).toBe("lose");
  });

  it("replays deterministically", () => {
    const a = playOut(createBattle(referenceSetup(), 42), correctInputs);
    const b = playOut(createBattle(referenceSetup(), 42), correctInputs);
    expect(b.log).toEqual(a.log);
    expect(b.state).toEqual(a.state);
  });
});
