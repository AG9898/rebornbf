import { readFileSync } from "node:fs";
import { type Form, type Unit, UnitSchema } from "@bfr/data";
import { describe, expect, it } from "vitest";
import { makeEnemy } from "../test/factories.ts";
import { BattleSetupError, createBattle } from "./create-battle.ts";
import type { BattleSetup, SquadMemberSetup } from "./types.ts";
import {
  formStatsAtLevel,
  LORD_ROLL,
  lordStatsAtLevel,
  TYPE_GAIN_RANGES,
  typeRollProblem,
  type UnitTypeRoll,
} from "./unit-stats.ts";

// Stat growth and unit types (M1-08C; GAME_DESIGN §6 → Stat growth and unit types, RESOLVED-56).
// Reference values are the section's Brand 3★ worked examples.

function loadUnit(id: string): Unit {
  const path = new URL(`../../../data/content/units/${id}.json`, import.meta.url);
  return UnitSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

const brand = loadUnit("brand");

function form(id: string): Form {
  const found = brand.forms.find((f) => f.id === id);
  if (!found) throw new Error(`brand has no form ${id}`);
  return found;
}

const brand3 = form("brand-3");
const brandOmni = form("brand-omni");
const ANIMA: UnitTypeRoll = { type: "anima", gains: { hp: 7, atk: 0, def: 0, rec: -2 } };

describe("lordStatsAtLevel", () => {
  it("matches the Brand 3★ worked examples", () => {
    expect(lordStatsAtLevel(brand3, 1)).toEqual({ hp: 1484, atk: 630, def: 517, rec: 404 });
    expect(lordStatsAtLevel(brand3, 20)).toEqual({ hp: 1987, atk: 769, def: 657, rec: 549 });
    expect(lordStatsAtLevel(brand3, 40)).toEqual({ hp: 2517, atk: 917, def: 806, rec: 702 });
  });

  it("is stats.base for a single-level form", () => {
    const flat: Form = { ...brand3, maxLevel: 1 };
    expect(lordStatsAtLevel(flat, 1)).toEqual(brand3.stats.base);
  });
});

describe("formStatsAtLevel", () => {
  it("adds the persisted per-level gains pre-Omni (Anima worked examples)", () => {
    expect(formStatsAtLevel(brand3, 1, ANIMA)).toEqual({ hp: 1484, atk: 630, def: 517, rec: 404 });
    expect(formStatsAtLevel(brand3, 20, ANIMA)).toEqual({
      hp: 2120,
      atk: 769,
      def: 657,
      rec: 511,
    });
    expect(formStatsAtLevel(brand3, 40, ANIMA)).toEqual({
      hp: 2790,
      atk: 917,
      def: 806,
      rec: 624,
    });
  });

  it("applies each type's gains and losses", () => {
    const at20 = (roll: UnitTypeRoll) => formStatsAtLevel(brand3, 20, roll);
    expect(at20({ type: "breaker", gains: { hp: 0, atk: 3, def: -1, rec: 0 } })).toEqual({
      hp: 1987,
      atk: 769 + 57,
      def: 657 - 19,
      rec: 549,
    });
    expect(at20({ type: "guardian", gains: { hp: 0, atk: 0, def: 2, rec: 0 } })).toEqual({
      hp: 1987,
      atk: 769,
      def: 657 + 38,
      rec: 549,
    });
    expect(at20({ type: "oracle", gains: { hp: 0, atk: 0, def: -2, rec: 4 } })).toEqual({
      hp: 1987,
      atk: 769,
      def: 657 - 38,
      rec: 549 + 76,
    });
    expect(at20(LORD_ROLL)).toEqual(lordStatsAtLevel(brand3, 20));
  });

  it("never drops a stat below 1", () => {
    const tiny: Form = {
      ...brand3,
      stats: {
        base: { hp: 10, atk: 10, def: 2, rec: 2 },
        max: { hp: 20, atk: 20, def: 3, rec: 3 },
      },
    };
    const oracle: UnitTypeRoll = { type: "oracle", gains: { hp: 0, atk: 0, def: -2, rec: 2 } };
    expect(formStatsAtLevel(tiny, 40, oracle).def).toBe(1);
  });

  it("ignores the gains on an Omni form (fixed stats)", () => {
    expect(formStatsAtLevel(brandOmni, 150, ANIMA)).toEqual(brandOmni.stats.max);
    expect(formStatsAtLevel(brandOmni, 75, ANIMA)).toEqual(lordStatsAtLevel(brandOmni, 75));
  });
});

describe("formStatsAtLevel reference table (M1-08D)", () => {
  // Brand 3★ (M = 40) at level 1, two intermediate levels, and max, for one persisted roll per
  // type: [hp, atk, def, rec] from GAME_DESIGN §6 `max(1, lord(L) + gain × (L − 1))`.
  type Row = readonly [number, number, number, number];
  const CASES: readonly {
    roll: UnitTypeRoll;
    expected: Readonly<Record<1 | 10 | 30 | 40, Row>>;
  }[] = [
    {
      roll: LORD_ROLL,
      expected: {
        1: [1484, 630, 517, 404],
        10: [1722, 696, 583, 472],
        30: [2252, 843, 731, 625],
        40: [2517, 917, 806, 702],
      },
    },
    {
      roll: ANIMA,
      expected: {
        1: [1484, 630, 517, 404],
        10: [1785, 696, 583, 454],
        30: [2455, 843, 731, 567],
        40: [2790, 917, 806, 624],
      },
    },
    {
      roll: { type: "breaker", gains: { hp: 0, atk: 3, def: -1, rec: 0 } },
      expected: {
        1: [1484, 630, 517, 404],
        10: [1722, 723, 574, 472],
        30: [2252, 930, 702, 625],
        40: [2517, 1034, 767, 702],
      },
    },
    {
      roll: { type: "guardian", gains: { hp: 0, atk: 0, def: 2, rec: -1 } },
      expected: {
        1: [1484, 630, 517, 404],
        10: [1722, 696, 601, 463],
        30: [2252, 843, 789, 596],
        40: [2517, 917, 884, 663],
      },
    },
    {
      roll: { type: "oracle", gains: { hp: 0, atk: 0, def: -2, rec: 4 } },
      expected: {
        1: [1484, 630, 517, 404],
        10: [1722, 696, 565, 508],
        30: [2252, 843, 673, 741],
        40: [2517, 917, 728, 858],
      },
    },
    {
      roll: { type: "rex", gains: { hp: 12, atk: 2, def: 1, rec: 2 } },
      expected: {
        1: [1484, 630, 517, 404],
        10: [1830, 714, 592, 490],
        30: [2600, 901, 760, 683],
        40: [2985, 995, 845, 780],
      },
    },
  ];

  for (const { roll, expected } of CASES) {
    it(`pins ${roll.type} at levels 1, 10, 30, and 40 using the stored roll`, () => {
      expect(typeRollProblem(roll)).toBeUndefined();
      for (const [level, [hp, atk, def, rec]] of Object.entries(expected)) {
        expect(formStatsAtLevel(brand3, Number(level), roll)).toEqual({ hp, atk, def, rec });
      }
    });
  }
});

describe("typeRollProblem", () => {
  it("accepts every type's range endpoints", () => {
    for (const [type, ranges] of Object.entries(TYPE_GAIN_RANGES)) {
      for (const pick of [0, 1] as const) {
        const gains = {
          hp: ranges.hp[pick],
          atk: ranges.atk[pick],
          def: ranges.def[pick],
          rec: ranges.rec[pick],
        };
        expect(typeRollProblem({ type: type as UnitTypeRoll["type"], gains })).toBeUndefined();
      }
    }
  });

  it("rejects gains outside the type's range and non-integers", () => {
    expect(typeRollProblem({ type: "anima", gains: { hp: 11, atk: 0, def: 0, rec: -1 } })).toMatch(
      /gains\.hp/,
    );
    expect(typeRollProblem({ type: "lord", gains: { hp: 0, atk: 1, def: 0, rec: 0 } })).toMatch(
      /gains\.atk/,
    );
    expect(
      typeRollProblem({ type: "breaker", gains: { hp: 0, atk: 1.5, def: -1, rec: 0 } }),
    ).toMatch(/gains\.atk/);
  });
});

describe("createBattle with a leveled member", () => {
  const setupWith = (member: SquadMemberSetup): BattleSetup => ({
    squad: [member],
    leaderIndex: 0,
    waves: [[makeEnemy("slime")]],
  });

  it("derives stats from level and the persisted type roll, identically on replay", () => {
    const setup = setupWith({ unit: brand, formId: "brand-3", level: 20, unitType: ANIMA });
    const first = createBattle(setup, 1);
    const replay = createBattle(setup, 99);
    // Brand 3★ has no HP passive, so max HP is the typed value.
    expect(first.party[0]?.stats).toEqual({ hp: 2120, atk: 769, def: 657, rec: 511 });
    expect(first.party[0]?.hp).toBe(2120);
    expect(replay.party[0]?.stats).toEqual(first.party[0]?.stats);
  });

  it("uses Lord stats when no type roll is given, and fixed stats on Omni", () => {
    const lord = createBattle(setupWith({ unit: brand, formId: "brand-3", level: 40 }), 1);
    expect(lord.party[0]?.stats.atk).toBe(917);
    const omni = createBattle(
      setupWith({ unit: brand, formId: "brand-omni", level: 150, unitType: ANIMA }),
      1,
    );
    expect(omni.party[0]?.stats.atk).toBe(brandOmni.stats.max.atk);
  });

  it("rejects an out-of-range level or type roll", () => {
    expect(() => createBattle(setupWith({ unit: brand, formId: "brand-3", level: 41 }), 1)).toThrow(
      /squad\[0\]\.level/,
    );
    const bad: UnitTypeRoll = { type: "guardian", gains: { hp: 0, atk: 0, def: 4, rec: 0 } };
    expect(() =>
      createBattle(setupWith({ unit: brand, formId: "brand-3", level: 1, unitType: bad }), 1),
    ).toThrow(BattleSetupError);
  });
});
