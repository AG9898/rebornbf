import type { Effect } from "@bfr/data";
import { describe, expect, it } from "vitest";
import { gaugeMax } from "../drops/roll.ts";
import type { ActiveEffect } from "../effects/buffs.ts";
import { applyEffect } from "../effects/index.ts";
import type { BattleEvent } from "../events.ts";
import { BattleSetupError, createBattle } from "../state/create-battle.ts";
import type { BattleSetup, BattleState } from "../state/types.ts";
import { step } from "../step.ts";
import { makeEnemy, makeMember } from "../test/factories.ts";
import type { BattleInput } from "../timeline/types.ts";
import { endTurn, playTurn } from "../turn.ts";
import { continueBattle, continueRefusal } from "./continue.ts";

/** Two units against an enemy that wipes the party in one enemy phase. */
function wipeSetup(trial?: boolean): BattleSetup {
  const titan = { ...makeEnemy("titan"), stats: { hp: 99999, atk: 60000, def: 500, rec: 1 } };
  titan.ai = [{ when: "default", skill: "normal", target: "random" }];
  return {
    squad: [makeMember("a"), makeMember("b")],
    leaderIndex: 0,
    waves: [[titan, titan, titan]],
    ...(trial === undefined ? {} : { trial }),
  };
}

function attacks(state: BattleState): BattleInput[] {
  return state.party
    .filter((unit) => unit.hp > 0)
    .map((unit) => ({ type: "attack", tick: state.tick, actor: unit.slot }));
}

/** Plays turns until the battle ends. */
function playUntilOver(start: BattleState, log: BattleEvent[]): BattleState {
  let state = start;
  for (let i = 0; i < 20 && state.result === undefined; i++) {
    const turn = playTurn(state, attacks(state));
    log.push(...turn.events);
    state = turn.state;
  }
  return state;
}

function wiped(trial?: boolean): BattleState {
  const state = playUntilOver(createBattle(wipeSetup(trial), 11), []);
  expect(state.result).toBe("lose");
  return state;
}

describe("continueBattle", () => {
  it("fully revives the squad and starts a new player phase", () => {
    const lost = wiped();
    const { state, events } = continueBattle(lost);

    expect(state.result).toBeUndefined();
    expect(state.continued).toBe(true);
    expect(state.turn).toBe(lost.turn + 1);
    expect(state.phase).toBe("player");
    expect(state.acted).toEqual([]);
    expect(state.rng).toEqual(lost.rng);
    expect(state.enemies).toEqual(lost.enemies);
    expect(state.od).toEqual(lost.od);
    for (const unit of state.party) {
      expect(unit.hp).toBe(unit.stats.hp);
      expect(unit.bc).toBe(gaugeMax(unit.form));
    }
    expect(events[0]).toEqual({ type: "BattleContinued", tick: lost.tick, turn: state.turn });
    expect(events.filter((e) => e.type === "UnitRevived").map((e) => e.target)).toEqual([
      "p0",
      "p1",
    ]);
    expect(events.filter((e) => e.type === "GaugeFilled")).toEqual(
      state.party.map((unit) =>
        expect.objectContaining({ target: unit.slot, effect: "continue", gauge: unit.bc }),
      ),
    );
    expect(events[events.length - 1]).toEqual({
      type: "TurnStarted",
      tick: lost.tick,
      turn: state.turn,
    });

    // The revived squad can act again.
    const acted = step(state, attacks(state));
    expect(acted.events.some((e) => e.type === "ActionRejected")).toBe(false);
    expect(acted.events.some((e) => e.type === "ActionStarted")).toBe(true);
  });

  it("clears burst buffs and ailments but keeps skill passives", () => {
    const lost = wiped();
    const buff: Effect = { id: "buff.atk", value: 50, turns: 3, target: "self" };
    const poison: Effect = { id: "ailment.inflict.poison", value: 100, turns: 2, target: "self" };
    let effects: ActiveEffect[] = [...(lost.party[0]?.effects ?? [])];
    const passives = effects.length;
    effects = applyEffect(applyEffect(effects, buff, "bb"), poison, "bb");
    const dirty = {
      ...lost,
      party: lost.party.map((u) => (u.slot === "p0" ? { ...u, effects, overdrive: true } : u)),
    };
    const { state, events } = continueBattle(dirty);
    expect(state.party[0]?.effects).toHaveLength(passives);
    expect(state.party[0]?.overdrive).toBe(false);
    expect(events.filter((e) => e.type === "EffectEnded").map((e) => [e.target, e.effect])).toEqual(
      [
        ["p0", "buff.atk"],
        ["p0", "ailment.inflict.poison"],
      ],
    );
    expect(events).toContainEqual({ type: "OverdriveEnded", tick: lost.tick, actor: "p0" });
  });

  it("rejects a second continue in the same battle", () => {
    const again = playUntilOver(continueBattle(wiped()).state, []);
    expect(again.result).toBe("lose");
    expect(continueRefusal(again)).toBe("already_continued");
    const { state, events } = continueBattle(again);
    expect(state).toBe(again);
    expect(events).toEqual([
      { type: "ContinueRejected", tick: again.tick, reason: "already_continued" },
    ]);
  });

  it("rejects continues in trials", () => {
    const lost = wiped(true);
    const { state, events } = continueBattle(lost);
    expect(state).toBe(lost);
    expect(events).toEqual([{ type: "ContinueRejected", tick: lost.tick, reason: "trial" }]);
  });

  it("rejects a continue before a wipe or after a win", () => {
    const start = createBattle(wipeSetup(), 11);
    expect(continueBattle(start).events).toEqual([
      { type: "ContinueRejected", tick: 0, reason: "not_defeated" },
    ]);
    const cleared = { ...start, enemies: start.enemies.map((e) => ({ ...e, hp: 0 })) };
    const won = endTurn(cleared).state;
    expect(won.result).toBe("win");
    expect(continueRefusal(won)).toBe("not_defeated");
  });

  it("replays a battle that includes a continue identically", () => {
    function run(): { state: BattleState; log: BattleEvent[] } {
      const log: BattleEvent[] = [];
      const lost = playUntilOver(createBattle(wipeSetup(), 11), log);
      const resumed = continueBattle(lost);
      log.push(...resumed.events);
      // Serialized mid-battle state resumes the same way.
      const copy = JSON.parse(JSON.stringify(resumed.state)) as BattleState;
      const state = playUntilOver(copy, log);
      return { state, log };
    }
    const live = run();
    const replay = run();
    expect(replay.log).toEqual(live.log);
    expect(replay.state).toEqual(live.state);
    expect(live.log.filter((e) => e.type === "BattleEnded")).toHaveLength(2);
  });

  it("rejects a non-boolean trial flag at setup", () => {
    const setup = { ...wipeSetup(), trial: "yes" } as unknown as BattleSetup;
    expect(() => createBattle(setup, 1)).toThrow(BattleSetupError);
    expect(createBattle(wipeSetup(), 1).trial).toBe(false);
    expect(createBattle(wipeSetup(true), 1).trial).toBe(true);
  });
});
