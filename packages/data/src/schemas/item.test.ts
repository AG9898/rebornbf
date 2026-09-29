import { describe, expect, it } from "vitest";
import { ItemContentSchema, ItemSchema, MaterialItemSchema } from "./item.ts";

const potion = {
  id: "test-potion",
  name: "Test Potion",
  target: "single",
  effects: [{ kind: "heal", amount: 1000 }],
};

describe("ItemSchema", () => {
  it.each([
    ["heal", { kind: "heal", amount: 1000 }],
    ["cure (all ailments)", { kind: "cure" }],
    ["cure (listed ailments)", { kind: "cure", ailments: ["poison", "curse"] }],
    ["revive", { kind: "revive", hpPercent: 50 }],
    ["bb_fill", { kind: "bb_fill", bc: 12.5 }],
  ])("accepts a %s item", (_, effect) => {
    expect(ItemSchema.safeParse({ ...potion, effects: [effect] }).success).toBe(true);
  });

  it("accepts party items with several effects", () => {
    const item = {
      ...potion,
      target: "party",
      effects: [
        { kind: "revive", hpPercent: 100 },
        { kind: "bb_fill", bc: 60 },
      ],
    };
    expect(ItemSchema.safeParse(item).success).toBe(true);
  });

  it.each([
    ["no effects", { effects: [] }],
    ["an unknown kind", { effects: [{ kind: "teleport" }] }],
    ["a zero heal", { effects: [{ kind: "heal", amount: 0 }] }],
    ["a fractional heal", { effects: [{ kind: "heal", amount: 1.5 }] }],
    ["an empty cure list", { effects: [{ kind: "cure", ailments: [] }] }],
    ["an unknown ailment", { effects: [{ kind: "cure", ailments: ["sleep"] }] }],
    ["a 0% revive", { effects: [{ kind: "revive", hpPercent: 0 }] }],
    ["a 101% revive", { effects: [{ kind: "revive", hpPercent: 101 }] }],
    ["a zero fill", { effects: [{ kind: "bb_fill", bc: 0 }] }],
    ["an unknown target", { target: "enemies" }],
    ["a non-kebab ID", { id: "Test_Potion" }],
    ["an extra field", { price: 10 }],
    [
      "two revives",
      {
        effects: [
          { kind: "revive", hpPercent: 10 },
          { kind: "revive", hpPercent: 20 },
        ],
      },
    ],
  ])("rejects %s", (_, patch) => {
    expect(ItemSchema.safeParse({ ...potion, ...patch }).success).toBe(false);
  });
});

describe("MaterialItemSchema (M4-02D)", () => {
  const shard = { id: "test-shard", kind: "material", name: "Test Shard" };

  it("accepts a material item, and item content accepts battle and material items", () => {
    expect(MaterialItemSchema.safeParse(shard).success).toBe(true);
    expect(ItemContentSchema.safeParse(shard).success).toBe(true);
    expect(ItemContentSchema.safeParse(potion).success).toBe(true);
    expect(ItemContentSchema.safeParse({ ...potion, kind: "battle" }).success).toBe(true);
  });

  it("keeps material items out of battle and battle fields off material items", () => {
    expect(ItemSchema.safeParse(shard).success).toBe(false);
    expect(ItemContentSchema.safeParse({ ...shard, target: "single" }).success).toBe(false);
    expect(ItemContentSchema.safeParse({ ...potion, kind: "material" }).success).toBe(false);
  });
});
