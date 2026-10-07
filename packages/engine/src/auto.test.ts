import { readFileSync } from "node:fs";
import { type Enemy, EnemySchema, StageSchema, type Unit, UnitSchema } from "@bfr/data";
import { describe, expect, it } from "vitest";
import { autoBurstTier, autoInputs } from "./auto.ts";
import type { ActiveEffect } from "./effects/buffs.ts";
import type { BattleEvent } from "./events.ts";
import { burstThreshold } from "./gauge/index.ts";
import { createBattle } from "./state/create-battle.ts";
import type {
  AutoSettings,
  AutoUnitMode,
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

/**
 * Stat multipliers that lift chapter 1's enemies to an Omni squad's level (its boss to about 1M
 * HP): unscaled, the fight is over before the OD gauge fills, and the advanced-settings test needs a
 * full gauge and a UBB.
 */
const SCALE = { hp: 40, atk: 12, def: 8 };

function enemySetup(id: string): EnemySetup {
  const enemy: Enemy = EnemySchema.parse(load(`enemies/${id}.json`));
  const { drops, ...rest } = enemy;
  const { hp, atk, def } = rest.stats;
  const stats = { ...rest.stats, hp: hp * SCALE.hp, atk: atk * SCALE.atk, def: def * SCALE.def };
  const sturdy = { ...rest, stats };
  return drops.bcResistance === undefined
    ? sturdy
    : { ...sturdy, bcResistance: drops.bcResistance };
}

function omni(id: string): SquadMemberSetup {
  const unit: Unit = UnitSchema.parse(load(`units/${id}.json`));
  const form = unit.forms.find((f) => f.id === `${id}-omni`);
  if (!form) throw new Error(`${id}-omni form missing`);
  return { unit, formId: form.id, stats: form.stats.max };
}

/** Chapter 1's boss stage (story 8) with sturdier enemies, fought by the six B0 starters at Omni. */
function stageSetup(autoSettings?: AutoSettings): BattleSetup {
  const stage = StageSchema.parse(load("stages/story-08-beacon-hollow.json"));
  return {
    squad: ["brand", "maren", "garrick", "rook", "solen"].map(omni),
    leaderIndex: 0,
    ally: { ...omni("morrick"), kind: "guest" },
    waves: stage.waves.map((wave) => wave.enemies.map((slot) => enemySetup(slot.enemy))),
    ...(autoSettings ? { autoSettings } : {}),
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
    const state = createBattle(stageSetup(), 1);
    const inputs = autoInputs(state);
    expect(inputs.map((i) => i.actor)).toEqual(["p0", "p1", "p2", "p3", "p4", "ally"]);
    expect(inputs.every((i) => i.type === "attack" && i.tick === state.tick)).toBe(true);
  });

  it("autoBurstTier reports the highest charged tier: UBB in Overdrive Mode, then SBB, then BB", () => {
    const start = createBattle(stageSetup(), 1);
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
    let state = createBattle(stageSetup(), 1);
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
    const state = createBattle(stageSetup(), 1);
    expect(
      autoInputs(state, { target: "e1" }).every((i) => "target" in i && i.target === "e1"),
    ).toBe(true);
    expect(autoInputs({ ...state, result: "win" })).toEqual([]);
  });

  it("finishes chapter 1's boss stage headlessly, and no auto input is rejected", () => {
    const { state, log } = autoPlay(createBattle(stageSetup(), 7));
    expect(state.result).toBe("win");
    expect(log.some((e) => e.type === "BurstUsed")).toBe(true);
    expect(log.filter((e) => e.type === "ActionRejected")).toEqual([]);
  });

  it("auto inputs replay identically from the seed", () => {
    const seed = 2024;
    const live = autoPlay(createBattle(stageSetup(), seed));
    let state = createBattle(stageSetup(), seed);
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
    const start = createBattle(stageSetup(), 3);
    const first = step(start, [{ type: "attack", tick: start.tick, actor: "p0" }]);
    expect(autoInputs(first.state).map((i) => i.actor)).toEqual(["p1", "p2", "p3", "p4", "ally"]);
  });
});

// Auto Battle Advance Settings (M1-08E): per-unit modes and the three global toggles.

describe("autoInputs advanced settings (M1-08E)", () => {
  /** A battle with `settings`, p0 holding `bc` (and optionally in Overdrive), OD gauge `odFull`. */
  function battle(
    settings: AutoSettings | undefined,
    p0: { bc?: "bb" | "sbb" | "ubb" | "none"; overdrive?: boolean } = {},
    odFull = false,
  ): BattleState {
    let state = createBattle(stageSetup(settings), 1);
    const unit = unitAt(state, "p0");
    const bc = p0.bc === undefined || p0.bc === "none" ? 0 : threshold(unit, p0.bc);
    state = patch(state, "p0", {
      bc,
      ...(p0.overdrive ? { overdrive: true, overdriveTurns: 4 } : {}),
    });
    return odFull ? { ...state, od: { ...state.od, points: state.od.limit } } : state;
  }

  /** p0's inputs (an `overdrive` input, if any, then its action) as `type[:tier]` strings. */
  function p0Plan(state: BattleState): string[] {
    return autoInputs(state)
      .filter((i) => i.actor === "p0")
      .map((i) => (i.type === "burst" ? `burst:${i.tier}` : i.type));
  }

  const mode = (m: AutoUnitMode, rest: AutoSettings = {}) => ({
    ...rest,
    modes: { p0: m },
  });

  it("default Auto: SBB, else BB, else attack; never the UBB, never Overdrive", () => {
    expect(p0Plan(battle(undefined, { bc: "none" }))).toEqual(["attack"]);
    expect(p0Plan(battle(undefined, { bc: "bb" }))).toEqual(["burst:bb"]);
    expect(p0Plan(battle(undefined, { bc: "sbb" }))).toEqual(["burst:sbb"]);
    // In Overdrive Mode with the UBB charged, Auto still does not UBB.
    const od = battle(undefined, { bc: "ubb", overdrive: true }, true);
    expect(p0Plan(od)).not.toContain("burst:ubb");
    expect(autoInputs(od).some((i) => i.type === "overdrive")).toBe(false);
    // An explicit all-default settings object behaves the same.
    expect(autoInputs(battle({}, { bc: "sbb" }, true))).toEqual(
      autoInputs(battle(undefined, { bc: "sbb" }, true)),
    );
  });

  it("Guard mode always guards and Attack mode always normal attacks", () => {
    expect(p0Plan(battle(mode("guard"), { bc: "sbb" }))).toEqual(["guard"]);
    expect(p0Plan(battle(mode("attack"), { bc: "sbb" }))).toEqual(["attack"]);
    expect(p0Plan(battle(mode("attack", { odUbbPriority: true }), { bc: "ubb" }, true))).toEqual([
      "attack",
    ]);
  });

  it("BB mode: BB/SBB, or only BB with Forced BB Priority", () => {
    expect(p0Plan(battle(mode("bb"), { bc: "bb" }))).toEqual(["burst:bb"]);
    expect(p0Plan(battle(mode("bb"), { bc: "sbb" }))).toEqual(["burst:sbb"]);
    const forced = mode("bb", { forcedBbPriority: true });
    expect(p0Plan(battle(forced, { bc: "sbb" }))).toEqual(["burst:bb"]);
    expect(p0Plan(battle(forced, { bc: "none" }))).toEqual(["attack"]);
  });

  it("SBB mode: BB/SBB, or only SBB with Forced BB Priority", () => {
    expect(p0Plan(battle(mode("sbb"), { bc: "bb" }))).toEqual(["burst:bb"]);
    expect(p0Plan(battle(mode("sbb"), { bc: "sbb" }))).toEqual(["burst:sbb"]);
    const forced = mode("sbb", { forcedBbPriority: true });
    expect(p0Plan(battle(forced, { bc: "bb" }))).toEqual(["attack"]);
    expect(p0Plan(battle(forced, { bc: "sbb" }))).toEqual(["burst:sbb"]);
  });

  it("UBB mode: BB/SBB without Forced BB Priority; with it, attack until OD, then Overdrive and UBB", () => {
    expect(p0Plan(battle(mode("ubb"), { bc: "sbb" }, true))).toEqual(["burst:sbb"]);
    const forced = mode("ubb", { forcedBbPriority: true });
    // OD gauge not full: normal attacks, even with the gauge charged.
    expect(p0Plan(battle(forced, { bc: "sbb" }))).toEqual(["attack"]);
    // OD gauge full: Overdrive, then UBB once charged (attack while it is not).
    expect(p0Plan(battle(forced, { bc: "ubb" }, true))).toEqual(["overdrive", "burst:ubb"]);
    expect(p0Plan(battle(forced, { bc: "none" }, true))).toEqual(["overdrive", "attack"]);
    // Already in Overdrive Mode: UBB when charged.
    expect(p0Plan(battle(forced, { bc: "ubb", overdrive: true }))).toEqual(["burst:ubb"]);
  });

  it("SBB Priority: Auto units wait for the SBB; a unit without an SBB still uses its BB", () => {
    const settings: AutoSettings = { sbbPriority: true };
    expect(p0Plan(battle(settings, { bc: "bb" }))).toEqual(["attack"]);
    expect(p0Plan(battle(settings, { bc: "sbb" }))).toEqual(["burst:sbb"]);
    let state = battle(settings, { bc: "bb" });
    const p0 = unitAt(state, "p0");
    const { sbb: _sbb, ubb: _ubb, ...bbOnly } = p0.form.bursts;
    state = patch(state, "p0", { form: { ...p0.form, bursts: bbOnly } });
    expect(p0Plan(state)).toEqual(["burst:bb"]);
    // Other modes ignore it.
    expect(p0Plan(battle(mode("bb", settings), { bc: "bb" }))).toEqual(["burst:bb"]);
  });

  it("OD & UBB Priority: the first UBB-capable Auto unit to act on a full OD gauge Overdrives and UBBs", () => {
    const settings: AutoSettings = { odUbbPriority: true };
    expect(p0Plan(battle(settings, { bc: "ubb" }, true))).toEqual(["overdrive", "burst:ubb"]);
    const inputs = autoInputs(battle(settings, { bc: "ubb" }, true));
    expect(inputs.filter((i) => i.type === "overdrive")).toHaveLength(1);
    // Not full: ordinary Auto.
    expect(p0Plan(battle(settings, { bc: "sbb" }))).toEqual(["burst:sbb"]);
    // Already in Overdrive Mode: UBB when charged.
    expect(p0Plan(battle(settings, { bc: "ubb", overdrive: true }))).toEqual(["burst:ubb"]);
    // A unit with no UBB is passed over; the next UBB-capable unit takes the gauge.
    let state = battle(settings, { bc: "sbb" }, true);
    const p0 = unitAt(state, "p0");
    const { ubb: _ubb, ...noUbb } = p0.form.bursts;
    state = patch(state, "p0", { form: { ...p0.form, bursts: noUbb } });
    const next = autoInputs(state);
    expect(next.find((i) => i.type === "overdrive")?.actor).toBe("p1");
    expect(p0Plan(state)).toEqual(["burst:sbb"]);
    // A guard-mode unit never takes the gauge.
    const guarded = autoInputs(
      battle({ ...settings, modes: { p0: "guard" } }, { bc: "ubb" }, true),
    );
    expect(guarded.find((i) => i.type === "overdrive")?.actor).toBe("p1");
  });

  it("createBattle validates the settings and stores them only when given", () => {
    expect(createBattle(stageSetup(), 1).autoSettings).toBeUndefined();
    const settings: AutoSettings = { modes: { p0: "guard", ally: "ubb" }, sbbPriority: true };
    expect(createBattle(stageSetup(settings), 1).autoSettings).toEqual(settings);
    const bad = (s: unknown) => () => createBattle(stageSetup(s as AutoSettings), 1);
    expect(bad({ modes: { p0: "heal" } })).toThrow(/unknown mode/);
    expect(bad({ modes: { p9: "bb" } })).toThrow(/no party unit/);
    expect(bad({ forcedBbPriority: "yes" })).toThrow(/must be a boolean/);
  });

  it("battles with settings run without rejected inputs and replay identically from the seed", () => {
    const settings: AutoSettings = {
      modes: { p1: "sbb", p2: "ubb", p3: "bb", ally: "guard" },
      forcedBbPriority: true,
      odUbbPriority: true,
    };
    const seed = 99;
    const live = autoPlay(createBattle(stageSetup(settings), seed));
    expect(live.log.filter((e) => e.type === "ActionRejected")).toEqual([]);
    expect(live.turns.flat().some((i) => i.actor === "ally" && i.type === "guard")).toBe(true);
    // p0 (Auto, OD & UBB Priority) takes the first full OD gauge and lands its UBB.
    expect(live.log.some((e) => e.type === "OverdriveActivated" && e.actor === "p0")).toBe(true);
    expect(live.log.some((e) => e.type === "BurstUsed" && e.tier === "ubb")).toBe(true);
    let state = createBattle(stageSetup(settings), seed);
    const replay: BattleEvent[] = [];
    for (const inputs of live.turns) {
      const turn = playTurn(state, inputs);
      replay.push(...turn.events);
      state = turn.state;
    }
    expect(replay).toEqual(live.log);
    expect(state).toEqual(live.state);
  });
});
