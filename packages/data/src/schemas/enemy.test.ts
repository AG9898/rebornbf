import { describe, expect, it } from "vitest";
import { AiRuleSchema, EnemySchema, EnemySkillSchema } from "./enemy.ts";
import { StageSchema } from "./stage.ts";

const attack = {
  moveType: "melee",
  startDelayFrames: 20,
  hitFrames: [0],
  damageDistribution: [100],
  dropChecks: 0,
};

const enemy = {
  id: "test-enemy",
  name: "Test Enemy",
  element: "fire",
  stats: { hp: 1000, atk: 100, def: 100, rec: 100 },
  normalAttack: attack,
  skills: [
    {
      id: "smash",
      name: "Smash",
      attacks: [attack],
      effects: [{ id: "attack.st", value: 1.5, target: "enemy" }],
    },
  ],
  ai: [
    { when: "every_n_turns", n: 2, offset: 1, skill: "smash", target: "random" },
    { when: "default", skill: "normal", target: "random" },
  ],
  drops: {},
};

function issues(result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return result.error?.issues.map((i) => [i.path, i.message]);
}

describe("AiRuleSchema", () => {
  it.each([
    { when: "every_n_turns", n: 3, skill: "smash", target: "random" },
    { when: "hp_threshold_once", hpPercent: 50, skill: "smash", target: "lowest_hp" },
    {
      when: "condition",
      condition: { type: "party_lacks_effect", effect: "mitigation" },
      skill: "normal",
      target: "random",
    },
    {
      when: "condition",
      condition: { type: "party_has_effect", effect: "buff.atk" },
      skill: "smash",
      target: "random",
    },
    { when: "default", skill: "normal", target: "random" },
  ])("accepts %j", (rule) => {
    expect(AiRuleSchema.safeParse(rule).success).toBe(true);
  });

  it.each([
    ["an unknown trigger", { when: "sometimes", skill: "smash", target: "random" }],
    ["a zero turn interval", { when: "every_n_turns", n: 0, skill: "smash", target: "random" }],
    [
      "a threshold of 100%",
      { when: "hp_threshold_once", hpPercent: 100, skill: "smash", target: "random" },
    ],
    [
      "an unknown condition effect",
      {
        when: "condition",
        condition: { type: "party_lacks_effect", effect: "buff.speed" },
        skill: "smash",
        target: "random",
      },
    ],
    ["an unknown target", { when: "default", skill: "normal", target: "everyone" }],
    ["a missing skill", { when: "default", target: "random" }],
    ["an extra key", { when: "default", skill: "normal", target: "random", n: 2 }],
  ])("rejects %s", (_label, rule) => {
    expect(AiRuleSchema.safeParse(rule).success).toBe(false);
  });
});

describe("EnemySkillSchema", () => {
  it("needs an attack or an effect", () => {
    expect(
      issues(EnemySkillSchema.safeParse({ id: "noop", name: "Noop", attacks: [], effects: [] })),
    ).toEqual([[["attacks"], "needs at least one attack or effect"]]);
  });

  it("needs one attack-shape effect per attack", () => {
    expect(
      issues(
        EnemySkillSchema.safeParse({ id: "hit", name: "Hit", attacks: [attack], effects: [] }),
      ),
    ).toEqual([[["effects"], "has 0 attack-shape effects but 1 attacks"]]);
  });
});

describe("EnemySchema", () => {
  it("accepts a valid enemy", () => {
    expect(EnemySchema.safeParse(enemy).success).toBe(true);
  });

  it("rejects an AI rule naming an unknown skill", () => {
    const bad = structuredClone(enemy);
    bad.ai[0] = { ...enemy.ai[0], skill: "missing" } as (typeof enemy.ai)[0];
    expect(issues(EnemySchema.safeParse(bad))).toEqual([
      [["ai", 0, "skill"], 'unknown skill "missing"'],
    ]);
  });

  it("requires exactly one default rule, last", () => {
    const noDefault = { ...enemy, ai: [enemy.ai[0]] };
    expect(issues(EnemySchema.safeParse(noDefault))).toEqual([
      [["ai", 0, "when"], 'the last rule must be "default"'],
    ]);
    const earlyDefault = { ...enemy, ai: [enemy.ai[1], enemy.ai[1]] };
    expect(issues(EnemySchema.safeParse(earlyDefault))).toEqual([
      [["ai", 0, "when"], "the default rule must be the last rule"],
    ]);
  });

  it("rejects duplicate and reserved skill IDs", () => {
    const skill = enemy.skills[0];
    const bad = { ...enemy, skills: [skill, skill, { ...skill, id: "normal" }] };
    expect(issues(EnemySchema.safeParse(bad))).toEqual([
      [["skills", 1, "id"], 'duplicate skill ID "smash"'],
      [["skills", 2, "id"], '"normal" is reserved for the normal attack'],
    ]);
  });

  it("bounds drop rates and BC resistance", () => {
    expect(EnemySchema.safeParse({ ...enemy, drops: { bcResistance: 1.5 } }).success).toBe(false);
    expect(
      EnemySchema.safeParse({ ...enemy, drops: { zel: { rate: 101, amount: 10 } } }).success,
    ).toBe(false);
    expect(
      EnemySchema.safeParse({
        ...enemy,
        drops: { bcResistance: 0.2, items: [{ item: "some-item", rate: 5 }] },
      }).success,
    ).toBe(true);
  });
});

describe("StageSchema", () => {
  it("requires at least one wave and one enemy per wave", () => {
    const stage = { id: "s", name: "S", waves: [{ enemies: [{ enemy: "test-enemy" }] }] };
    expect(StageSchema.safeParse(stage).success).toBe(true);
    expect(StageSchema.safeParse({ ...stage, waves: [] }).success).toBe(false);
    expect(StageSchema.safeParse({ ...stage, waves: [{ enemies: [] }] }).success).toBe(false);
  });

  const mote = { enemy: "test-mote" };
  const dungeon = {
    id: "test-dungeon",
    name: "Test Dungeon",
    dungeon: {
      series: "test-series",
      gate: "story-01-brightmere-outskirts",
      keyItem: { item: "crown-shard", rate: 20 },
    },
    waves: [
      { enemies: [mote] },
      { enemies: [mote] },
      { enemies: [{ ...mote, capture: "always" }] },
    ],
  };

  it("accepts a dungeon stage with a gate, key item, and always-captured final slot", () => {
    expect(StageSchema.safeParse(dungeon).success).toBe(true);
  });

  it("rejects a key item rate above 100% and a self gate", () => {
    const badRate = {
      ...dungeon,
      dungeon: { ...dungeon.dungeon, keyItem: { item: "x", rate: 101 } },
    };
    expect(StageSchema.safeParse(badRate).success).toBe(false);
    const selfGate = { ...dungeon, dungeon: { ...dungeon.dungeon, gate: "test-dungeon" } };
    expect(issues(StageSchema.safeParse(selfGate))).toEqual([
      [["dungeon", "gate"], "a stage cannot gate itself"],
    ]);
  });

  it("accepts a whole-percent ramp from 1 to 100 and rejects 0, fractions, and over 100", () => {
    const withRamp = (ramp: number) => ({ ...dungeon, dungeon: { ...dungeon.dungeon, ramp } });
    expect(StageSchema.safeParse(withRamp(10)).success).toBe(true);
    expect(StageSchema.safeParse(withRamp(100)).success).toBe(true);
    for (const bad of [0, 2.5, 101]) {
      expect(StageSchema.safeParse(withRamp(bad)).success).toBe(false);
    }
  });

  it("rejects a stage that is both story and dungeon", () => {
    const both = { ...dungeon, story: { chapter: 1, number: 1, text: "x" } };
    expect(issues(StageSchema.safeParse(both))).toEqual([
      [["dungeon"], "a stage is a story stage or a dungeon stage, not both"],
    ]);
  });

  it("allows always-captured slots only in a dungeon's final wave", () => {
    const early = {
      ...dungeon,
      waves: [{ enemies: [{ ...mote, capture: "always" }] }, { enemies: [mote] }],
    };
    expect(issues(StageSchema.safeParse(early))).toEqual([
      [["waves", 0, "enemies", 0, "capture"], "always-captured is for the final wave"],
    ]);
    const { dungeon: _placement, ...plain } = dungeon;
    expect(issues(StageSchema.safeParse(plain))).toEqual([
      [["waves", 2, "enemies", 0, "capture"], "only a dungeon stage captures"],
    ]);
  });
});

describe("DropTableSchema capture", () => {
  it("accepts a capture drop and rejects a rate outside 0-100", () => {
    const capture = (rate: number) => ({
      ...enemy,
      drops: { capture: { unit: "moss-mote", rate } },
    });
    expect(EnemySchema.safeParse(capture(25)).success).toBe(true);
    expect(EnemySchema.safeParse(capture(101)).success).toBe(false);
    expect(EnemySchema.safeParse(capture(-1)).success).toBe(false);
  });
});
