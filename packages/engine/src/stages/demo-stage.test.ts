import { readFileSync } from "node:fs";
import { type Enemy, EnemySchema, StageSchema, type Unit, UnitSchema } from "@bfr/data";
import { describe, expect, it } from "vitest";
import type { BattleEvent } from "../events.ts";
import { canBurst } from "../gauge/index.ts";
import { createBattle } from "../state/create-battle.ts";
import type { BattleSetup, BattleState, EnemySetup, SquadMemberSetup } from "../state/types.ts";
import type { BattleInput } from "../timeline/types.ts";
import { playTurn } from "../turn.ts";

// Demo stage (M2-05A): two trash waves and a boss with an HP-threshold phase, cleared headlessly by
// the six B0 starters at Omni (five in the squad, the sixth as the ally).

const CONTENT = new URL("../../../data/content/", import.meta.url);

function load(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, CONTENT), "utf8"));
}

const stage = StageSchema.parse(load("stages/demo-stage.json"));

function enemySetup(id: string): EnemySetup {
  const enemy: Enemy = EnemySchema.parse(load(`enemies/${id}.json`));
  const { drops, ...rest } = enemy;
  return drops.bcResistance === undefined ? rest : { ...rest, bcResistance: drops.bcResistance };
}

function omni(id: string): SquadMemberSetup {
  const unit: Unit = UnitSchema.parse(load(`units/${id}.json`));
  const form = unit.forms.find((f) => f.id === `${id}-omni`);
  if (!form) throw new Error(`${id}-omni form missing`);
  return { unit, formId: form.id, stats: form.stats.max };
}

function demoSetup(): BattleSetup {
  return {
    squad: ["brand", "maren", "garrick", "rook", "solen"].map(omni),
    leaderIndex: 0,
    ally: { ...omni("morrick"), kind: "guest" },
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

function playOut(start: BattleState, maxTurns = 40): { state: BattleState; log: BattleEvent[] } {
  let state = start;
  const log: BattleEvent[] = [];
  for (let i = 0; i < maxTurns && state.result === undefined; i++) {
    const turn = playTurn(state, autoInputs(state));
    log.push(...turn.events);
    state = turn.state;
  }
  return { state, log };
}

describe("demo stage (M2-05A)", () => {
  it("has two trash waves and a boss wave", () => {
    expect(stage.waves.map((wave) => wave.enemies.map((slot) => slot.enemy))).toEqual([
      ["demo-thornling", "demo-thornling", "demo-rillwisp"],
      ["demo-rillwisp", "demo-thornling", "demo-rillwisp"],
      ["demo-ashen-warden"],
    ]);
  });

  it.each([1, 7, 2024])("the B0 starters at Omni clear it headlessly (seed %i)", (seed) => {
    const { state, log } = playOut(createBattle(demoSetup(), seed));

    expect(state.result).toBe("win");
    expect(state.waveIndex).toBe(2);
    expect(log.filter((e) => e.type === "WaveCleared").map((e) => e.wave)).toEqual([0, 1]);
    // The boss enters its phase: Kindled Wrath fires once, below half HP.
    const wrath = log.filter((e) => e.type === "EnemyActionStarted" && e.skill === "kindled-wrath");
    expect(wrath).toHaveLength(1);
    // The enemies fought back, and the battle took several turns.
    expect(log.some((e) => e.type === "EnemyHitLanded")).toBe(true);
    expect(state.turn).toBeGreaterThan(4);
  });
});
