import { readdirSync, readFileSync } from "node:fs";
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
import type { BattleEvent } from "../events.ts";
import { canBurst } from "../gauge/index.ts";
import { createBattle } from "../state/create-battle.ts";
import type { BattleSetup, BattleState, EnemySetup, SquadMemberSetup } from "../state/types.ts";
import type { BattleInput } from "../timeline/types.ts";
import { playTurn } from "../turn.ts";

// Chapter 1 (M3-04A): stages 1–8 of the story, stage 8 the Gravemaw boss. Reference clears use the
// starters a player holds when each stage opens (GAME_DESIGN §8 Starters), at level 1.

const CONTENT = new URL("../../../data/content/", import.meta.url);

function load(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, CONTENT), "utf8"));
}

const chapter: Stage[] = readdirSync(new URL("stages/", CONTENT))
  .filter((name) => name.endsWith(".json"))
  .map((name) => StageSchema.parse(load(`stages/${name}`)))
  .filter((stage) => stage.story?.chapter === 1)
  .sort((a, b) => (a.story?.number ?? 0) - (b.story?.number ?? 0));

function stageNumber(n: number): Stage {
  const stage = chapter.find((s) => s.story?.number === n);
  if (!stage) throw new Error(`stage ${n} missing`);
  return stage;
}

function enemySetup(id: string): EnemySetup {
  const enemy: Enemy = EnemySchema.parse(load(`enemies/${id}.json`));
  const { drops, ...rest } = enemy;
  return drops.bcResistance === undefined ? rest : { ...rest, bcResistance: drops.bcResistance };
}

/** A starter at `rarity`★ and level 1 (its form's base stats). */
function starter(id: string, rarity: number): SquadMemberSetup {
  const unit: Unit = UnitSchema.parse(load(`units/${id}.json`));
  const form = unit.forms.find((f) => f.rarity === rarity);
  if (!form) throw new Error(`${id} has no ${rarity}★ form`);
  return { unit, formId: form.id, stats: form.stats.base };
}

function setup(stage: Stage, squad: SquadMemberSetup[]): BattleSetup {
  return {
    squad,
    leaderIndex: 0,
    waves: stage.waves.map((wave) => wave.enemies.map((slot) => enemySetup(slot.enemy))),
  };
}

/** Every living unit uses its highest charged burst (SBB, then BB), else attacks. */
function autoInputs(state: BattleState): BattleInput[] {
  return state.party
    .filter((unit) => unit.hp > 0)
    .map((unit): BattleInput => {
      const tier = (["sbb", "bb"] as const).find((t) =>
        canBurst(unit.form, t, unit.bc, unit.overdrive),
      );
      return tier
        ? { type: "burst", tick: state.tick, actor: unit.slot, tier }
        : { type: "attack", tick: state.tick, actor: unit.slot };
    });
}

function playOut(start: BattleState, maxTurns = 60): { state: BattleState; log: BattleEvent[] } {
  let state = start;
  const log: BattleEvent[] = [];
  for (let i = 0; i < maxTurns && state.result === undefined; i++) {
    const turn = playTurn(state, autoInputs(state));
    log.push(...turn.events);
    state = turn.state;
  }
  return { state, log };
}

describe("chapter 1 content (M3-04A)", () => {
  it("has stages 1–8, only stage 8 a boss stage", () => {
    expect(chapter.map((s) => s.story?.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(chapter.map(isBossStage)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
    expect(stageNumber(8).waves.at(-1)?.enemies).toEqual([{ enemy: "ch1-gravemaw", boss: true }]);
  });

  it("first clears fund pity by the end of the chapter (RESOLVED-28: ≥ 350 gems)", () => {
    const gems = chapter.reduce((sum, s) => sum + (s.firstClear?.gems ?? 0), 0);
    expect(gems).toBeGreaterThanOrEqual(350);
    // The boss reward is the large lump that closes the gap.
    const boss = stageNumber(8).firstClear?.gems ?? 0;
    expect(chapter.every((s) => (s.firstClear?.gems ?? 0) <= boss)).toBe(true);
  });

  it.each(["brand", "maren", "rook", "garrick", "solen", "morrick"])(
    "a lone 3★ %s at level 1 clears stage 1",
    (id) => {
      const { state } = playOut(createBattle(setup(stageNumber(1), [starter(id, 3)]), 1));
      expect(state.result).toBe("win");
    },
  );

  // The starters held when each stage opens (picked Brand, then Maren 3★ after stage 2, Rook 4★
  // after stage 4, Garrick 5★ after stage 6), all at level 1 and with no ally.
  const heldAt = (n: number): SquadMemberSetup[] => [
    starter("brand", 3),
    ...(n > 2 ? [starter("maren", 3)] : []),
    ...(n > 4 ? [starter("rook", 4)] : []),
    ...(n > 6 ? [starter("garrick", 5)] : []),
  ];

  it.each([1, 2, 3, 4, 5, 6, 7])("stage %i is cleared by the starters held when it opens", (n) => {
    for (const seed of [1, 7, 2024]) {
      const { state } = playOut(createBattle(setup(stageNumber(n), heldAt(n)), seed));
      expect(state.result, `seed ${seed}`).toBe("win");
    }
  });

  it.each([1, 7, 2024])("the stage 8 squad clears the Gravemaw boss (seed %i)", (seed) => {
    const { state, log } = playOut(createBattle(setup(stageNumber(8), heldAt(8)), seed));

    expect(state.result).toBe("win");
    expect(state.waveIndex).toBe(2);
    // Gravemaw's phase fires once, below half HP, and the fight lasts several turns.
    const howl = log.filter((e) => e.type === "EnemyActionStarted" && e.skill === "hungering-howl");
    expect(howl).toHaveLength(1);
    expect(state.turn).toBeGreaterThan(4);
  });
});
