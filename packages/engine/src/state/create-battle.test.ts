import { describe, expect, it } from "vitest";
import { nextUint32 } from "../rng.ts";
import { makeEnemy, makeMember, makeSetup, makeUnit } from "../test/factories.ts";
import { BattleSetupError, createBattle } from "./create-battle.ts";

describe("createBattle", () => {
  it("builds a full squad, ally, leader skills, and the first wave", () => {
    const setup = {
      ...makeSetup(5),
      leaderIndex: 2,
      ally: { ...makeMember("guest"), kind: "guest" as const },
    };
    const state = createBattle(setup, 42);

    expect(state.party.map((u) => u.slot)).toEqual(["p0", "p1", "p2", "p3", "p4", "ally"]);
    expect(state.party.filter((u) => u.isLeader).map((u) => u.slot)).toEqual(["p2"]);
    expect(state.party[5]?.allyKind).toBe("guest");
    expect(state.party[0]?.allyKind).toBeUndefined();
    expect(state.party.every((u) => u.hp === u.stats.hp && u.bc === 0)).toBe(true);
    expect(state.leaderSkills.leader?.name).toBe("Test unit-2 Lead");
    expect(state.leaderSkills.ally?.name).toBe("Test guest Lead");
    expect(state).toMatchObject({ seed: 42, tick: 0, turn: 1, phase: "player", waveIndex: 0 });
    expect(state.waves).toHaveLength(2);
    expect(state.enemies.map((e) => [e.slot, e.enemyId, e.hp])).toEqual([
      ["e0", "slime", 10000],
      ["e1", "slime", 10000],
    ]);
  });

  it("accepts a duplicate ally and a squad smaller than 5", () => {
    const setup = {
      ...makeSetup(3),
      ally: { ...makeMember("unit-0"), kind: "duplicate" as const },
    };
    const state = createBattle(setup, 1);
    expect(state.party.map((u) => u.slot)).toEqual(["p0", "p1", "p2", "ally"]);
    expect(state.party[3]?.allyKind).toBe("duplicate");
  });

  it("omits leader skills the leader or ally does not have", () => {
    const bare = makeUnit("bare");
    const form = bare.forms[0];
    if (!form) throw new Error("factory unit has a form");
    const { leaderSkill: _omit, ...noLead } = form;
    const member = { ...makeMember("bare"), unit: { ...bare, forms: [noLead] } };
    const state = createBattle({ ...makeSetup(1), squad: [member] }, 1);
    expect(state.leaderSkills).toEqual({});
  });

  it("rejects squads with more than 5 units plus one ally", () => {
    const setup = { ...makeSetup(6), ally: { ...makeMember("guest"), kind: "guest" as const } };
    expect(() => createBattle(setup, 1)).toThrow(BattleSetupError);
    expect(() => createBattle(makeSetup(6), 1)).toThrow(/squad: must have 1–5 units/);
    expect(() => createBattle(makeSetup(0), 1)).toThrow(/squad: must have 1–5 units/);
  });

  it.each([
    [{ leaderIndex: 5 }, /leaderIndex: 5/],
    [{ leaderIndex: -1 }, /leaderIndex: -1/],
    [{ waves: [] }, /waves: a battle needs at least one wave/],
    [{ waves: [[makeEnemy("a")], []] }, /waves\[1\]: a wave needs at least one enemy/],
    [
      { waves: [[{ ...makeEnemy("a"), stats: { hp: 0, atk: 1, def: 1, rec: 1 } }]] },
      /waves\[0\]\[0\]\.stats/,
    ],
  ])("rejects invalid setup %#", (patch, message) => {
    expect(() => createBattle({ ...makeSetup(5), ...patch }, 1)).toThrow(message);
  });

  it("rejects unknown forms and invalid unit content", () => {
    const badForm = makeSetup(2);
    const wrongForm = { ...makeMember("unit-1"), formId: "nope" };
    expect(() => createBattle({ ...badForm, squad: [makeMember("unit-0"), wrongForm] }, 1)).toThrow(
      /squad\[1\]\.formId: unit "unit-1" has no form "nope"/,
    );

    const unit = makeUnit("bad");
    const bad = JSON.parse(JSON.stringify(unit).replace('"buff.atk"', '"buff.speed"'));
    const member = { ...makeMember("bad"), unit: bad };
    expect(() => createBattle({ ...makeSetup(1), squad: [member] }, 1)).toThrow(
      /squad\[0\]\.unit: forms\.0\.bursts\.bb\.effects\.0\.id/,
    );
  });

  it("is deterministic and JSON-serializable", () => {
    const a = createBattle(makeSetup(5), 7);
    const b = createBattle(makeSetup(5), 7);
    expect(a).toEqual(b);
    const restored = JSON.parse(JSON.stringify(a));
    expect(restored).toEqual(a);
    expect(nextUint32(restored.rng).value).toBe(nextUint32(a.rng).value);
    expect(createBattle(makeSetup(5), 8).rng).not.toEqual(a.rng);
  });
});
