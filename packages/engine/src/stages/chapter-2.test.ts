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

// Chapter 2 reference: five 6★ units at max level, no ally or spheres, with one B1 at 5★.

const CONTENT = new URL("../../../data/content/", import.meta.url);

function load(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, CONTENT), "utf8"));
}

const chapter: Stage[] = readdirSync(new URL("stages/", CONTENT))
  .filter((name) => name.endsWith(".json"))
  .map((name) => StageSchema.parse(load(`stages/${name}`)))
  .filter((stage) => stage.story?.chapter === 2)
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

/** A unit at its form's max stats, Lord type. */
function starter(id: string, rarity: number): SquadMemberSetup {
  const unit: Unit = UnitSchema.parse(load(`units/${id}.json`));
  const form = unit.forms.find((f) => f.rarity === rarity);
  if (!form) throw new Error(`${id} has no ${rarity}★ form`);
  return { unit, formId: form.id, stats: form.stats.max };
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

describe("chapter 2 content (M3-04F)", () => {
  it("has stages 9–16, only stage 16 the Tidewright boss", () => {
    expect(chapter.map((s) => s.story?.number)).toEqual([9, 10, 11, 12, 13, 14, 15, 16]);
    expect(chapter.filter(isBossStage).map((s) => s.story?.number)).toEqual([16]);
    expect(stageNumber(16).waves.at(-1)?.enemies).toEqual([
      { enemy: "ch2-tidewright", boss: true },
    ]);
  });

  it("uses only its new coast enemies and grants exactly 400 first-clear gems", () => {
    expect(chapter.map((s) => s.firstClear?.gems)).toEqual([25, 25, 25, 30, 30, 30, 35, 200]);
    expect(chapter.reduce((sum, s) => sum + (s.firstClear?.gems ?? 0), 0)).toBe(400);
    const ids = new Set(
      chapter.flatMap((s) => s.waves.flatMap((w) => w.enemies.map((e) => e.enemy))),
    );
    expect([...ids].sort()).toEqual([
      "ch2-glassward",
      "ch2-kiln-crab",
      "ch2-reed-stalker",
      "ch2-saltfin",
      "ch2-storm-ray",
      "ch2-tidewright",
    ]);
    for (const id of ids) expect(enemySetup(id).id).toBe(id);
  });

  it.each(["aurelle", "vespera"])("every stage clears with one %s B1 unit", (b1) => {
    const squad = [
      starter("brand", 6),
      starter("maren", 6),
      starter("rook", 6),
      starter("garrick", 6),
      starter(b1, 5),
    ];
    for (const stage of chapter) {
      for (const seed of [1, 7, 2024, 42, 99]) {
        const { state } = playOut(createBattle(setup(stage, squad), seed));
        expect(state.result, `${stage.id}, ${b1}, seed ${seed}`).toBe("win");
      }
    }
  });

  it("the Tidewright's glassfall phase fires once in a reference boss clear", () => {
    const squad = [
      starter("brand", 6),
      starter("maren", 6),
      starter("rook", 6),
      starter("garrick", 6),
      starter("aurelle", 5),
    ];
    const { state, log } = playOut(createBattle(setup(stageNumber(16), squad), 7));
    expect(state.result).toBe("win");
    expect(state.waveIndex).toBe(2);
    expect(
      log.filter((e) => e.type === "EnemyActionStarted" && e.skill === "glassfall"),
    ).toHaveLength(1);
  });
});
