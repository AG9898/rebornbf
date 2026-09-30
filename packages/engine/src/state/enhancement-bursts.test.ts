import { type Effect, type EnhancementTree, UnitSchema } from "@bfr/data";
import { describe, expect, it } from "vitest";
import { step } from "../step.ts";
import { makeSetup, makeUnit } from "../test/factories.ts";
import { formAtBurstLevels } from "./burst-levels.ts";
import { createBattle } from "./create-battle.ts";
import { formWithEnhancementBursts } from "./enhancement-bursts.ts";
import type { LeveledMember } from "./types.ts";

const buff: Effect = { id: "buff.crit_dmg", value: 0.5, turns: 3, target: "party" };
const tree: EnhancementTree = [
  {
    id: "final",
    name: "Final",
    cost: 10,
    requires: ["upgrade"],
    changes: [
      {
        kind: "burst.replace",
        ref: { tier: "bb", addedBy: "add", index: 1 },
        effect: { ...buff, value: 1.2, turns: 4 },
      },
      { kind: "burst.duration", refs: [{ tier: "bb", addedBy: "add", index: 1 }], turns: 5 },
    ],
  },
  {
    id: "upgrade",
    name: "Upgrade",
    cost: 10,
    requires: ["add"],
    changes: [
      {
        kind: "burst.replace",
        ref: { tier: "bb", addedBy: "add", index: 1 },
        effect: { ...buff, value: 0.8 },
      },
      { kind: "burst.duration", refs: [{ tier: "bb", addedBy: "add", index: 1 }], turns: 4 },
      {
        kind: "burst.replace",
        ref: { tier: "sbb", index: 0 },
        effect: { id: "buff.atk", value: 1.5, turns: 3, target: "party" },
      },
      { kind: "burst.duration", refs: [{ tier: "ubb", index: 0 }], turns: 5 },
    ],
  },
  {
    id: "add",
    name: "Add",
    cost: 10,
    changes: [
      {
        kind: "burst.add",
        tier: "bb",
        effects: [{ id: "buff.def", value: 0.4, turns: 3, target: "party" }],
      },
      { kind: "burst.add", tier: "ubb", effects: [buff] },
      { kind: "burst.add", tier: "bb", effects: [buff] },
    ],
  },
];

function member(enhancements: EnhancementTree = tree): LeveledMember {
  const unit = makeUnit("sp-burst");
  const form = unit.forms[0];
  if (!form) throw new Error("missing form");
  const burst = form.bursts.bb;
  return {
    unit: UnitSchema.parse({
      ...unit,
      forms: [
        {
          ...form,
          rarity: "omni",
          maxLevel: 150,
          bursts: { bb: burst, sbb: burst, ubb: burst },
          enhancements,
        },
      ],
    }),
    formId: form.id,
    level: 150,
    selectedEnhancements: { optionIds: ["final", "add", "upgrade"], budget: 30, unlocked: true },
  };
}
const battle = (input: LeveledMember) => createBattle({ ...makeSetup(1), squad: [input] }, 7);

describe("SP burst enhancements", () => {
  it("resolves final totals in prerequisite order, addressing flattened additions per tier", () => {
    const state = battle(member());
    const bursts = state.party[0]?.form.bursts;
    // BB has its original ATK, one DEF addition and one Crit addition, not .5 + .8 + 1.2.
    expect(bursts?.bb.effects).toEqual([
      { id: "buff.atk", value: 0.5, turns: 3, target: "party" },
      { id: "buff.def", value: 0.4, turns: 3, target: "party" },
      { ...buff, value: 1.2, turns: 5 },
    ]);
    expect(bursts?.sbb?.effects).toEqual([
      { id: "buff.atk", value: 1.5, turns: 3, target: "party" },
    ]);
    expect(bursts?.ubb?.effects).toEqual([
      { id: "buff.atk", value: 0.5, turns: 5, target: "party" },
      buff,
    ]);
    expect(bursts?.bb.cost).toBe(20);
    expect(bursts?.bb.attacks).toEqual([]);
  });

  it("applies enhanced effects through existing burst handlers", () => {
    const initial = battle(member());
    const charged = { ...initial, party: initial.party.map((unit) => ({ ...unit, bc: 20 })) };
    const result = step(charged, [{ type: "burst", tick: 0, actor: "p0", tier: "bb" }]);
    expect(result.events.filter((event) => event.type === "EffectApplied")).toMatchObject([
      { effect: { id: "buff.atk", value: 0.5, turns: 3 } },
      { effect: { id: "buff.def", value: 0.4, turns: 3 } },
      { effect: { id: "buff.crit_dmg", value: 1.2, turns: 5 } },
    ]);
    expect(step(charged, [{ type: "burst", tick: 0, actor: "p0", tier: "bb" }])).toEqual(result);
  });

  it("keeps shared content and different battle selections independent, including allies", () => {
    const input = member();
    const original = structuredClone(input);
    const full = battle(input);
    const baseOnly = battle({
      ...input,
      selectedEnhancements: { optionIds: ["add"], budget: 10, unlocked: true },
    });
    expect(baseOnly.party[0]?.form.bursts.bb.effects.at(-1)).toEqual(buff);
    expect(battle(input)).toEqual(full);
    expect(input).toEqual(original);
    expect(
      battle({
        ...input,
        selectedEnhancements: {
          budget: 30,
          unlocked: true,
          optionIds: ["upgrade", "final", "add"],
        },
      }),
    ).toEqual(full);
    const ally = createBattle(
      {
        ...makeSetup(1),
        squad: [{ ...input, selectedEnhancements: undefined }],
        ally: { ...input, kind: "duplicate" },
      },
      7,
    );
    expect(ally.party[1]?.form.bursts).toEqual(full.party[0]?.form.bursts);
    expect(ally.party[0]?.form.bursts.bb.effects).toHaveLength(1);
  });

  it.each([1, 5, 10])("preserves burst-level scaling without selections at level %s", (level) => {
    const input = member();
    const burstLevels = { bb: level, sbb: level };
    const form = input.unit.forms[0];
    if (!form) throw new Error("missing form");
    const absent = battle({ ...input, burstLevels, selectedEnhancements: undefined });
    const empty = battle({
      ...input,
      burstLevels,
      selectedEnhancements: { optionIds: [], budget: 0, unlocked: false },
    });
    expect(empty).toEqual(absent);
    expect(absent.party[0]?.form).toEqual(formAtBurstLevels(form, burstLevels));
    expect(formWithEnhancementBursts(form, [])).toBe(form);
  });

  it("replaces entire ranged effects rather than mixing old and new fields", () => {
    const replacement: Effect = {
      id: "bb.fill_on_hit",
      value: 0,
      min: 4,
      max: 7,
      turns: 4,
      target: "party",
    };
    const input = member();
    const form = input.unit.forms[0];
    if (!form) throw new Error("missing form");
    const unit = UnitSchema.parse({
      ...input.unit,
      forms: [
        {
          ...form,
          enhancements: [
            {
              id: "range",
              name: "Range",
              cost: 10,
              changes: [
                { kind: "burst.replace", ref: { tier: "bb", index: 0 }, effect: replacement },
              ],
            },
          ],
          bursts: {
            ...form.bursts,
            bb: {
              ...form.bursts.bb,
              effects: [{ id: "bb.fill_on_hit", value: 3, turns: 3, target: "party" }],
            },
          },
        },
      ],
    });
    expect(
      battle({
        ...input,
        unit,
        selectedEnhancements: { optionIds: ["range"], budget: 10, unlocked: true },
      }).party[0]?.form.bursts.bb.effects,
    ).toEqual([replacement]);
  });

  it("rejects competing independent edits rather than guessing precedence", () => {
    const input = member(
      ["one", "two"].map((id) => ({
        id,
        name: id,
        cost: 10,
        changes: [
          { kind: "burst.duration", refs: [{ tier: "bb", index: 0 }], turns: id === "one" ? 4 : 5 },
        ],
      })),
    );
    expect(() =>
      battle({
        ...input,
        selectedEnhancements: { optionIds: ["two", "one"], budget: 20, unlocked: true },
      }),
    ).toThrow(/selectedEnhancements: ambiguous SP burst edits/);
  });
});
