import { describe, expect, it } from "vitest";
import { applyEffect } from "./effects/index.ts";
import type { BattleEvent } from "./events.ts";
import { BattleSetupError, createBattle } from "./state/create-battle.ts";
import type { BattleSetup, BattleState, EnemySetup } from "./state/types.ts";
import { makeEnemy, makeSetup } from "./test/factories.ts";
import type { BattleInput } from "./timeline/types.ts";
import { endTurn, playTurn } from "./turn.ts";

// Turn-triggered form changes (M6-01B_1, GAME_DESIGN §2 → Form changes): after N turns in a wave
// its one enemy changes into the next wave's enemy through the wave transition, keeping its HP
// fraction, and the party is treated exactly as on a wave change.

const FORM_A: EnemySetup = { ...makeEnemy("elder-dark"), element: "dark" };
const FORM_B: EnemySetup = {
  ...makeEnemy("elder-light"),
  element: "light",
  stats: { hp: 30000, atk: 700, def: 500, rec: 100 },
};

function formSetup(afterTurns = 3): BattleSetup {
  return {
    ...makeSetup(5),
    waves: [[FORM_A], [FORM_B]],
    formChanges: [{ wave: 0, afterTurns }],
  };
}

function types(events: readonly BattleEvent[]): string[] {
  return events.map((event) => event.type);
}

function setEnemyHp(state: BattleState, hp: number): BattleState {
  return { ...state, enemies: state.enemies.map((enemy) => ({ ...enemy, hp })) };
}

/** Ends `turns` turns with no player actions (the enemy phase still runs). */
function idle(state: BattleState, turns: number): { state: BattleState; log: BattleEvent[] } {
  let current = state;
  const log: BattleEvent[] = [];
  for (let i = 0; i < turns; i++) {
    const result = endTurn(current);
    log.push(...result.events);
    current = result.state;
  }
  return { state: current, log };
}

describe("turn-triggered form changes (M6-01B_1)", () => {
  it("changes form at the stated turn's endTurn without a kill, keeping the HP fraction", () => {
    const start = createBattle(formSetup(3), 11);
    const early = idle(start, 2);
    expect(types(early.log)).not.toContain("FormChanged");
    expect(early.state.waveIndex).toBe(0);

    // 30% of 10,000 HP left → 30% of the new form's 30,000.
    const third = endTurn(setEnemyHp(early.state, 3000));
    const log = types(third.events);
    expect(log).toContain("FormChanged");
    expect(log).not.toContain("WaveCleared");
    expect(log.indexOf("FormChanged")).toBeLessThan(log.indexOf("WaveStarted"));
    expect(third.events.find((e) => e.type === "FormChanged")).toMatchObject({ wave: 0 });
    expect(third.events.find((e) => e.type === "WaveStarted")).toMatchObject({
      wave: 1,
      enemyHp: [9000],
    });
    expect(third.state.waveIndex).toBe(1);
    expect(third.state.waveStartTurn).toBe(4);
    expect(third.state.enemies[0]).toMatchObject({
      enemyId: "elder-light",
      element: "light",
      hp: 9000,
      effects: [],
      turnsTaken: 0,
    });
  });

  it("rounds the carried HP down but never below 1", () => {
    const start = idle(createBattle(formSetup(1), 4), 0).state;
    const odd = endTurn(setEnemyHp(start, 3333)).state;
    expect(odd.enemies[0]?.hp).toBe(Math.floor((3333 * 30000) / 10000));
    const tiny = endTurn(setEnemyHp(start, 0.1)).state;
    expect(tiny.enemies[0]?.hp).toBe(1);
  });

  it("advances as a normal wave clear at full HP when the form is defeated first", () => {
    const start = createBattle(formSetup(3), 11);
    const killed = endTurn(setEnemyHp(start, 0));
    expect(types(killed.events)).toContain("WaveCleared");
    expect(types(killed.events)).not.toContain("FormChanged");
    const started = killed.events.find((e) => e.type === "WaveStarted");
    expect(started).toEqual({ type: "WaveStarted", tick: killed.state.tick, wave: 1 });
    expect(killed.state.enemies[0]?.hp).toBe(30000);
    // The next form's wave has no form change of its own.
    expect(types(idle(killed.state, 4).log)).not.toContain("FormChanged");
  });

  it("treats the party exactly as a wave change does: nothing about it changes", () => {
    const base = createBattle(formSetup(1), 21);
    const buffed: BattleState = {
      ...base,
      party: base.party.map((unit) => ({
        ...unit,
        bc: 7,
        effects: applyEffect(
          unit.effects,
          { id: "buff.atk", value: 0.5, turns: 3, target: "party" },
          "bb",
        ),
      })),
    };
    const changed = endTurn(buffed);
    const unchanged = endTurn({ ...buffed, formChanges: [] });
    expect(types(changed.events)).toContain("FormChanged");
    expect(changed.state.party).toEqual(unchanged.state.party);
    expect(changed.state.od).toEqual(unchanged.state.od);
    expect(changed.state.items).toEqual(unchanged.state.items);
    expect(changed.state.rng).toEqual(unchanged.state.rng);
    expect(changed.state.turn).toBe(unchanged.state.turn);

    // A form defeated on its change turn takes the ordinary wave-clear path, form change or not.
    const cleared = endTurn(setEnemyHp({ ...buffed, formChanges: [] }, 0));
    const clearedChange = endTurn(setEnemyHp(buffed, 0));
    expect(clearedChange.state.party).toEqual(cleared.state.party);
  });

  it("replays deterministically through the form change", () => {
    const attackAll = (state: BattleState): BattleInput[] =>
      state.party
        .filter((unit) => unit.hp > 0)
        .map((unit) => ({ type: "attack", tick: state.tick, actor: unit.slot }));
    const run = () => {
      const tough = { ...FORM_A, stats: { ...FORM_A.stats, hp: 200000 } };
      let state = createBattle({ ...formSetup(2), waves: [[tough], [FORM_B]] }, 99);
      const log: BattleEvent[] = [];
      for (let i = 0; i < 4 && state.result === undefined; i++) {
        const turn = playTurn(state, attackAll(state));
        log.push(...turn.events);
        state = turn.state;
      }
      return { state, log };
    };
    const first = run();
    expect(types(first.log)).toContain("FormChanged");
    expect(run()).toEqual(first);
  });

  it("rejects malformed form changes", () => {
    const bad =
      (formChanges: BattleSetup["formChanges"], waves = formSetup().waves) =>
      () =>
        createBattle({ ...formSetup(), waves, formChanges }, 1);
    expect(bad([{ wave: 1, afterTurns: 3 }])).toThrow(BattleSetupError);
    expect(bad([{ wave: 0, afterTurns: 0 }])).toThrow(/afterTurns/);
    expect(
      bad([
        { wave: 0, afterTurns: 2 },
        { wave: 0, afterTurns: 3 },
      ]),
    ).toThrow(/already/);
    expect(bad([{ wave: 0, afterTurns: 2 }], [[FORM_A, FORM_A], [FORM_B]])).toThrow(/one enemy/);
    expect(createBattle(makeSetup(1), 1).formChanges).toEqual([]);
  });
});
