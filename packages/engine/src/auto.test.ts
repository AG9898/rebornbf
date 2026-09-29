import { readFileSync } from "node:fs";
import { type Enemy, EnemySchema, StageSchema, type Unit, UnitSchema } from "@bfr/data";
import { describe, expect, it } from "vitest";
import { autoBurstTier, autoInputs } from "./auto.ts";
import type { ActiveEffect } from "./effects/buffs.ts";
import type { BattleEvent } from "./events.ts";
import { burstThreshold } from "./gauge/index.ts";
import { createBattle } from "./state/create-battle.ts";
import type {
  BattleSetup,
  BattleState,
  BattleUnit,
  EnemySetup,
  SquadMemberSetup,
} from "./state/types.ts";
import { step } from "./step.ts";
import type { BattleInput } from "./timeline/types.ts";
import { playTurn } from "./turn.ts";

// Auto-battle input generation (M1-08A): squad order, highest available burst tier.

const CONTENT = new URL("../../data/content/", import.meta.url);

function load(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, CONTENT), "utf8"));
}

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
  const stage = StageSchema.parse(load("stages/demo-stage.json"));
  return {
    squad: ["brand", "maren", "garrick", "rook", "solen"].map(omni),
    leaderIndex: 0,
    ally: { ...omni("morrick"), kind: "guest" },
    waves: stage.waves.map((wave) => wave.enemies.map((slot) => enemySetup(slot.enemy))),
  };
}

function patch(state: BattleState, slot: string, change: Partial<BattleUnit>): BattleState {
  return { ...state, party: state.party.map((u) => (u.slot === slot ? { ...u, ...change } : u)) };
}

function unitAt(state: BattleState, slot: string): BattleUnit {
  const unit = state.party.find((u) => u.slot === slot);
  if (!unit) throw new Error(`no unit in ${slot}`);
  return unit;
}

function threshold(unit: BattleUnit, tier: "bb" | "sbb" | "ubb"): number {
  const value = burstThreshold(unit.form, tier);
  if (value === undefined) throw new Error(`${unit.slot} has no ${tier}`);
  return value;
}

function ailment(kind: "curse" | "paralysis"): ActiveEffect {
  return { id: `ailment.inflict.${kind}`, value: 100, turns: 3, target: "party", source: "bb" };
}

/** Plays auto turns to the end, recording each turn's inputs. */
function autoPlay(start: BattleState, maxTurns = 40) {
  let state = start;
  const log: BattleEvent[] = [];
  const turns: BattleInput[][] = [];
  for (let i = 0; i < maxTurns && state.result === undefined; i++) {
    const inputs = autoInputs(state);
    turns.push(inputs);
    const turn = playTurn(state, inputs);
    log.push(...turn.events);
    state = turn.state;
  }
  return { state, log, turns };
}

describe("autoInputs (M1-08A)", () => {
  it("gives every living unit an action in squad order, ally last, at the current tick", () => {
    const state = createBattle(demoSetup(), 1);
    const inputs = autoInputs(state);
    expect(inputs.map((i) => i.actor)).toEqual(["p0", "p1", "p2", "p3", "p4", "ally"]);
    expect(inputs.every((i) => i.type === "attack" && i.tick === state.tick)).toBe(true);
  });

  it("uses the highest charged tier: UBB in Overdrive Mode, then SBB, then BB", () => {
    const start = createBattle(demoSetup(), 1);
    const p0 = unitAt(start, "p0");
    const full = threshold(p0, "sbb");
    expect(autoBurstTier({ ...p0, bc: threshold(p0, "bb") })).toBe("bb");
    expect(autoBurstTier({ ...p0, bc: full })).toBe("sbb");
    expect(autoBurstTier({ ...p0, bc: full, overdrive: true })).toBe(
      full >= threshold(p0, "ubb") ? "ubb" : "sbb",
    );
    expect(autoBurstTier({ ...p0, bc: threshold(p0, "ubb"), overdrive: true })).toBe("ubb");
    expect(autoBurstTier({ ...p0, bc: threshold(p0, "bb") - 1 })).toBeUndefined();
  });

  it("attacks instead of bursting when Cursed, and skips paralyzed, dead, and acted units", () => {
    let state = createBattle(demoSetup(), 1);
    const full = threshold(unitAt(state, "p0"), "sbb");
    state = patch(state, "p0", { bc: full, effects: [ailment("curse")] });
    state = patch(state, "p1", { effects: [ailment("paralysis")] });
    state = patch(state, "p2", { hp: 0 });
    state = { ...state, acted: ["p3"] };
    expect(autoInputs(state)).toEqual([
      { type: "attack", tick: state.tick, actor: "p0" },
      { type: "attack", tick: state.tick, actor: "p4" },
      { type: "attack", tick: state.tick, actor: "ally" },
    ]);
  });

  it("passes the selected target and returns nothing once the battle is over", () => {
    const state = createBattle(demoSetup(), 1);
    expect(
      autoInputs(state, { target: "e1" }).every((i) => "target" in i && i.target === "e1"),
    ).toBe(true);
    expect(autoInputs({ ...state, result: "win" })).toEqual([]);
  });

  it("finishes the demo stage headlessly, and no auto input is rejected", () => {
    const { state, log } = autoPlay(createBattle(demoSetup(), 7));
    expect(state.result).toBe("win");
    expect(log.some((e) => e.type === "BurstUsed")).toBe(true);
    expect(log.filter((e) => e.type === "ActionRejected")).toEqual([]);
  });

  it("auto inputs replay identically from the seed", () => {
    const seed = 2024;
    const live = autoPlay(createBattle(demoSetup(), seed));
    let state = createBattle(demoSetup(), seed);
    const replay: BattleEvent[] = [];
    for (const inputs of live.turns) {
      const turn = playTurn(state, inputs);
      replay.push(...turn.events);
      state = turn.state;
    }
    expect(replay).toEqual(live.log);
    expect(state).toEqual(live.state);
  });

  it("covers only units that have not acted mid-phase", () => {
    const start = createBattle(demoSetup(), 3);
    const first = step(start, [{ type: "attack", tick: start.tick, actor: "p0" }]);
    expect(autoInputs(first.state).map((i) => i.actor)).toEqual(["p1", "p2", "p3", "p4", "ally"]);
  });
});
