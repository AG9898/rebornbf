import type { EnemySkill, Item } from "@bfr/data";
import { describe, expect, it } from "vitest";
import type { ActiveEffect } from "./effects/buffs.ts";
import type { BattleEvent } from "./events.ts";
import { BattleSetupError, createBattle } from "./state/create-battle.ts";
import type {
  BattleSetup,
  BattleState,
  EnemySetup,
  ReserveSquadSetup,
  ResolvedStatsMember,
} from "./state/types.ts";
import { step } from "./step.ts";
import { makeEnemy, makeMember, makeUnit } from "./test/factories.ts";
import { endTurn } from "./turn.ts";

// Three-squad trials (M6-01I; GAME_DESIGN §7 → Trials flow and three squads, RESOLVED-95/97):
// a wiped party is replaced by the next reserve squad at full HP with empty BB gauges, the enemies
// and items carry over, the turn rolls over, and the battle is lost when the last squad falls.

/** One-shots any test unit (4,000 HP) with its single-hit normal attack. */
const BRUTE: EnemySetup = {
  ...makeEnemy("brute"),
  stats: { hp: 100000, atk: 60000, def: 500, rec: 100 },
};

const VIGIL: EnemySkill = {
  id: "vigil",
  name: "Vigil",
  attacks: [],
  effects: [{ id: "heal.over_time", value: 800, turns: 2, target: "self" }],
};

/** A harmless enemy whose script uses Vigil on its own turn 1 only, then normal-attacks. */
const HERMIT: EnemySetup = {
  ...makeEnemy("hermit"),
  stats: { hp: 100000, atk: 1, def: 500, rec: 100 },
  skills: [VIGIL],
  ai: [
    { when: "on_turn", turn: 1, skill: "vigil", target: "random" },
    { when: "default", skill: "normal", target: "random" },
  ],
};

const HEAL: Item = {
  id: "test-heal",
  name: "Test Heal",
  target: "single",
  effects: [{ kind: "heal", amount: 1000 }],
};

/** A leader whose leader skill raises party max HP by 50%. */
const CAPTAIN: ResolvedStatsMember = {
  ...makeMember("captain"),
  unit: (() => {
    const base = makeUnit("captain");
    const [form] = base.forms;
    if (!form) throw new Error("no form");
    return {
      ...base,
      forms: [
        {
          ...form,
          leaderSkill: {
            name: "Captain Lead",
            effects: [{ id: "passive.stat_pct", stat: "hp", value: 0.5, target: "party" }],
          },
        },
      ],
    };
  })(),
};

function reserve(id: string): ReserveSquadSetup {
  return { squad: [makeMember(id)], leaderIndex: 0 };
}

function trialSetup(overrides: Partial<BattleSetup> = {}): BattleSetup {
  return {
    squad: [makeMember("first")],
    leaderIndex: 0,
    waves: [[BRUTE]],
    trial: true,
    reserveSquads: [reserve("second"), reserve("third")],
    ...overrides,
  };
}

function types(events: readonly BattleEvent[]): string[] {
  return events.map((event) => event.type);
}

function ofType<T extends BattleEvent["type"]>(
  events: readonly BattleEvent[],
  type: T,
): Extract<BattleEvent, { type: T }>[] {
  return events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);
}

/** Ends `turns` turns with no player actions; returns the final state and the joined log. */
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

describe("three-squad battles (M6-01I)", () => {
  it("snapshots reserve squads at setup; single-squad setups carry no squad fields", () => {
    const start = createBattle(trialSetup(), 3);
    expect(start.squadIndex).toBe(0);
    expect(start.reserveSquads?.map((s) => s.party.map((u) => u.unitId))).toEqual([
      ["second"],
      ["third"],
    ]);
    const single = createBattle({ ...trialSetup(), reserveSquads: undefined }, 3);
    expect("squadIndex" in single).toBe(false);
    expect("reserveSquads" in single).toBe(false);
  });

  it("rejects more than two reserve squads and names a bad reserve's path", () => {
    expect(() =>
      createBattle(trialSetup({ reserveSquads: [reserve("a"), reserve("b"), reserve("c")] }), 1),
    ).toThrow(BattleSetupError);
    expect(() =>
      createBattle(trialSetup({ reserveSquads: [{ squad: [], leaderIndex: 0 }] }), 1),
    ).toThrow(/reserveSquads\[0\]\.squad/);
    expect(() =>
      createBattle(trialSetup({ reserveSquads: [{ ...reserve("a"), leaderIndex: 2 }] }), 1),
    ).toThrow(/reserveSquads\[0\]\.leaderIndex/);
  });

  it("swaps in the next squad on a wipe at full HP with empty gauges; enemies keep their state", () => {
    const start = createBattle(trialSetup(), 5);
    const enemyBuff: ActiveEffect = {
      id: "buff.atk",
      value: 0.5,
      turns: 3,
      target: "self",
      source: "bb",
    };
    const primed: BattleState = {
      ...start,
      party: start.party.map((u) => ({ ...u, bc: 15 })),
      enemies: start.enemies.map((e) => ({ ...e, hp: 42000, effects: [enemyBuff] })),
    };
    const { state, events } = endTurn(primed);

    const log = types(events);
    expect(log).not.toContain("BattleEnded");
    expect(log.indexOf("UnitDefeated")).toBeLessThan(log.indexOf("SquadEntered"));
    expect(log.indexOf("SquadEntered")).toBeLessThan(log.indexOf("TurnStarted"));
    expect(ofType(events, "SquadEntered")).toEqual([
      { type: "SquadEntered", tick: state.tick, squad: 1, turn: 2 },
    ]);
    expect(state.result).toBeUndefined();
    expect(state.turn).toBe(2);
    expect(state.squadIndex).toBe(1);
    expect(state.reserveSquads?.map((s) => s.party[0]?.unitId)).toEqual(["third"]);
    expect(state.party.map((u) => [u.slot, u.unitId, u.hp, u.stats.hp, u.bc])).toEqual([
      ["p0", "second", 4000, 4000, 0],
    ]);
    // The enemy keeps its HP and its buff (ticked once by the end-of-turn tick).
    expect(state.enemies[0]?.hp).toBe(42000);
    expect(state.enemies[0]?.effects).toEqual([{ ...enemyBuff, turns: 2 }]);
    // The OD gauge carries over: the end-of-turn +500 of the wiping turn stays.
    expect(state.od.points).toBe(500);
  });

  it("continues the enemy script at the next turn, never repeating the wiping turn", () => {
    const start = createBattle(trialSetup({ waves: [[BRUTE, HERMIT]] }), 9);
    // Turn 1: the brute (e0) wipes squad 1 before the hermit (e1) acts, so the hermit loses its
    // turn-1 Vigil; both enemies' script counts stand at 1.
    const first = endTurn(start);
    const acted = ofType(first.events, "EnemyActionStarted");
    expect(acted.map((e) => [e.actor, e.enemyTurn])).toEqual([["e0", 1]]);
    expect(first.state.enemies.map((e) => e.turnsTaken)).toEqual([1, 1]);

    // Turn 2 with the brute out of the way: the hermit runs its turn-2 script (normal), not Vigil.
    const calm: BattleState = {
      ...first.state,
      enemies: first.state.enemies.map((e) => (e.slot === "e0" ? { ...e, hp: 0 } : e)),
    };
    const second = endTurn(calm);
    expect(
      ofType(second.events, "EnemyActionStarted").map((e) => [e.actor, e.enemyTurn, e.skill]),
    ).toEqual([["e1", 2, "normal"]]);
    expect(second.state.turn).toBe(3);
  });

  it("carries the item loadout over unchanged (no refill)", () => {
    const created = createBattle(trialSetup({ items: [{ item: HEAL, count: 2 }] }), 4);
    const start = { ...created, party: created.party.map((u) => ({ ...u, hp: 1000 })) };
    const used = step(start, [{ type: "item", tick: start.tick, actor: "p0", item: "test-heal" }]);
    expect(used.state.items.map((s) => s.count)).toEqual([1]);
    const { state, events } = endTurn(used.state);
    expect(types(events)).toContain("SquadEntered");
    expect(state.items).toEqual(used.state.items);
  });

  it("loses only after the third squad falls", () => {
    const { state, log } = idle(createBattle(trialSetup(), 2), 3);
    expect(ofType(log, "SquadEntered").map((e) => [e.squad, e.turn])).toEqual([
      [1, 2],
      [2, 3],
    ]);
    const ended = ofType(log, "BattleEnded");
    expect(ended).toEqual([{ type: "BattleEnded", tick: state.tick, result: "lose", turn: 3 }]);
    expect(log[log.length - 1]?.type).toBe("BattleEnded");
    expect(state.result).toBe("lose");
    expect(state.squadIndex).toBe(2);
    expect(state.reserveSquads).toEqual([]);
    expect(state.party[0]?.unitId).toBe("third");
  });

  it("a single-squad setup still loses on its first wipe", () => {
    const { state, log } = idle(createBattle(trialSetup({ reserveSquads: [] }), 2), 1);
    expect(types(log)).not.toContain("SquadEntered");
    expect(state.result).toBe("lose");
  });

  it("switches leader skills with the squad, including battle-start max HP", () => {
    const start = createBattle(
      trialSetup({
        reserveSquads: [{ squad: [CAPTAIN, makeMember("mate")], leaderIndex: 0 }],
      }),
      6,
    );
    expect(start.leaderSkills.leader?.name).toBe("Test first Lead");
    // Captain Lead: +50% max HP → 4,000 × 1.5, given at battle start to the waiting squad.
    expect(start.reserveSquads?.[0]?.party.map((u) => u.hp)).toEqual([6000, 6000]);

    const { state } = idle(start, 1);
    expect(state.leaderSkills.leader?.name).toBe("Captain Lead");
    expect(state.party.map((u) => [u.unitId, u.isLeader, u.hp, u.stats.hp])).toEqual([
      ["captain", true, 6000, 6000],
      ["mate", false, 6000, 6000],
    ]);
    const leaderPassives = state.party[1]?.effects.filter((e) => e.source === "leader");
    expect(leaderPassives?.map((e) => [e.id, e.value])).toEqual([["passive.stat_pct", 0.5]]);
  });

  it("is deterministic: same seed and inputs give the same event log", () => {
    const run = () => {
      const setup = trialSetup({ waves: [[BRUTE, HERMIT]], items: [{ item: HEAL, count: 1 }] });
      const created = createBattle(setup, 77);
      const start = { ...created, party: created.party.map((u) => ({ ...u, hp: 1000 })) };
      const used = step(start, [{ type: "item", tick: 0, actor: "p0", item: "test-heal" }]);
      const rest = idle(used.state, 3);
      return { events: [...used.events, ...rest.log], state: rest.state };
    };
    const a = run();
    const b = run();
    expect(a.events).toEqual(b.events);
    expect(a.state).toEqual(b.state);
    expect(ofType(a.events, "SquadEntered")).toHaveLength(2);
  });
});
