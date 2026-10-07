import { describe, expect, it } from "vitest";
import {
  BATTLE_ITEMS,
  fillUpSlots,
  itemLoadoutKey,
  parseItemLoadout,
  restoreItemSlots,
  setSlot,
  slotChoices,
  slotMax,
} from "./item-loadout.ts";

describe("Begin Quest item loadout (M3-04K)", () => {
  it("accepts empty or five distinct battle-item slots with counts 1–10", () => {
    expect(parseItemLoadout([])).toEqual([]);
    const entries = BATTLE_ITEMS.slice(0, 5).map((item, i) => ({
      item: item.id,
      count: i === 0 ? 10 : 1,
    }));
    expect(parseItemLoadout(entries)).toEqual(entries);
    expect(parseItemLoadout(BATTLE_ITEMS.map((item) => ({ item: item.id, count: 1 })))).toBeNull();
  });
  it("rejects materials, unknown items, duplicates and invalid counts/shapes", () => {
    for (const count of [0, 11, 1.5, -1, "1", null, Number.NaN])
      expect(parseItemLoadout([{ item: "dew-tonic", count }])).toBeNull();
    for (const value of [
      null,
      {},
      [null],
      ["dew-tonic"],
      [{ item: "crown-shard", count: 1 }],
      [{ item: "missing", count: 1 }],
      [{ item: "dew-tonic", count: 1, effects: [] }],
      [
        { item: "dew-tonic", count: 1 },
        { item: "dew-tonic", count: 2 },
      ],
    ])
      expect(parseItemLoadout(value)).toBeNull();
  });
  it("preserves five slot positions, clamps to current stock and drops spent/duplicate/material entries", () => {
    expect(
      restoreItemSlots(
        [
          { item: "dew-tonic", count: 10 },
          null,
          { item: "dew-tonic", count: 1 },
          { item: "bitterleaf", count: 1 },
          { item: "crown-shard", count: 1 },
        ],
        [
          { item_id: "dew-tonic", count: 3 },
          { item_id: "crown-shard", count: 5 },
        ],
      ),
    ).toEqual([{ item: "dew-tonic", count: 3 }, null, null, null, null]);
    expect(restoreItemSlots(null, [])).toEqual(Array(5).fill(null));
    expect(
      restoreItemSlots([{ item: "dew-tonic", count: 10 }], [{ item_id: "dew-tonic", count: 40 }])[0]
        ?.count,
    ).toBe(10);
  });
  it("remembers each saved squad independently and separates accounts", () => {
    expect(itemLoadoutKey("alice", 0)).not.toBe(itemLoadoutKey("alice", 1));
    expect(itemLoadoutKey("alice", 0)).not.toBe(itemLoadoutKey("bob", 0));
  });
});

describe("Manage Items loadout edits (M8-10_1)", () => {
  const stock = [
    { item_id: "bitterleaf", count: 4 },
    { item_id: "bright-tonic", count: 25 },
    { item_id: "dew-tonic", count: 0 },
    { item_id: "crown-shard", count: 9 },
  ];
  it("fills each set slot up to what is owned, at most 10, and drops spent items", () => {
    const slots = [
      { item: "bitterleaf", count: 1 },
      null,
      { item: "bright-tonic", count: 3 },
      { item: "dew-tonic", count: 2 },
      null,
    ];
    expect(fillUpSlots(slots, stock)).toEqual([
      { item: "bitterleaf", count: 4 },
      null,
      { item: "bright-tonic", count: 10 },
      null,
      null,
    ]);
    expect(slotMax(stock, "bright-tonic")).toBe(10);
    expect(slotMax(stock, "grand-tonic")).toBe(0);
  });
  it("offers owned battle items not already in another slot", () => {
    const slots = setSlot(Array(5).fill(null), 1, { item: "bitterleaf", count: 2 });
    expect(slotChoices(slots, stock, 0).map((item) => item.id)).toEqual(["bright-tonic"]);
    expect(slotChoices(slots, stock, 1).map((item) => item.id)).toEqual([
      "bitterleaf",
      "bright-tonic",
    ]);
  });
});
