import { readFileSync } from "node:fs";
import {
  CHAPTER_1_CLEAR,
  CROWN_SHARD_STAGE_ID,
  crownShardStage,
  DUNGEON_FAMILIES,
  dungeonStage,
  dungeonWaves,
  type Enemy,
  EnemySchema,
  familyElements,
  HOB_DUNGEONS,
  hobStage,
  ITEM_DUNGEONS,
  itemCarrierId,
  itemStage,
  materialEnemyId,
  materialUnitId,
  rampedStats,
  type Stage,
  StageSchema,
  type Stats,
  TRIAL_1,
  type Unit,
  UnitSchema,
  ZENITH_CORE_STAGE_ID,
  zenithCoreStage,
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
// and Grail at the chapter 1 clear, +25%), and the Zenith Core stage (M4-02N: Trial 1 first
// clear gate, +65%), and the battle item series (M4-03G: story stages 4, 6, and 8, no ramp). Each stage's baseline is cleared by the squad held at its gate on naive auto-play; a
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
 * `stats` with a `percent`% all-stat sphere (GAME_DESIGN §6 → Spheres): ATK, DEF, REC, and max HP
 * raised by it, rounded, applied here as a flat stat change.
 */
function withSphere(stats: Stats, percent: number): Stats {
  const up = (value: number) => Math.round((value * (100 + percent)) / 100);
  return { hp: up(stats.hp), atk: up(stats.atk), def: up(stats.def), rec: up(stats.rec) };
}

/**
 * The starters held at each gate, at their forms' max stats: story stage 4 (Brand picked, Maren
 * 3★, Rook 4★), story stage 6 (plus Garrick 5★), the chapter 1 clear (plus Solen 6★), and the
 * Trial 1 first clear (GAME_DESIGN §5's Trial 1 reference squad: Brand 7★, Maren and Solen 6★,
 * Garrick and Rook 5★; its B1 unit, Vespera 6★, is the ally).
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
  [TRIAL_1]: [
    maxed("brand", 7),
    maxed("maren", 6),
    maxed("solen", 6),
    maxed("garrick", 5),
    maxed("rook", 5),
  ],
};

/**
 * The all-stat sphere each squad unit wears on a ramped run, in percent, by gate (RESOLVED-71):
 * the chapter 1 clear grants six +10% spheres and the Trial 1 first clear six +20% ones. No
 * earlier gate has any.
 */
const GATE_SPHERES: Readonly<Record<string, number>> = { [CHAPTER_1_CLEAR]: 10, [TRIAL_1]: 20 };

/**
 * The ally a ramped series is tested with: a friend's copy of the gate's newest starter at max
 * stats and without spheres (Garrick 5★ at story stage 6, Solen 6★ at the chapter 1 clear).
 */
const ALLIES: Readonly<Record<string, AllySetup>> = {
  "story-06-sunken-waystation": { ...maxed("garrick", 5), kind: "duplicate" },
  [CHAPTER_1_CLEAR]: { ...maxed("solen", 6), kind: "duplicate" },
  [TRIAL_1]: { ...maxed("vespera", 6), kind: "duplicate" },
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
  const sphere = options.ally ? GATE_SPHERES[stage.dungeon?.gate ?? ""] : undefined;
  const squad = gateSquad(stage).map((member) =>
    sphere ? { ...member, stats: withSphere(member.stats, sphere) } : member,
  );
  let state = createBattle(
    {
      squad,
      leaderIndex: 0,
      ...(options.ally ? { ally: ally(stage) } : {}),
      waves: dungeonWaves(stage, seed).map((wave) =>
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
const zenithCore = StageSchema.parse(load(`stages/${ZENITH_CORE_STAGE_ID}.json`));

const itemStages = ITEM_DUNGEONS.map((entry) => ({
  entry,
  stage: StageSchema.parse(load(`stages/${itemStage(entry).id}.json`)),
}));

const hobStages = HOB_DUNGEONS.map((entry) =>
  StageSchema.parse(load(`stages/${hobStage(entry).id}.json`)),
);

/** Every dungeon stage the battle tests play: the material, key-item, and battle item stages. */
const playable = [
  ...stages.map(({ stage }) => stage),
  crownShard,
  zenithCore,
  ...itemStages.map(({ stage }) => stage),
];

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
  it.each(hobStages.map((stage) => [stage.id, stage] as const))(
    "the Trial 1 squad, ally and +20%% spheres clear %s with a Grand Hob in every wave",
    (_id, stage) => {
      for (const seed of [...SEEDS, 0, 10000, 20000, 1500]) {
        expect(playOut(stage, seed, { ramp: stage.dungeon?.ramp, ally: true }).result).toBe("win");
      }
    },
  );

  it("seeded hob settlement captures regular hobs at 25%, and one Grand at 15% per clear across waves", () => {
    for (const stage of hobStages) {
      let rng = createRng(4242);
      let grand = 0;
      let regular = 0;
      let rolled = 0;
      const waves = [0, 0, 0];
      const clears = 10000;
      for (let i = 0; i < clears; i++) {
        const seed = nextFloat(rng);
        rng = seed.rng;
        const resolved = {
          ...stage,
          waves: dungeonWaves(stage, Math.floor(seed.value * 0x100000000)),
        };
        const encountered = resolved.waves.flatMap((wave, w) =>
          wave.enemies.filter((slot) => slot.enemy === "dg-grand-hob").map(() => w),
        );
        expect(encountered.length).toBeLessThanOrEqual(1);
        for (const w of encountered) waves[w] = (waves[w] ?? 0) + 1;
        const settled = settleCaptures(resolved, rng);
        rng = settled.rng;
        expect(settled.units.filter((id) => id === "grand-hob")).toHaveLength(encountered.length);
        grand += encountered.length;
        const sureRegular =
          resolved.waves[2]?.enemies.filter(
            (slot) => slot.capture === "always" && slot.enemy !== "dg-grand-hob",
          ).length ?? 0;
        regular += settled.units.filter((id) => id !== "grand-hob").length - sureRegular;
        rolled += resolved.waves
          .slice(0, 2)
          .flatMap((wave) => wave.enemies)
          .filter((slot) => slot.enemy === stage.dungeon?.rareSpawn?.replaces).length;
      }
      expect(grand / clears).toBeGreaterThan(0.14);
      expect(grand / clears).toBeLessThan(0.16);
      expect(regular / rolled).toBeGreaterThan(0.24);
      expect(regular / rolled).toBeLessThan(0.26);
      for (const count of waves) {
        expect(count / grand).toBeGreaterThan(0.3);
        expect(count / grand).toBeLessThan(0.37);
      }
    }
  });
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

  it("the Zenith Core stage opens on Trial 1 with a +65% ramp and a 1-then-20% Zenith Core", () => {
    expect(zenithCore).toEqual(zenithCoreStage());
    expect(zenithCore.dungeon).toEqual({
      series: "zenith-core",
      gate: TRIAL_1,
      keyItem: { item: "zenith-core", rate: 20 },
      ramp: 65,
    });
    for (const slot of zenithCore.waves.flatMap((wave) => wave.enemies)) {
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

  it("settlement grants the Zenith Core on first clear, then at about 20% per clear", () => {
    // Mirrors grant_battle_base_rewards' key-item rule with the engine's seeded PRNG.
    const keyItem = zenithCore.dungeon?.keyItem;
    expect(keyItem?.item).toBe("zenith-core");
    const rate = keyItem?.rate ?? 0;
    const settle = (firstClear: boolean, rng: RngState): { cores: number; rng: RngState } => {
      if (firstClear) return { cores: 1, rng };
      const roll = nextFloat(rng);
      return { cores: roll.value * 100 < rate ? 1 : 0, rng: roll.rng };
    };
    let rng = createRng(2002);
    const first = settle(true, rng);
    expect(first.cores).toBe(1);
    let cores = 0;
    const clears = 4000;
    for (let i = 0; i < clears; i++) {
      const settled = settle(false, rng);
      rng = settled.rng;
      cores += settled.cores;
    }
    expect(cores / clears).toBeGreaterThan(0.18);
    expect(cores / clears).toBeLessThan(0.22);
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

  it("each battle item stage is unramped at its gate and drops its item at about 3 × rate", () => {
    expect(itemStages).toHaveLength(6);
    for (const { entry, stage } of itemStages) {
      expect(stage).toEqual(itemStage(entry));
      expect(stage.dungeon?.ramp).toBeUndefined();
      expect(GATE_SQUADS[entry.gate]).toBeDefined();
      // Mirrors grant_battle_base_rewards: one roll per defeated enemy per item drop entry.
      let rng = createRng(3003);
      let dropped = 0;
      const clears = 4000;
      for (let i = 0; i < clears; i++) {
        for (const slot of stage.waves.flatMap((wave) => wave.enemies)) {
          for (const drop of enemy(slot.enemy).drops.items ?? []) {
            const roll = nextFloat(rng);
            rng = roll.rng;
            if (roll.value * 100 < drop.rate) {
              expect(drop.item).toBe(entry.item);
              expect(slot.enemy).toBe(itemCarrierId(entry));
              dropped++;
            }
          }
        }
      }
      const mean = (3 * entry.rate) / 100;
      expect(dropped / clears).toBeGreaterThan(mean - 0.05);
      expect(dropped / clears).toBeLessThan(mean + 0.05);
    }
  });
});
