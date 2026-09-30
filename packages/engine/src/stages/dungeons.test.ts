import { readFileSync } from "node:fs";
import {
  CHAPTER_1_CLEAR,
  CROWN_SHARD_STAGE_ID,
  crownShardStage,
  DUNGEON_FAMILIES,
  dungeonStage,
  type Enemy,
  EnemySchema,
  familyElements,
  materialEnemyId,
  materialUnitId,
  rampedStats,
  type Stage,
  StageSchema,
  type Stats,
  type Unit,
  UnitSchema,
} from "@bfr/data";
import { describe, expect, it } from "vitest";
import { autoInputs } from "../auto.ts";
import { createRng, nextFloat, type RngState } from "../rng.ts";
import { createBattle } from "../state/create-battle.ts";
import type { AllySetup, BattleState, EnemySetup, ResolvedStatsMember } from "../state/types.ts";
import { playTurn } from "../turn.ts";

// Farming dungeons: the Sprite and Effigy series (M4-03C, story stage 4 gate), the Mote and Cairn
// series (M4-03D, story stage 6 gate, +10% ramp), and the chapter 1 clear series (M4-03E, story
// stage 8 gate: Prism Cairn and Wyrm Coffer +25%; Colossus, the Urns, and the Crown Shard stage
// +45%), and the EXP vessel series (M4-03F: Flask at stage 4; Alembic at stage 6, +10%; Athanor
// and Grail at the chapter 1 clear, +25%). Each stage's baseline is cleared by the squad held at its gate on naive auto-play; a
// ramped stage is cleared by that squad plus an ally and the spheres held at the gate
// (RESOLVED-71). Every stage settles captures per RESOLVED-70.

const CONTENT = new URL("../../../data/content/", import.meta.url);

function load(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, CONTENT), "utf8"));
}

const enemyCache = new Map<string, Enemy>();

function enemy(id: string): Enemy {
  let cached = enemyCache.get(id);
  if (!cached) {
    cached = EnemySchema.parse(load(`enemies/${id}.json`));
    enemyCache.set(id, cached);
  }
  return cached;
}

/**
 * An enemy with the stage's difficulty ramp (GAME_DESIGN §7 → Farming dungeons, RESOLVED-71): HP
 * and ATK raised by `ramp`% through `rampedStats`.
 */
function enemySetup(id: string, ramp: number | undefined): EnemySetup {
  const { drops, stats, ...rest } = enemy(id);
  const ramped = { ...rest, stats: rampedStats(stats, ramp) };
  return drops.bcResistance === undefined
    ? ramped
    : { ...ramped, bcResistance: drops.bcResistance };
}

/** A starter in its `rarity`★ form at that form's max level (max stats, no type gains). */
function maxed(id: string, rarity: number): ResolvedStatsMember {
  const unit: Unit = UnitSchema.parse(load(`units/${id}.json`));
  const form = unit.forms.find((f) => f.rarity === rarity);
  if (!form) throw new Error(`${id} has no ${rarity}★ form`);
  return { unit, formId: form.id, stats: form.stats.max };
}

/**
 * `stats` with a +10% all-stat sphere (GAME_DESIGN §6 → Spheres): ATK, DEF, REC, and max HP
 * +10%, rounded. The engine has no sphere support yet (M4-04A), so the test applies it here.
 */
function withSphere(stats: Stats): Stats {
  const up = (value: number) => Math.round(value * 1.1);
  return { hp: up(stats.hp), atk: up(stats.atk), def: up(stats.def), rec: up(stats.rec) };
}

/**
 * The starters held at each gate, at their forms' max stats: story stage 4 (Brand picked, Maren
 * 3★, Rook 4★), story stage 6 (plus Garrick 5★), and the chapter 1 clear (plus Solen 6★).
 */
const GATE_SQUADS: Readonly<Record<string, readonly ResolvedStatsMember[]>> = {
  "story-04-rustwood-hollow": [maxed("brand", 3), maxed("maren", 3), maxed("rook", 4)],
  "story-06-sunken-waystation": [
    maxed("brand", 3),
    maxed("maren", 3),
    maxed("rook", 4),
    maxed("garrick", 5),
  ],
  [CHAPTER_1_CLEAR]: [
    maxed("brand", 3),
    maxed("maren", 3),
    maxed("rook", 4),
    maxed("garrick", 5),
    maxed("solen", 6),
  ],
};

/**
 * Spheres held at each gate (RESOLVED-71): the chapter 1 clear grants six +10% all-stat spheres,
 * one per squad unit on a ramped run. No earlier gate has any.
 */
const GATE_SPHERES: ReadonlySet<string> = new Set([CHAPTER_1_CLEAR]);

/**
 * The ally a ramped series is tested with: a friend's copy of the gate's newest starter at max
 * stats and without spheres (Garrick 5★ at story stage 6, Solen 6★ at the chapter 1 clear).
 */
const ALLIES: Readonly<Record<string, AllySetup>> = {
  "story-06-sunken-waystation": { ...maxed("garrick", 5), kind: "duplicate" },
  [CHAPTER_1_CLEAR]: { ...maxed("solen", 6), kind: "duplicate" },
};

function ally(stage: Stage): AllySetup {
  const found = ALLIES[stage.dungeon?.gate ?? ""];
  if (!found) throw new Error(`${stage.id}: no ally for ${stage.dungeon?.gate}`);
  return found;
}

function gateSquad(stage: Stage): readonly ResolvedStatsMember[] {
  const squad = GATE_SQUADS[stage.dungeon?.gate ?? ""];
  if (!squad) throw new Error(`${stage.id}: no gate squad for ${stage.dungeon?.gate}`);
  return squad;
}

function playOut(
  stage: Stage,
  seed: number,
  options: { ramp: number | undefined; ally: boolean },
): BattleState {
  const spheres = options.ally && GATE_SPHERES.has(stage.dungeon?.gate ?? "");
  const squad = gateSquad(stage).map((member) =>
    spheres ? { ...member, stats: withSphere(member.stats) } : member,
  );
  let state = createBattle(
    {
      squad,
      leaderIndex: 0,
      ...(options.ally ? { ally: ally(stage) } : {}),
      waves: stage.waves.map((wave) =>
        wave.enemies.map((slot) => enemySetup(slot.enemy, options.ramp)),
      ),
    },
    seed,
  );
  for (let i = 0; i < 80 && state.result === undefined; i++) {
    state = playTurn(state, autoInputs(state)).state;
  }
  return state;
}

/**
 * The capture half of reward settlement, mirroring `grant_battle_rewards` (M4-03B migration): per
 * enemy slot, a capture drop is granted when the slot is marked `capture: "always"` or its
 * `rate`% roll succeeds. Rolls here come from the engine's seeded PRNG.
 */
function settleCaptures(stage: Stage, rng: RngState): { units: string[]; rng: RngState } {
  const units: string[] = [];
  let next = rng;
  for (const wave of stage.waves) {
    for (const slot of wave.enemies) {
      const capture = enemy(slot.enemy).drops.capture;
      if (!capture) continue;
      if (slot.capture === "always") {
        units.push(capture.unit);
        continue;
      }
      const roll = nextFloat(next);
      next = roll.rng;
      if (roll.value * 100 < capture.rate) units.push(capture.unit);
    }
  }
  return { units, rng: next };
}

const stages = Object.values(DUNGEON_FAMILIES).flatMap((family) =>
  familyElements(family).map((element) => ({
    family,
    element,
    stage: StageSchema.parse(load(`stages/${dungeonStage(family, element).id}.json`)),
  })),
);

const crownShard = StageSchema.parse(load(`stages/${CROWN_SHARD_STAGE_ID}.json`));

/** Every dungeon stage the battle tests play: the material stages and the Crown Shard stage. */
const playable = [...stages.map(({ stage }) => stage), crownShard];

/** Each family's gate and ramp (RESOLVED-67, RESOLVED-71; EXP vessels M4-03F). */
const EXPECTED: Readonly<Record<string, { gate: string; ramp: number | undefined }>> = {
  sprite: { gate: "story-04-rustwood-hollow", ramp: undefined },
  effigy: { gate: "story-04-rustwood-hollow", ramp: undefined },
  mote: { gate: "story-06-sunken-waystation", ramp: 10 },
  cairn: { gate: "story-06-sunken-waystation", ramp: 10 },
  "prism-cairn": { gate: CHAPTER_1_CLEAR, ramp: 25 },
  "wyrm-coffer": { gate: CHAPTER_1_CLEAR, ramp: 25 },
  colossus: { gate: CHAPTER_1_CLEAR, ramp: 45 },
  "glint-urn": { gate: CHAPTER_1_CLEAR, ramp: 45 },
  "dusk-urn": { gate: CHAPTER_1_CLEAR, ramp: 45 },
  flask: { gate: "story-04-rustwood-hollow", ramp: undefined },
  alembic: { gate: "story-06-sunken-waystation", ramp: 10 },
  athanor: { gate: CHAPTER_1_CLEAR, ramp: 25 },
  grail: { gate: CHAPTER_1_CLEAR, ramp: 25 },
};

const SEEDS = [1, 7, 2024, 11, 500];

describe("farming dungeon series (M4-03C–F)", () => {
  it("has 58 material stages, each at its family's gate and ramp", () => {
    expect(stages).toHaveLength(58);
    for (const { family, stage } of stages) {
      expect(stage.dungeon?.series).toBe(family.family);
      expect({ gate: stage.dungeon?.gate, ramp: stage.dungeon?.ramp }).toEqual(
        EXPECTED[family.family],
      );
    }
  });

  it("the Crown Shard stage sits in the Colossus series and grants the Crown Shard", () => {
    expect(crownShard).toEqual(crownShardStage());
    expect(crownShard.dungeon).toEqual({
      series: "colossus",
      gate: CHAPTER_1_CLEAR,
      keyItem: { item: "crown-shard", rate: 20 },
      ramp: 45,
    });
    expect(crownShard.waves).toHaveLength(3);
    for (const slot of crownShard.waves.flatMap((wave) => wave.enemies)) {
      expect(enemy(slot.enemy).drops.capture).toBeUndefined();
    }
  });

  it.each(playable.map((stage) => [stage.id, stage] as const))(
    "the gate squad clears %s's baseline on naive auto-play",
    (_id, stage) => {
      for (const seed of SEEDS) {
        const state = playOut(stage, seed, { ramp: 0, ally: false });
        expect(state.result, `seed ${seed}`).toBe("win");
        expect(state.waveIndex).toBe(2);
      }
    },
  );

  it.each(
    playable.filter((stage) => stage.dungeon?.ramp).map((stage) => [stage.id, stage] as const),
  )("the gate squad with an ally and its spheres clears ramped %s on auto", (_id, stage) => {
    for (const seed of SEEDS) {
      const state = playOut(stage, seed, { ramp: stage.dungeon?.ramp, ally: true });
      expect(state.result, `seed ${seed}`).toBe("win");
      expect(state.waveIndex).toBe(2);
    }
  });

  it("rampedStats raises HP and ATK only", () => {
    const stats = { hp: 2500, atk: 700, def: 1000, rec: 100 };
    expect(rampedStats(stats, 10)).toEqual({ hp: 2750, atk: 770, def: 1000, rec: 100 });
    expect(rampedStats(stats, undefined)).toBe(stats);
  });

  it("settlement always captures the final-wave material and the rest at about 25%", () => {
    for (const { family, element, stage } of stages) {
      const unit = materialUnitId(family, element);
      const material = materialEnemyId(family, element);
      // Waves 1–2 hold three material enemies; the final wave holds the always-captured one.
      const rolled = stage.waves
        .slice(0, 2)
        .flatMap((wave) => wave.enemies)
        .filter((slot) => slot.enemy === material).length;
      expect(rolled).toBe(3);

      let rng = createRng(4242);
      let captured = 0;
      const clears = 4000;
      for (let i = 0; i < clears; i++) {
        const settled = settleCaptures(stage, rng);
        rng = settled.rng;
        expect(settled.units.length).toBeGreaterThanOrEqual(1);
        expect(settled.units.every((id) => id === unit)).toBe(true);
        captured += settled.units.length - 1;
      }
      // 3 rolls per clear at 25%: 0.75 extra captures per clear on average.
      expect(captured / clears).toBeGreaterThan(0.7);
      expect(captured / clears).toBeLessThan(0.8);
    }
  });
});
